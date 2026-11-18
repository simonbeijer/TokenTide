import type { Entry } from '../shared/entry'
import { hardStopPassed } from './hardStop'

/** The moment an Entry's Start time stands for: its clock time, or for Start time Now the moment a Run was added. */
export function startTimeOf(entry: Entry, now: Date): Date {
  if (entry.startTime !== 'Now') return new Date(entry.startTime.at)
  return entry.addedAt ? new Date(entry.addedAt) : now
}

/**
 * The Waiting Runs whose Start time has come, in the order they get their turn: Start time order,
 * and the order they were added for the same Start time. A Run past its Hard stop must never start, so it is left out.
 */
export function runQueue(entries: Entry[], now: Date): Entry[] {
  return entries
    .filter((entry) => entry.kind === 'Run' && entry.status === 'Waiting')
    .filter((entry) => startTimeOf(entry, now) <= now)
    .filter((entry) => !hardStopPassed(entry.hardStopAt ? new Date(entry.hardStopAt) : undefined, now))
    .sort((a, b) => startTimeOf(a, now).getTime() - startTimeOf(b, now).getTime())
}
