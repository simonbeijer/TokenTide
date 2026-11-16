import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { channels } from '../shared/api'
import type { StartChoice, WakeOptions } from '../shared/entry'
import { createEntryList } from './entryList'
import { createEntryStore } from './entryStore'
import { runWakeAttempt } from './wakeAttempt'

// A later ticket adds a fallback through the login shell and a setting for the path.
const claudePath = join(homedir(), '.local', 'bin', 'claude')

const entries = createEntryList({
  runWakeAttempt: (signal) => runWakeAttempt({ claudePath, signal }),
  store: createEntryStore(join(app.getPath('userData'), 'entries.json'))
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
ipcMain.handle(channels.stopEntry, (_event, id: string) => entries.stop(id))

entries.onChange((list) => {
  for (const appWindow of BrowserWindow.getAllWindows()) {
    appWindow.webContents.send(channels.entriesChanged, list)
  }
})

// Compare the list with the clock often, instead of one long timer that would stop while the computer sleeps.
const clockCheckInterval = 30_000

void app.whenReady().then(() => {
  entries.checkClock()
  setInterval(() => entries.checkClock(), clockCheckInterval)
  powerMonitor.on('resume', () => entries.checkClock())
  createAppWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createAppWindow()
  })
})
