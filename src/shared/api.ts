import type { ClaudeLocation } from './claude'
import type { Entry, RunOptions, StartChoice, WakeOptions } from './entry'
import type { LogLine } from './log'
import type { WeeklyReset } from './weeklyReset'

/** The two values the user types into the Status panel. */
export interface StatusValues {
  /** When the current Window ends, as an ISO timestamp, from the typed clock time: at most 5 hours ahead, otherwise already passed. */
  windowEnd?: string
  weeklyReset?: WeeklyReset
}

/** What the preload script exposes to the app window as `window.tokentide`. */
export interface TokenTideApi {
  listEntries(): Promise<Entry[]>
  addWake(start: StartChoice, options: WakeOptions): Promise<Entry>
  addRun(start: StartChoice, options: RunOptions): Promise<Entry>
  /** The Project folders the user has picked before. */
  listProjects(): Promise<string[]>
  /** Lets the user pick a folder and saves it as a Project. Undefined when the user cancels. */
  chooseProject(): Promise<string | undefined>
  stopEntry(id: string): Promise<void>
  /** Removes an Entry that is not Running. A Running Entry is left as it is. */
  removeEntry(id: string): Promise<void>
  onEntriesChanged(listener: (entries: Entry[]) => void): () => void
  listLog(): Promise<LogLine[]>
  onLogLine(listener: (line: LogLine) => void): () => void
  getClaude(): Promise<ClaudeLocation>
  /** Sets the path to Claude. An empty path lets the app find Claude by itself again. */
  setClaudePath(path: string): Promise<ClaudeLocation>
  getStatusValues(): Promise<StatusValues>
  /** Called when the app itself changes the values, such as a Wake that recalculates the Window end. */
  onStatusValuesChanged(listener: (values: StatusValues) => void): () => void
  /** Sets the Window end to the next time the clock shows `clock` ("HH:MM"). */
  setWindowEnd(clock: string): Promise<StatusValues>
  setWeeklyReset(reset: WeeklyReset): Promise<StatusValues>
}

export const channels = {
  listEntries: 'entries:list',
  addWake: 'entries:add-wake',
  addRun: 'entries:add-run',
  listProjects: 'projects:list',
  chooseProject: 'projects:choose',
  stopEntry: 'entries:stop',
  removeEntry: 'entries:remove',
  entriesChanged: 'entries:changed',
  listLog: 'log:list',
  logLine: 'log:line',
  getClaude: 'claude:get',
  setClaudePath: 'claude:set-path',
  getStatusValues: 'status:get',
  statusValuesChanged: 'status:changed',
  setWindowEnd: 'status:set-window-end',
  setWeeklyReset: 'status:set-weekly-reset'
} as const
