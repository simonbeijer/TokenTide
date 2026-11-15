import { randomUUID } from 'node:crypto'
import type { Entry, EntryStatus, StartChoice, StartTime } from '../shared/entry'
import type { AttemptOutcome } from './attemptOutcome'
import type { EntryStore } from './entryStore'
import { nextOccurrence } from './startTime'

export interface EntryListDeps {
  runWakeAttempt: () => Promise<AttemptOutcome>
  store: EntryStore
  now?: () => Date
}

type Listener = (entries: Entry[]) => void

export function createEntryList({ runWakeAttempt, store, now = () => new Date() }: EntryListDeps) {
  // Nothing can be running at start, so an Entry still marked Running was cut off by a crash.
  let entries: Entry[] = store
    .load()
    .map((entry) => (entry.status === 'Running' ? { ...entry, status: 'Failed' } : entry))
  store.save(entries)
  const listeners = new Set<Listener>()

  const list = () => entries.map((entry) => ({ ...entry }))
  const saveAndNotify = () => {
    store.save(entries)
    listeners.forEach((listener) => listener(list()))
  }
  const setStatus = (id: string, status: EntryStatus) => {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, status } : entry))
    saveAndNotify()
  }

  const start = (id: string) => {
    setStatus(id, 'Running')
    runWakeAttempt().then(
      (outcome) => setStatus(id, outcome),
      () => setStatus(id, 'Failed')
    )
  }

  return {
    list,
    onChange(listener: Listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Starts every Waiting Entry whose Start time has come. Called often, never as one long timer. */
    checkClock() {
      const current = now().getTime()
      for (const entry of entries) {
        if (entry.status !== 'Waiting' || entry.startTime === 'Now') continue
        if (new Date(entry.startTime.at).getTime() <= current) start(entry.id)
      }
    },
    addWake(choice: StartChoice): Entry {
      const startTime: StartTime = choice === 'Now' ? 'Now' : { at: nextOccurrence(choice.clock, now()).toISOString() }
      const entry: Entry = { id: randomUUID(), kind: 'Wake', startTime, status: 'Waiting' }
      entries = [...entries, entry]
      saveAndNotify()
      if (startTime === 'Now') start(entry.id)
      return { ...entry }
    }
  }
}
