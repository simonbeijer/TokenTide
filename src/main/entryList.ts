import { randomUUID } from 'node:crypto'
import type { Entry, EntryStatus } from '../shared/entry'
import type { AttemptOutcome } from './attemptOutcome'
import type { EntryStore } from './entryStore'

export interface EntryListDeps {
  runWakeAttempt: () => Promise<AttemptOutcome>
  store: EntryStore
}

type Listener = (entries: Entry[]) => void

export function createEntryList({ runWakeAttempt, store }: EntryListDeps) {
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
    addWake(): Entry {
      const entry: Entry = { id: randomUUID(), kind: 'Wake', startTime: 'Now', status: 'Waiting' }
      entries = [...entries, entry]
      saveAndNotify()
      start(entry.id)
      return { ...entry }
    }
  }
}
