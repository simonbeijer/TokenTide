import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { channels } from '../shared/api'
import { createEntryList } from './entryList'
import { createEntryStore } from './entryStore'
import { runWakeAttempt } from './wakeAttempt'

// A later ticket adds a fallback through the login shell and a setting for the path.
const claudePath = join(homedir(), '.local', 'bin', 'claude')

const entries = createEntryList({
  runWakeAttempt: () => runWakeAttempt({ claudePath }),
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
ipcMain.handle(channels.addWake, () => entries.addWake())

entries.onChange((list) => {
  for (const appWindow of BrowserWindow.getAllWindows()) {
    appWindow.webContents.send(channels.entriesChanged, list)
  }
})

void app.whenReady().then(() => {
  createAppWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createAppWindow()
  })
})
