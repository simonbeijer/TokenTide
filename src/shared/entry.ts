export type EntryStatus = 'Waiting' | 'Running' | 'Done' | 'Stopped' | 'Failed'

export type EntryKind = 'Wake'

/** What the user picks in "+ Add": Now, or a clock time as "HH:MM". */
export type StartChoice = 'Now' | { clock: string }

/** Now, or the moment the chosen clock time comes next, as an ISO timestamp. */
export type StartTime = 'Now' | { at: string }

export interface Entry {
  id: string
  kind: EntryKind
  startTime: StartTime
  /** Keep making Attempts, one a minute, until one succeeds or the user presses Stop. */
  retry: boolean
  status: EntryStatus
}

/** What the user picks for a Wake in "+ Add", besides the Start time. */
export interface WakeOptions {
  retry?: boolean
}
