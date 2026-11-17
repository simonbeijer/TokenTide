import { parseClock } from '../shared/clock'

/** The first time the clock shows `clock` ("HH:MM", local time) after the Start time. Never the Start time itself. */
export function hardStopAfter(clock: string, startTime: Date): Date {
  const { hours, minutes } = parseClock(clock)
  const hardStop = new Date(startTime)
  hardStop.setHours(hours, minutes, 0, 0)
  if (hardStop <= startTime) hardStop.setDate(hardStop.getDate() + 1)
  return hardStop
}

/** Whether a Run must not be running at `now`. Without a Hard stop, it never passes. */
export function hardStopPassed(hardStop: Date | undefined, now: Date): boolean {
  return hardStop !== undefined && now >= hardStop
}
