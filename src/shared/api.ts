import type { Entry, StartChoice } from './entry'

/** What the preload script exposes to the app window as `window.tokentide`. */
export interface TokenTideApi {
  listEntries(): Promise<Entry[]>
  addWake(start: StartChoice): Promise<Entry>
  onEntriesChanged(listener: (entries: Entry[]) => void): () => void
}

export const channels = {
  listEntries: 'entries:list',
  addWake: 'entries:add-wake',
  entriesChanged: 'entries:changed'
} as const
