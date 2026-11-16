import type { Entry, StartChoice, WakeOptions } from './entry'
import type { LogLine } from './log'

/** What the preload script exposes to the app window as `window.tokentide`. */
export interface TokenTideApi {
  listEntries(): Promise<Entry[]>
  addWake(start: StartChoice, options: WakeOptions): Promise<Entry>
  stopEntry(id: string): Promise<void>
  onEntriesChanged(listener: (entries: Entry[]) => void): () => void
  listLog(): Promise<LogLine[]>
  onLogLine(listener: (line: LogLine) => void): () => void
}

export const channels = {
  listEntries: 'entries:list',
  addWake: 'entries:add-wake',
  stopEntry: 'entries:stop',
  entriesChanged: 'entries:changed',
  listLog: 'log:list',
  logLine: 'log:line'
} as const
