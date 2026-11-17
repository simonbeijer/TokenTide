import { randomUUID } from 'node:crypto'
import type { Entry, EntryStatus, RunOptions, StartChoice, StartTime, WakeOptions } from '../shared/entry'
import type { LogLine } from '../shared/log'
import type { AttemptReport } from './attemptOutcome'
import type { EntryStore } from './entryStore'
import { isMissed } from './lateness'
import { nextOccurrence } from './startTime'
import { startsInsideWindow, windowEndAfterAnswer } from './windowEnd'

/** An Attempt with no answer after this long is ended and counts as failed. */
export const attemptTimeout = 2 * 60_000
/** With Retry, a failed Attempt is followed by a new one this much later. */
export const retryDelay = 60_000

export interface EntryListDeps {
  /** Makes one Attempt. Aborting the signal must end the Attempt; it then counts as failed. */
  runWakeAttempt: (signal: AbortSignal) => Promise<AttemptReport>
  /**
   * Makes the one Attempt of a Run, which lasts until Claude exits by itself. Aborting the signal must end it.
   * `onAnswer` must be called when Claude first answers, so the Window can be recalculated while the Run works.
   */
  runRunAttempt?: (entry: Entry, signal: AbortSignal, onAnswer: () => void) => Promise<AttemptReport>
  store: EntryStore
  now?: () => Date
  /** Gets one line per event: an Attempt that ends, or an Entry that changes status without an Attempt. */
  log?: (line: LogLine) => void
  /** The Window end the user typed or the app last recalculated. Without it, Wakes neither warn nor recalculate. */
  windowEnd?: WindowEndStore
}

export interface WindowEndStore {
  get: () => Date | undefined
  set: (end: Date) => void
}

/** The warning on a Wake whose Start time is at or before the Window end, so it starts no new Window. */
export const insideWindowWarning = 'starts inside the Window'

type Listener = (entries: Entry[]) => void

/** What a Running Entry needs in order to be stopped. */
interface ActiveEntry {
  attempt?: AbortController
  nextAttempt?: ReturnType<typeof setTimeout>
}

