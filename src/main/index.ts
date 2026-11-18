import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerMonitor, Tray } from 'electron'
import { channels, type StatusValues } from '../shared/api'
import type { ClaudeLocation } from '../shared/claude'
import type { RunOptions, StartChoice, WakeOptions } from '../shared/entry'
import { nextWeeklyReset, type WeeklyReset } from '../shared/weeklyReset'
import { locateClaude } from './claudeLocation'
import { createEntryList } from './entryList'
import { createEntryStore } from './entryStore'
import { createLogStore } from './logStore'
import { withProject } from './projects'
import { runRunAttempt } from './runAttempt'
import { type LoginShellAnswer, readLoginShell } from './loginShell'
import { createSettingsStore } from './settingsStore'
import { tideIconBitmap } from './trayIcon'
import { windowEndFrom } from './windowEnd'
import { runWakeAttempt } from './wakeAttempt'

// An app started from Finder gets neither the terminal's PATH nor, always, SHELL, so the login shell is asked once at start.
let loginShellAnswer: LoginShellAnswer = {}
const settings = createSettingsStore(join(app.getPath('userData'), 'settings.json'))
let claude: ClaudeLocation = { found: false }
const locate = () => {
  claude = locateClaude({ home: homedir(), chosen: settings.load().claudePath, loginShellClaude: loginShellAnswer.claude })
  return claude
}
/** What Claude is started with: the app's own environment, but with the login shell's PATH. */
const claudeEnv = (): NodeJS.ProcessEnv => ({ ...process.env, PATH: loginShellAnswer.path ?? process.env.PATH })
const claudeReady = readLoginShell(process.env.SHELL || userInfo().shell || '/bin/zsh').then((answer) => {
  loginShellAnswer = answer
  locate()
})

const sendToAppWindows = (channel: string, value: unknown) => {
  for (const appWindow of BrowserWindow.getAllWindows()) appWindow.webContents.send(channel, value)
}

const logStore = createLogStore(join(app.getPath('userData'), 'log.jsonl'))

