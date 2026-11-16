import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { channels, type TokenTideApi } from '../shared/api'
import type { Entry } from '../shared/entry'
import type { LogLine } from '../shared/log'

const api: TokenTideApi = {
  listEntries: () => ipcRenderer.invoke(channels.listEntries),
  addWake: (start, options) => ipcRenderer.invoke(channels.addWake, start, options),
  stopEntry: (id) => ipcRenderer.invoke(channels.stopEntry, id),
  onEntriesChanged(listener) {
    const handler = (_event: IpcRendererEvent, entries: Entry[]) => listener(entries)
    ipcRenderer.on(channels.entriesChanged, handler)
    return () => ipcRenderer.removeListener(channels.entriesChanged, handler)
  },
  listLog: () => ipcRenderer.invoke(channels.listLog),
  onLogLine(listener) {
    const handler = (_event: IpcRendererEvent, line: LogLine) => listener(line)
    ipcRenderer.on(channels.logLine, handler)
    return () => ipcRenderer.removeListener(channels.logLine, handler)
  }
}

contextBridge.exposeInMainWorld('tokentide', api)
