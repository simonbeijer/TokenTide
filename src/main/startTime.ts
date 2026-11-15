const clockPattern = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * The next time the clock shows `clock` ("HH:MM", local time), within 24 hours of `now`.
 * The current minute still counts as today, so choosing the clock time it is right now means "due now".
 */
export function nextOccurrence(clock: string, now: Date): Date {
  const match = clockPattern.exec(clock)
  if (!match) throw new Error(`Not a clock time: ${JSON.stringify(clock)}`)

  const today = new Date(now)
  today.setHours(Number(match[1]), Number(match[2]), 0, 0)

  const startOfThisMinute = new Date(now)
  startOfThisMinute.setSeconds(0, 0)
  if (today >= startOfThisMinute) return today

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}
