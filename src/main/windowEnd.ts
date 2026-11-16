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
