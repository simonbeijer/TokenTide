import { parseClock } from './clock'

/** The weekday (0 is Sunday, as in `Date.getDay`) and clock time "HH:MM" of the Weekly reset, in local time. */
export interface WeeklyReset {
  weekday: number
  clock: string
}

/** The next Weekly reset after `now`. Once a reset has come, the next one is a week later. */
export function nextWeeklyReset(reset: WeeklyReset, now: Date): Date {
  if (!Number.isInteger(reset.weekday) || reset.weekday < 0 || reset.weekday > 6) {
    throw new Error(`Not a weekday: ${JSON.stringify(reset.weekday)}`)
  }
  const { hours, minutes } = parseClock(reset.clock)

  const next = new Date(now)
  next.setDate(now.getDate() + ((reset.weekday - now.getDay() + 7) % 7))
  next.setHours(hours, minutes, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 7)
  return next
}
