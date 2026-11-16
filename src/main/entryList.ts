import { randomUUID } from 'node:crypto'
import type { Entry, EntryStatus, StartChoice, StartTime, WakeOptions } from '../shared/entry'
import type { AttemptOutcome } from './attemptOutcome'
import type { EntryStore } from './entryStore'
import { isMissed } from './lateness'
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
  const setStatus = (id: string, status: EntryStatus, note?: string) => {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, status, ...(note && { note }) } : entry))
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
    /**
     * Starts every Waiting Entry whose Start time has come. Called often, never as one long timer.
     * An Entry found too late was missed while the computer slept or the app was closed, and gets Failed,
     * unless it is a Wake with Retry: that one starts trying right away.
     */
    checkClock() {
      const current = now()
      for (const entry of entries) {
        if (entry.status !== 'Waiting' || entry.startTime === 'Now') continue
        const startTime = new Date(entry.startTime.at)
        if (startTime > current) continue
        if (isMissed(startTime, current) && !entry.retry) setStatus(entry.id, 'Failed', 'missed start time')
        else start(entry)
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
