/** How the Status panel shows a time left: "45 min", "2 h 15 min", or "3 d 4 h" from a day up. A part of a minute counts as a whole one. */
export function durationLabel(milliseconds: number): string {
  const totalMinutes = Math.ceil(milliseconds / 60_000)
  const minutes = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24
  const days = Math.floor(totalHours / 24)

  const parts =
    days > 0
      ? [`${days} d`, hours > 0 && `${hours} h`]
      : [totalHours > 0 && `${totalHours} h`, (minutes > 0 || totalHours === 0) && `${minutes} min`]
  return parts.filter(Boolean).join(' ')
}
