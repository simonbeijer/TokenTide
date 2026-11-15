import type { Entry } from './entry'

/** What the preload script exposes to the app window as `window.tokentide`. */
export interface TokenTideApi {
  listEntries(): Promise<Entry[]>
  addWake(): Promise<Entry>
  onEntriesChanged(listener: (entries: Entry[]) => void): () => void
}

export const channels = {
  listEntries: 'entries:list',
  addWake: 'entries:add-wake',
  entriesChanged: 'entries:changed'
} as const
