/** A Window is 5 hours long. */
export const windowLength = 5 * 60 * 60_000

export interface WindowStatus {
  /** The current Window: how much of it has gone (0 to 1) and the milliseconds until it ends. Null when there is none. */
  current: { filled: number; endsIn: number } | null
  /** Milliseconds until the next Window can start; 0 means it can start now. */
  nextStartsIn: number
}

/** What the Status panel shows for the Windows, from the Window end the user typed in. */
export function windowStatus(windowEnd: Date | undefined, now: Date): WindowStatus {
  const endsIn = windowEnd ? windowEnd.getTime() - now.getTime() : 0
  if (endsIn <= 0) return { current: null, nextStartsIn: 0 }
  const filled = Math.min(1, Math.max(0, (windowLength - endsIn) / windowLength))
  return { current: { filled, endsIn }, nextStartsIn: endsIn }
}