/** The full output of every Run goes in its own file, named by when the Run started. */
const runOutputFile = (entryId: string) =>
  join(app.getPath('userData'), 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${entryId}.log`)

const statusValues = (): StatusValues => {
  const { windowEnd, weeklyReset } = settings.load()
  return { windowEnd, weeklyReset }
}

const entries = createEntryList({
  // Without a Claude to start, the Attempt fails at once; the Claude setting tells the user why.
  runWakeAttempt: async (signal) =>
    claude.path ? runWakeAttempt({ claudePath: claude.path, env: claudeEnv(), signal }) : { outcome: 'Failed' },
  runRunAttempt: async (entry, signal, onAnswer) =>
    claude.path && entry.run
      ? runRunAttempt({
          claudePath: claude.path,
          run: entry.run,
          outputFile: runOutputFile(entry.id),
          env: claudeEnv(),
          signal,
          onAnswer
        })
      : { outcome: 'Failed' },
  store: createEntryStore(join(app.getPath('userData'), 'entries.json')),
  log: (line) => {
    logStore.append(line)
    sendToAppWindows(channels.logLine, line)
  },
  windowEnd: {
    get: () => {
      const { windowEnd } = settings.load()
      return windowEnd ? new Date(windowEnd) : undefined
    },
    set: (end) => {
      settings.save({ ...settings.load(), windowEnd: end.toISOString() })
      sendToAppWindows(channels.statusValuesChanged, statusValues())
    }
  }
})

let appWindow: BrowserWindow | undefined

/** Closing the app window ends it, but not the app, so the menu bar icon opens a new one. */
function showAppWindow() {
  if (appWindow && !appWindow.isDestroyed()) {
    appWindow.show()
    appWindow.focus()
  } else appWindow = createAppWindow()
  app.focus({ steal: true })
}

function createAppWindow(): BrowserWindow {
  const created = new BrowserWindow({
    width: 420,
    height: 600,
    title: 'TokenTide',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void created.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void created.loadFile(join(__dirname, '../renderer/index.html'))
  }
  created.on('closed', () => {
    if (appWindow === created) appWindow = undefined
  })
  return created
}

/** Held here, because a Tray that is garbage collected disappears from the menu bar. */
let tray: Tray | undefined

function createTray() {
  const icon = nativeImage.createFromBitmap(tideIconBitmap(16), { width: 16, height: 16 })
  icon.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: tideIconBitmap(32) })
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('TokenTide')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open TokenTide', click: showAppWindow },
      { type: 'separator' },
      { label: 'Quit TokenTide', click: () => app.quit() }
    ])
  )
}

/** Set once every Claude has exited: the quit after that is let through. */
let readyToQuit = false
/** Set while Claude is being ended, so a second quit cannot cut that short and leave Claude running. */
let stopping = false
let askingToQuit = false

/** Stops every Running Entry, which gets Stopped, starts nothing more, and quits once every Claude has exited. */
async function stopAndQuit() {
  if (stopping) return
  stopping = true
  await entries.quit()
  readyToQuit = true
  app.quit()
}

async function confirmQuit() {
  if (askingToQuit || stopping) return
  askingToQuit = true
  // From the menu bar icon with the app window closed, the question would otherwise open behind other apps.
  app.focus({ steal: true })
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Quit', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: 'Quit TokenTide?',
    detail: 'A Running Entry is stopped and gets Stopped. Nothing starts until TokenTide is opened again.'
  })
  askingToQuit = false
  if (response === 0) await stopAndQuit()
}

// Every quit, from the menu bar icon, the app menu or Cmd+Q, asks first. Saying no leaves everything as it was.
app.on('before-quit', (event) => {
  if (readyToQuit) return
  event.preventDefault()
  void confirmQuit()
})
// A menu bar app stays alive with no app window. Listening is enough to keep Electron from quitting.
app.on('window-all-closed', () => {})

ipcMain.handle(channels.listEntries, () => entries.list())
ipcMain.handle(channels.addWake, (_event, start: StartChoice, options: WakeOptions) => entries.addWake(start, options))
ipcMain.handle(channels.addRun, (_event, start: StartChoice, options: RunOptions) => entries.addRun(start, options))
ipcMain.handle(channels.listProjects, () => settings.load().projects ?? [])
ipcMain.handle(channels.chooseProject, async (event) => {
  const appWindow = BrowserWindow.fromWebContents(event.sender)
  const openOptions = { title: 'Choose Project', properties: ['openDirectory' as const, 'createDirectory' as const] }
  const { canceled, filePaths } = appWindow
    ? await dialog.showOpenDialog(appWindow, openOptions)
    : await dialog.showOpenDialog(openOptions)
  const folder = filePaths[0]
  if (canceled || !folder) return undefined
  settings.save({ ...settings.load(), projects: withProject(settings.load().projects, folder) })
  return folder
})
ipcMain.handle(channels.stopEntry, (_event, id: string) => entries.stop(id))
ipcMain.handle(channels.removeEntry, (_event, id: string) => entries.remove(id))
ipcMain.handle(channels.listLog, () => logStore.read())
ipcMain.handle(channels.getClaude, async () => {
  await claudeReady
  return claude
})
ipcMain.handle(channels.setClaudePath, async (_event, path: string) => {
  await claudeReady
  // An empty path hands the choice back to the app, which then finds Claude by itself.
  settings.save({ ...settings.load(), claudePath: path.trim() || undefined })
  return locate()
})

ipcMain.handle(channels.getStatusValues, () => statusValues())
ipcMain.handle(channels.setWindowEnd, (_event, clock: string) => {
  settings.save({ ...settings.load(), windowEnd: windowEndFrom(clock, new Date()).toISOString() })
  entries.refreshWarnings()
  return statusValues()
})
ipcMain.handle(channels.setWeeklyReset, (_event, reset: WeeklyReset) => {
  nextWeeklyReset(reset, new Date()) // Throws for a reset that is not a weekday and a clock time.
  settings.save({ ...settings.load(), weeklyReset: { weekday: reset.weekday, clock: reset.clock } })
  return statusValues()
})

entries.onChange((list) => sendToAppWindows(channels.entriesChanged, list))

// Compare the list with the clock often, instead of one long timer that would stop while the computer sleeps.
const clockCheckInterval = 30_000

void app.whenReady().then(async () => {
  await claudeReady
  entries.checkClock()
  setInterval(() => entries.checkClock(), clockCheckInterval)
  powerMonitor.on('resume', () => entries.checkClock())
  // A question would hold up the shutdown, so the Running Run is stopped without one.
  powerMonitor.on('shutdown', () => void stopAndQuit())
  createTray()
  showAppWindow()
  app.on('activate', () => {
    if (!appWindow) showAppWindow()
  })
})
