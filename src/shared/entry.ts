export type EntryStatus = 'Waiting' | 'Running' | 'Done' | 'Limit reached' | 'Stopped' | 'Failed'

export type EntryKind = 'Wake' | 'Run'

/** What the user picks in "+ Add": Now, or a clock time as "HH:MM". */
export type StartChoice = 'Now' | { clock: string }

/** Now, or the moment the chosen clock time comes next, as an ISO timestamp. */
export type StartTime = 'Now' | { at: string }

/** How a Run handles Claude's permission prompts. Nobody can answer them in either mode. */
export type PermissionMode = 'Auto' | 'Skip all prompts'

export const permissionModes: PermissionMode[] = ['Auto', 'Skip all prompts']

/** The models the user can choose for a Run, as Claude's model names. */
export const models = ['opus', 'sonnet', 'haiku'] as const

/** What the user picks for a Run in "+ Add", besides the Start time. */
export interface RunOptions {
  /** The Project's folder. */
  project: string
  prompt: string
  permissionMode: PermissionMode
  model: string
  /** A clock time "HH:MM" after which the Run must not be running. Without it, the Run runs until Claude exits or the user stops it. */
  hardStop?: string
}

export interface Entry {
  id: string
  kind: EntryKind
  startTime: StartTime
  /** Keep making Attempts, one a minute, until one succeeds or the user presses Stop. Always false for a Run. */
  retry: boolean
  status: EntryStatus
  /** A short text shown on the Entry that says why it got its status, such as "missed start time". */
  note?: string
  /** A warning shown on the Entry, such as a Wake that starts inside the known Window and so starts no new one. */
  warning?: string
  /** What a Run does. Missing for a Wake. */
  run?: RunOptions
  /** When a Run's Hard stop passes, as an ISO timestamp: the first time the clock shows it after the Start time. */
  hardStopAt?: string
}

/** What the user picks for a Wake in "+ Add", besides the Start time. */
export interface WakeOptions {
  retry?: boolean
}
