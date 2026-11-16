import { randomUUID } from 'node:crypto'
import type { Entry, EntryStatus, StartChoice, StartTime, WakeOptions } from '../shared/entry'
import type { AttemptOutcome } from './attemptOutcome'
import type { EntryStore } from './entryStore'
import { nextOccurrence } from './startTime'

/** An Attempt with no answer after this long is ended and counts as failed. */
export const attemptTimeout = 2 * 60_000
/** With Retry, a failed Attempt is followed by a new one this much later. */
export const retryDelay = 60_000

export interface EntryListDeps {
  /** Makes one Attempt. Aborting the signal must end the Attempt; it then counts as failed. */
  runWakeAttempt: (signal: AbortSignal) => Promise<AttemptOutcome>
  store: EntryStore
  now?: () => Date
}

type Listener = (entries: Entry[]) => void

/** What a Running Entry needs in order to be stopped. */
interface ActiveWake {
  attempt?: AbortController
  nextAttempt?: ReturnType<typeof setTimeout>
}

export function createEntryList({ runWakeAttempt, store, now = () => new Date() }: EntryListDeps) {
  // Nothing can be running at start, so an Entry still marked Running was cut off by a crash.
  // Entries saved before Retry existed have no `retry` field and get false.
  let entries: Entry[] = store.load().map((entry) => ({
    ...entry,
    retry: entry.retry ?? false,
    status: entry.status === 'Running' ? 'Failed' : entry.status
  }))
  store.save(entries)
  const listeners = new Set<Listener>()
  const active = new Map<string, ActiveWake>()

  const list = () => entries.map((entry) => ({ ...entry }))
  const saveAndNotify = () => {
    store.save(entries)
    listeners.forEach((listener) => listener(list()))
  }
  const setStatus = (id: string, status: EntryStatus) => {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, status } : entry))
    saveAndNotify()
  }
  const finish = (id: string, status: EntryStatus) => {
    active.delete(id)
    setStatus(id, status)
  }

  const makeAttempt = async (id: string, retry: boolean) => {
    const wake = active.get(id)
    if (!wake) return
    const attempt = new AbortController()
    wake.attempt = attempt
    const timeout = setTimeout(() => attempt.abort(), attemptTimeout)
    let outcome: AttemptOutcome
    try {
      outcome = await runWakeAttempt(attempt.signal)
    } catch {
      outcome = 'Failed'
    } finally {
      clearTimeout(timeout)
    }
    // Stopped while the Attempt was ending: the status is already set.
    if (active.get(id) !== wake) return
    if (outcome === 'Failed' && retry) {
      wake.attempt = undefined
      wake.nextAttempt = setTimeout(() => void makeAttempt(id, retry), retryDelay)
      return
    }
    finish(id, outcome)
  }

  const start = (entry: Entry) => {
    active.set(entry.id, {})
    setStatus(entry.id, 'Running')
    void makeAttempt(entry.id, entry.retry)
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
        if (new Date(entry.startTime.at).getTime() <= current) start(entry)
      }
    },
    addWake(choice: StartChoice, { retry = false }: WakeOptions = {}): Entry {
      const startTime: StartTime = choice === 'Now' ? 'Now' : { at: nextOccurrence(choice.clock, now()).toISOString() }
      const entry: Entry = { id: randomUUID(), kind: 'Wake', startTime, retry, status: 'Waiting' }
      entries = [...entries, entry]
      saveAndNotify()
      if (startTime === 'Now') start(entry)
      return { ...entry }
    },
    /** Ends a Running Entry on purpose: ends any running Attempt and makes no more. */
    stop(id: string) {
      const wake = active.get(id)
      if (!wake) return
      clearTimeout(wake.nextAttempt)
      wake.attempt?.abort()
      finish(id, 'Stopped')
    }
  }
}
