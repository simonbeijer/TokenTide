import { randomUUID } from 'node:crypto'
import type { Entry, EntryStatus } from '../shared/entry'
import type { AttemptOutcome } from './attemptOutcome'

export interface EntryListDeps {
  runWakeAttempt: () => Promise<AttemptOutcome>
}

type Listener = (entries: Entry[]) => void

export function createEntryList({ runWakeAttempt }: EntryListDeps) {
  let entries: Entry[] = []
  const listeners = new Set<Listener>()

  const list = () => entries.map((entry) => ({ ...entry }))
  const notify = () => listeners.forEach((listener) => listener(list()))
  const setStatus = (id: string, status: EntryStatus) => {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, status } : entry))
    notify()
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
      notify()
      start(entry.id)
      return { ...entry }
    }
  }
}
