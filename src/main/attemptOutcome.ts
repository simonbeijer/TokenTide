import type { EntryStatus } from '../shared/entry'

export type AttemptOutcome = Extract<EntryStatus, 'Done' | 'Failed'>

interface ClaudeEvent {
  type: string
  session_id?: unknown
  result?: unknown
  message?: { content?: unknown }
}

/** What one Attempt left behind: how it ended, and what the log line needs from Claude's output. */
export interface AttemptReport {
  outcome: AttemptOutcome
  sessionId?: string
  /** The last line of Claude's answer. */
  lastLine?: string
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
  return outcomeOf(readEvents(lines), exitCode)
}

const readEvents = (lines: string[]) => lines.map(parseEvent).filter((event) => event !== undefined)

function outcomeOf(events: ClaudeEvent[], exitCode: number | null): AttemptOutcome {
  return exitCode === 0 && events.at(-1)?.type === 'result' ? 'Done' : 'Failed'
}

/** Reads an Attempt's outcome, session id and last line of the answer. Only JSON events are read, never free text. */
export function readAttemptReport(lines: string[], exitCode: number | null): AttemptReport {
  const events = readEvents(lines)
  const sessionId = lastOf(events.map((event) => event.session_id).filter((id) => typeof id === 'string'))
  const answer = lastOf(events.map(answerText).filter((text) => text !== undefined))
  const lastLine = answer === undefined ? undefined : lastOf(answer.split('\n').map((line) => line.trim()).filter(Boolean))
  return {
    outcome: outcomeOf(events, exitCode),
    ...(sessionId !== undefined && { sessionId }),
    ...(lastLine !== undefined && { lastLine })
  }
}

const lastOf = <T>(items: T[]): T | undefined => items[items.length - 1]

/** The text Claude wrote in one event: the `result` of a result event, or the text blocks of an assistant event. */
function answerText(event: ClaudeEvent): string | undefined {
  if (event.type === 'result' && typeof event.result === 'string') return event.result
  if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return undefined
  const texts = (event.message.content as unknown[])
    .filter((block): block is { type: 'text'; text: string } => {
      const candidate = block as { type?: unknown; text?: unknown }
      return candidate?.type === 'text' && typeof candidate.text === 'string'
    })
    .map((block) => block.text)
  return texts.length > 0 ? texts.join('\n') : undefined
}
