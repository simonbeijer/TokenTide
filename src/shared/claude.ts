/** Which Claude the app starts, as shown in the Claude setting. */
export interface ClaudeLocation {
  /** Missing when the app found no Claude and the user has set no path. */
  path?: string
  /** Whether a program that can be started is at the path. */
  found: boolean
  /** Set when the path is the user's own, typed in the app, rather than one the app found. */
  chosen?: true
}
