import type { EntryStatus } from '../shared/entry'

export type AttemptOutcome = Extract<EntryStatus, 'Done' | 'Failed' | 'Limit reached'>

interface ClaudeEvent {
  type: string
  session_id?: unknown
  result?: unknown
  message?: { content?: unknown; model?: unknown }
  error?: unknown
  permission_denials?: unknown
  apiError?: unknown
  status?: unknown
  rate_limit_info?: { status?: unknown }
}

/** What one Attempt left behind: how it ended, and what the log line needs from Claude's output. */
export interface AttemptReport {
  outcome: AttemptOutcome
  sessionId?: string
  /** The last line of Claude's answer. */
  lastLine?: string
  /** How many actions Claude was denied, from the result event. Missing when none were, or the version does not list them. */
  deniedActions?: number
  /** Why the Attempt failed, when Claude's output says it, such as "not logged in". */
  note?: string
}

/** The Note on an Attempt that Claude Code ended because it is not logged in. */
export const notLoggedInNote = 'not logged in'

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
  if (limitReached(events)) return 'Limit reached'
  if (notLoggedIn(events)) return 'Failed'
  return exitCode === 0 && events.at(-1)?.type === 'result' ? 'Done' : 'Failed'
}

/** Claude Code writes a missing login as a message of its own with this error, and then exits with code 1. */
const notLoggedIn = (events: ClaudeEvent[]) =>
  events.some((event) => event.type === 'assistant' && event.error === 'authentication_failed')

/**
 * Whether Claude's output shows that the plan's usage limit was hit. Every shape is read here and nowhere else,
 * so that it is easy to correct. None of them is verified against a real limit with `-p` yet (see PLAN.md, Facts):
 * - a message with `apiError: "usage_limit_reached"`, as in a session log, or with `error` set to the same;
 * - a `rate_limit_event` whose status, in `rate_limit_info` or at the top level, is "rejected".
 *   The same event with "allowed" or "allowed_warning" only reports the limit and is not a reached one.
 */
const limitReached = (events: ClaudeEvent[]) =>
  events.some(
    (event) =>
      event.apiError === 'usage_limit_reached' ||
      event.error === 'usage_limit_reached' ||
      (event.type === 'rate_limit_event' && (event.rate_limit_info?.status ?? event.status) === 'rejected')
  )

/** The number of denied actions in the last result event. Claude Code before v2.1.259 does not list them. */
function deniedActionsOf(events: ClaudeEvent[]): number | undefined {
  const denials = lastOf(events.filter((event) => event.type === 'result'))?.permission_denials
  return Array.isArray(denials) && denials.length > 0 ? denials.length : undefined
}

/** Reads an Attempt's outcome, session id and last line of the answer. Only JSON events are read, never free text. */
export function readAttemptReport(lines: string[], exitCode: number | null): AttemptReport {
  const events = readEvents(lines)
  const sessionId = lastOf(events.map((event) => event.session_id).filter((id) => typeof id === 'string'))
  const answer = lastOf(events.map(answerText).filter((text) => text !== undefined))
  const lastLine = answer === undefined ? undefined : lastOf(answer.split('\n').map((line) => line.trim()).filter(Boolean))
  const deniedActions = deniedActionsOf(events)
  return {
    outcome: outcomeOf(events, exitCode),
    ...(sessionId !== undefined && { sessionId }),
    ...(lastLine !== undefined && { lastLine }),
    ...(deniedActions !== undefined && { deniedActions }),
    ...(notLoggedIn(events) && { note: notLoggedInNote })
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

/**
 * Whether one line of output shows that Claude answered, so a Window is running. An error that Claude Code
 * writes as a message by itself, such as a login error, carries an `error` field or the model "<synthetic>".
 */
export function isAnswer(line: string): boolean {
  const event = parseEvent(line)
  return event?.type === 'assistant' && event.error === undefined && event.message?.model !== '<synthetic>'
}
