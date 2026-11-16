/** How late an Entry may be found and still count as on time. Later than this, the computer slept or the app was closed. */
export const missedAfter = 5 * 60_000

/** Whether an Entry found at `now` missed its Start time. Being exactly `missedAfter` late is not missed. */
export function isMissed(startTime: Date, now: Date): boolean {
  return now.getTime() - startTime.getTime() > missedAfter
}
