import { parseClock } from '../shared/clock'

/**
 * The next time the clock shows `clock` ("HH:MM", local time), within 24 hours of `now`.
 * The current minute still counts as today, so choosing the clock time it is right now means "due now".
 */
export function nextOccurrence(clock: string, now: Date): Date {
  const { hours, minutes } = parseClock(clock)

  const today = new Date(now)
  today.setHours(hours, minutes, 0, 0)

  const startOfThisMinute = new Date(now)
  startOfThisMinute.setSeconds(0, 0)
  if (today >= startOfThisMinute) return today

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}
