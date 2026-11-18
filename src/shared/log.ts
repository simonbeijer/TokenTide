import type { EntryStatus } from './entry'

/** One line in the log: one event, either an Attempt that ended or an Entry that changed status without an Attempt. */
export interface LogLine {
  /** When the event happened, as an ISO timestamp. */
  time: string
  /** The Project folder. A Wake has no Project, so it is missing for a Wake. */
  project?: string
  status: EntryStatus
  sessionId?: string
  /** The last line of Claude's answer. */
  lastLine?: string
  /** How many actions Claude was denied, from the result event. Missing when none were. */
  deniedActions?: number
  /** Why the Entry got its status, such as "missed start time" or "not logged in". */
  note?: string
}
