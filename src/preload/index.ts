import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { channels, type TokenTideApi } from '../shared/api'
import type { Entry } from '../shared/entry'

const api: TokenTideApi = {
  listEntries: () => ipcRenderer.invoke(channels.listEntries),
  addWake: () => ipcRenderer.invoke(channels.addWake),
  onEntriesChanged(listener) {
    const handler = (_event: IpcRendererEvent, entries: Entry[]) => listener(entries)
    ipcRenderer.on(channels.entriesChanged, handler)
    return () => ipcRenderer.removeListener(channels.entriesChanged, handler)
  }
}

contextBridge.exposeInMainWorld('tokentide', api)
