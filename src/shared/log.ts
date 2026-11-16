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
  /** Why the Entry got its status, when there was no Attempt to say it, such as "missed start time". */
  note?: string
}
