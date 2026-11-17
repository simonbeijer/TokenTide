import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from 'electron'
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

function createAppWindow(): BrowserWindow {
  const appWindow = new BrowserWindow({
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
    void appWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void appWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return appWindow
}

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
  createAppWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createAppWindow()
  })
})
