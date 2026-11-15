import type { StartTime } from './entry'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const twoDigits = (value: number) => String(value).padStart(2, '0')

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** How the list shows a Start time: "Now", "23:30", "05:00 tomorrow", or with the date when older. */
export function startTimeLabel(startTime: StartTime, now: Date): string {
  if (startTime === 'Now') return 'Now'
  const at = new Date(startTime.at)
  const clock = `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(at, now)) return clock
  if (sameDay(at, tomorrow)) return `${clock} tomorrow`
  return `${clock}, ${months[at.getMonth()]} ${at.getDate()}`
}
