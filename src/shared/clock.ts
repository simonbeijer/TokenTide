const clockPattern = /^([01]\d|2[0-3]):([0-5]\d)$/

/** The hours and minutes of a clock time "HH:MM". Throws for anything else. */
export function parseClock(clock: string): { hours: number; minutes: number } {
  const match = clockPattern.exec(clock)
  if (!match) throw new Error(`Not a clock time: ${JSON.stringify(clock)}`)
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

const twoDigits = (value: number) => String(value).padStart(2, '0')

/** The clock time "HH:MM" of a moment, in local time. */
export function formatClock(at: Date): string {
  return `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`
}
