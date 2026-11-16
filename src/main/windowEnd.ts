import { windowLength } from '../shared/windowStatus'
import { nextOccurrence } from './startTime'

/**
 * The Window end for a typed clock time. A Window ends at most 5 hours ahead, so a clock time
 * whose next occurrence is further away has already passed: it is the last time the clock showed it.
 */
export function windowEndFrom(clock: string, now: Date): Date {
  const next = nextOccurrence(clock, now)
  if (next.getTime() - now.getTime() <= windowLength) return next
  const last = new Date(next)
  last.setDate(last.getDate() - 1)
  return last
}

/** Claude rounds the start of a Window down to the nearest 10 minutes, so a first message at 10:01 starts a Window at 10:00. */
export function roundDownToTenMinutes(at: Date): Date {
  const rounded = new Date(at)
  rounded.setSeconds(0, 0)
  rounded.setMinutes(rounded.getMinutes() - (rounded.getMinutes() % 10))
  return rounded
}

/**
 * The new Window end after an Attempt that started at `attemptStart` got an answer from Claude,
 * or undefined when the answer changes nothing because the Attempt started inside the known Window.
 * The Attempt's start, not its answer, is when the message was sent, so it decides.
 */
export function windowEndAfterAnswer(windowEnd: Date | undefined, attemptStart: Date): Date | undefined {
  if (startsInsideWindow(attemptStart, windowEnd)) return undefined
  return new Date(roundDownToTenMinutes(attemptStart).getTime() + windowLength)
}

/** Whether a Wake due at `startTime` would start inside the known Window, and so start no new one. */
export function startsInsideWindow(startTime: Date, windowEnd: Date | undefined): boolean {
  return windowEnd !== undefined && startTime <= windowEnd
}