export function createEntryList({
  runWakeAttempt,
  runRunAttempt = async () => ({ outcome: 'Failed' }),
  store,
  now = () => new Date(),
  log = () => {},
  windowEnd
}: EntryListDeps) {
  // Nothing can be running at start, so an Entry still marked Running was cut off by a crash.
  // Entries saved before Retry existed have no `retry` field and get false.
  const loaded = store.load()
  let entries: Entry[] = loaded.map((entry) => ({
    ...entry,
    retry: entry.retry ?? false,
    status: entry.status === 'Running' ? 'Failed' : entry.status
  }))
  store.save(entries)
  /** A Run's lines carry its Project. A Wake has none. */
  const logEvent = (entry: Entry, line: Omit<LogLine, 'time' | 'project'>) =>
    log({ time: now().toISOString(), ...(entry.run && { project: entry.run.project }), ...line })
  for (const entry of loaded) if (entry.status === 'Running') logEvent(entry, { status: 'Failed', note: 'cut off by a restart' })
  const listeners = new Set<Listener>()
  const active = new Map<string, ActiveEntry>()

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

  const startOf = (startTime: StartTime) => (startTime === 'Now' ? now() : new Date(startTime.at))
  // Only a warning: the Window end is typed by hand and can be old or wrong.
  const withWarning = (entry: Entry): Entry => {
    if (entry.kind !== 'Wake') return entry
    const { warning: _old, ...rest } = entry
    return startsInsideWindow(startOf(entry.startTime), windowEnd?.get()) ? { ...rest, warning: insideWindowWarning } : rest
  }
  /** A Wake that has started keeps the warning it had, because the Window end it started under is what mattered. */
  const refreshWarnings = () => {
    const refreshed = entries.map((entry) => (entry.status === 'Waiting' ? withWarning(entry) : entry))
    if (refreshed.every((entry, index) => entry.warning === entries[index].warning)) return
    entries = refreshed
    saveAndNotify()
  }

  const recalculateWindow = (attemptStart: Date) => {
    if (!windowEnd) return
    const end = windowEndAfterAnswer(windowEnd.get(), attemptStart)
    if (!end) return
    windowEnd.set(end)
    refreshWarnings()
  }

  const entryById = (id: string) => entries.find((entry) => entry.id === id)!

  const makeAttempt = async (id: string, retry: boolean) => {
    const wake = active.get(id)
    if (!wake) return
    const attemptStart = now()
    const attempt = new AbortController()
    wake.attempt = attempt
    const timeout = setTimeout(() => attempt.abort(), attemptTimeout)
    let report: AttemptReport
    try {
      report = await runWakeAttempt(attempt.signal)
    } catch {
      report = { outcome: 'Failed' }
    } finally {
      clearTimeout(timeout)
    }
    const { outcome, ...output } = report
    if (outcome === 'Done') recalculateWindow(attemptStart)
    // Stopped while the Attempt was ending. An answer still wins, because the Window has started then.
    if (active.get(id) !== wake) {
      if (outcome === 'Done') setStatus(id, 'Done')
      logEvent(entryById(id), { status: outcome === 'Done' ? 'Done' : 'Stopped', ...output })
      return
    }
    logEvent(entryById(id), { status: outcome, ...output })
    if (outcome === 'Failed' && retry) {
      wake.attempt = undefined
      wake.nextAttempt = setTimeout(() => void makeAttempt(id, retry), retryDelay)
      return
    }
    finish(id, outcome)
  }

  /** A Run has one Attempt and no time limit: Claude does the work and exits by itself. */
  const makeRunAttempt = async (entry: Entry) => {
    const run = active.get(entry.id)
    if (!run) return
    const attemptStart = now()
    const attempt = new AbortController()
    run.attempt = attempt
    let report: AttemptReport
    try {
      report = await runRunAttempt(entry, attempt.signal, () => recalculateWindow(attemptStart))
    } catch {
      report = { outcome: 'Failed' }
    }
    const { outcome, ...output } = report
    const stopped = active.get(entry.id) !== run
    logEvent(entry, { status: stopped ? 'Stopped' : outcome, ...output })
    if (!stopped) finish(entry.id, outcome)
  }

  const start = (entry: Entry) => {
    active.set(entry.id, {})
    setStatus(entry.id, 'Running')
    if (entry.kind === 'Run') void makeRunAttempt(entry)
    else void makeAttempt(entry.id, entry.retry)
  }

  const add = (choice: StartChoice, fields: Omit<Entry, 'id' | 'startTime' | 'status'>): Entry => {
    const startTime: StartTime = choice === 'Now' ? 'Now' : { at: nextOccurrence(choice.clock, now()).toISOString() }
    const entry = withWarning({ id: randomUUID(), startTime, status: 'Waiting', ...fields })
    entries = [...entries, entry]
    saveAndNotify()
    if (startTime === 'Now') start(entry)
    return { ...entry }
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
        if (isMissed(startTime, current) && !entry.retry) {
          const note = 'missed start time'
          setStatus(entry.id, 'Failed', note)
          logEvent(entry, { status: 'Failed', note })
        } else start(entry)
      }
    },
    addWake(choice: StartChoice, { retry = false }: WakeOptions = {}): Entry {
      return add(choice, { kind: 'Wake', retry })
    },
    addRun(choice: StartChoice, run: RunOptions): Entry {
      return add(choice, { kind: 'Run', retry: false, run })
    },
    /** Gives or takes away the warning on each Waiting Wake. Called when the user changes the Window end. */
    refreshWarnings,
    /** Ends a Running Entry on purpose: ends any running Attempt and makes no more. */
    stop(id: string) {
      const wake = active.get(id)
      if (!wake) return
      clearTimeout(wake.nextAttempt)
      wake.attempt?.abort()
      // A running Attempt adds the Stopped line when it has ended; between Attempts there is none to do it.
      if (!wake.attempt) logEvent(entryById(id), { status: 'Stopped' })
      finish(id, 'Stopped')
    }
  }
}
