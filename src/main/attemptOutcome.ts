import type { EntryStatus } from '../shared/entry'

export type AttemptOutcome = Extract<EntryStatus, 'Done' | 'Failed'>

interface ClaudeEvent {
  type: string
}

/** Parses one line of `--output-format stream-json` output. Returns undefined for anything that is not an event. */
export function parseEvent(line: string): ClaudeEvent | undefined {
  try {
    const value: unknown = JSON.parse(line)
    if (typeof value === 'object' && value !== null && typeof (value as ClaudeEvent).type === 'string') {
      return value as ClaudeEvent
    }
  } catch {
    // Not JSON: plain text is never read as status.
  }
  return undefined
}

/**
 * Decides how an Attempt ended from Claude's stream-json output and exit code.
 * Done needs both: the last event is a `result` event and the exit code is 0.
 */
export function readAttemptOutcome(lines: string[], exitCode: number | null): AttemptOutcome {
  const events = lines.map(parseEvent).filter((event) => event !== undefined)
  return exitCode === 0 && events.at(-1)?.type === 'result' ? 'Done' : 'Failed'
}
