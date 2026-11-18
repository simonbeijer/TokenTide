import { randomUUID } from 'node:crypto'
import type { Entry, EntryStatus, RunOptions, StartChoice, StartTime, WakeOptions } from '../shared/entry'
import type { LogLine } from '../shared/log'
import type { AttemptReport } from './attemptOutcome'
import type { EntryStore } from './entryStore'
import { hardStopAfter, hardStopPassed } from './hardStop'
import { isMissed } from './lateness'
import { runQueue, startTimeOf } from './runQueue'
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
  /** Set when the Entry has been stopped: the Note it is stopped with, if any. */
  stopped?: { note?: string }
}

/** The Note on a Run stopped by its Hard stop. */
const hardStopNote = 'hard stop'

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
  const entryById = (id: string) => entries.find((entry) => entry.id === id)!
  const saveAndNotify = () => {
    store.save(entries)
    listeners.forEach((listener) => listener(list()))
  }
  const setStatus = (id: string, status: EntryStatus, note?: string) => {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, status, ...(note && { note }) } : entry))
    saveAndNotify()
  }
  const finish = (id: string, status: EntryStatus, note?: string) => {
    active.delete(id)
    setStatus(id, status, note)
  }

  // Only a warning: the Window end is typed by hand and can be old or wrong.
  const withWarning = (entry: Entry): Entry => {
    if (entry.kind !== 'Wake') return entry
    const { warning: _old, ...rest } = entry
    return startsInsideWindow(startTimeOf(entry, now()), windowEnd?.get()) ? { ...rest, warning: insideWindowWarning } : rest
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

  const makeAttempt = async (id: string, retry: boolean) => {
    const wake = active.get(id)
    if (!wake) return
    // Kept from the start: a stopped Wake can be removed while its Attempt is still ending.
    const entry = entryById(id)
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
    const { outcome: reported, ...output } = report
    // Limit reached is a status for Runs. For a Wake it is a failed Attempt like any other.
    const outcome = reported === 'Limit reached' ? 'Failed' : reported
    if (outcome === 'Done') recalculateWindow(attemptStart)
    // Stopped while the Attempt was ending. An answer still wins, because the Window has started then.
    if (wake.stopped) {
      if (outcome === 'Done') setStatus(id, 'Done')
      logEvent(entry, outcome === 'Done' ? { status: 'Done', ...output } : { status: 'Stopped', ...output, ...wake.stopped })
      return
    }
    logEvent(entry, { status: outcome, ...output })
    if (outcome === 'Failed' && retry) {
      wake.attempt = undefined
      wake.nextAttempt = setTimeout(() => void makeAttempt(id, retry), retryDelay)
      return
    }
    finish(id, outcome, output.note)
  }

  /** A Run has one Attempt and no time limit: Claude does the work and exits by itself. */
  const makeRunAttempt = async (entry: Entry) => {
    const run = active.get(entry.id)
    if (!run) return
    claudeWorkingOnRun = entry.id
    const attemptStart = now()
    const attempt = new AbortController()
    run.attempt = attempt
    let report: AttemptReport
    try {
      report = await runRunAttempt(entry, attempt.signal, () => recalculateWindow(attemptStart))
    } catch {
      report = { outcome: 'Failed' }
    }
    claudeWorkingOnRun = undefined
    const { outcome, ...output } = report
    if (run.stopped) logEvent(entry, { status: 'Stopped', ...output, ...run.stopped })
    else {
      logEvent(entry, { status: outcome, ...output })
      finish(entry.id, outcome, output.note)
    }
    // Whatever status the Run got, the next Run gets its turn. Limit reached does not pause the queue.
    startNextRun()
  }

  /** Ends a Running Entry on purpose: ends any running Attempt and makes no more. */
  const stop = (id: string, note?: string) => {
    const activeEntry = active.get(id)
    if (!activeEntry || activeEntry.stopped) return
    activeEntry.stopped = { ...(note && { note }) }
    clearTimeout(activeEntry.nextAttempt)
    activeEntry.attempt?.abort()
    // A running Attempt adds the Stopped line when it has ended; between Attempts there is none to do it.
    if (!activeEntry.attempt) logEvent(entryById(id), { status: 'Stopped', ...activeEntry.stopped })
    finish(id, 'Stopped', note)
  }

  /**
   * The Run whose Claude has not exited yet. A stopped Run is Stopped at once, but its Claude may still be
   * ending, and the next Run must not start until it has.
   */
  let claudeWorkingOnRun: string | undefined
  /** The Runs that were found on time but had to wait for their turn. Waiting for the queue does not make a Run late. */
  const waitedForTurn = new Set<string>()

  const missStart = (entry: Entry) => {
    const note = 'missed start time'
    setStatus(entry.id, 'Failed', note)
    logEvent(entry, { status: 'Failed', note })
  }

  /** One Run at a time, so two agents never write to the same files. Starts the first due Run unless Claude works on one. */
  const startNextRun = () => {
    const current = now()
    for (const entry of runQueue(entries, current)) {
      // Found too late the first time it was due: the computer slept or the app was closed, queue or not.
      if (!waitedForTurn.has(entry.id) && isMissed(startTimeOf(entry, current), current)) missStart(entry)
      else waitedForTurn.add(entry.id)
    }
    if (claudeWorkingOnRun) return
    const [next] = runQueue(entries, current)
    if (!next) return
    waitedForTurn.delete(next.id)
    start(next)
  }

  const start = (entry: Entry) => {
    active.set(entry.id, {})
    setStatus(entry.id, 'Running')
    if (entry.kind === 'Run') void makeRunAttempt(entry)
    else void makeAttempt(entry.id, entry.retry)
  }

  const add = (choice: StartChoice, fields: Omit<Entry, 'id' | 'startTime' | 'status'>): Entry => {
    const startAt = choice === 'Now' ? now() : nextOccurrence(choice.clock, now())
    const startTime: StartTime = choice === 'Now' ? 'Now' : { at: startAt.toISOString() }
    const hardStop = fields.run?.hardStop
    const entry = withWarning({
      id: randomUUID(),
      startTime,
      status: 'Waiting',
      ...fields,
      // A Run with Start time Now may have to wait for its turn, and its place in the queue needs a time.
      ...(choice === 'Now' && fields.kind === 'Run' && { addedAt: startAt.toISOString() }),
      ...(hardStop && { hardStopAt: hardStopAfter(hardStop, startAt).toISOString() })
    })
    entries = [...entries, entry]
    saveAndNotify()
    // A Run waits for its turn in the queue. A Wake does not wait.
    if (entry.kind === 'Run') startNextRun()
    else if (startTime === 'Now') start(entry)
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
     * A Wake does not wait for a Running Run. A Run waits for its turn in the queue.
     */
    checkClock() {
      const current = now()
      // A Run past its Hard stop must not be running, and must not start: stop it before anything is started.
      for (const entry of entries) {
        if (!entry.hardStopAt || !hardStopPassed(new Date(entry.hardStopAt), current)) continue
        if (entry.status === 'Running') stop(entry.id, hardStopNote)
        else if (entry.status === 'Waiting') {
          setStatus(entry.id, 'Stopped', hardStopNote)
          logEvent(entry, { status: 'Stopped', note: hardStopNote })
        }
      }
      for (const entry of entries) {
        if (entry.kind !== 'Wake' || entry.status !== 'Waiting' || entry.startTime === 'Now') continue
        const startTime = new Date(entry.startTime.at)
        if (startTime > current) continue
        if (isMissed(startTime, current) && !entry.retry) missStart(entry)
        else start(entry)
      }
      startNextRun()
    },
    addWake(choice: StartChoice, { retry = false }: WakeOptions = {}): Entry {
      return add(choice, { kind: 'Wake', retry })
    },
    addRun(choice: StartChoice, run: RunOptions): Entry {
      return add(choice, { kind: 'Run', retry: false, run })
    },
    /** Gives or takes away the warning on each Waiting Wake. Called when the user changes the Window end. */
    refreshWarnings,
    /** The stop button: ends a Running Entry on purpose. */
    stop: (id: string) => stop(id),
    /**
     * Takes an Entry that is not Running out of the list for good; a Waiting one then never starts.
     * A Running Entry stays: it has to be stopped first. The log and a Run's saved output stay too.
     */
    remove(id: string) {
      const entry = entries.find((candidate) => candidate.id === id)
      if (!entry || entry.status === 'Running') return
      entries = entries.filter((candidate) => candidate.id !== id)
      waitedForTurn.delete(id)
      saveAndNotify()
    }
  }
}
