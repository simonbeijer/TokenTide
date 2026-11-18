import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry, RunOptions } from '../shared/entry'
import type { LogLine } from '../shared/log'
import type { AttemptOutcome, AttemptReport } from './attemptOutcome'
import { createEntryList } from './entryList'
import type { EntryStore } from './entryStore'

function memoryStore(saved: Entry[] = []): EntryStore & { saved: Entry[] } {
  return {
    saved,
    load() {
      return this.saved.map((entry) => ({ ...entry }))
    },
    save(entries) {
      this.saved = entries.map((entry) => ({ ...entry }))
    }
  }
}

/** A stand-in for Claude: each Attempt waits until the test finishes it, and ends as Failed when it is aborted. */
function controlledAttempt() {
  let finish: (report: AttemptReport) => void = () => {}
  let signal: AbortSignal | undefined
  let calls = 0
  return {
    run: (attemptSignal: AbortSignal) => {
      calls++
      signal = attemptSignal
      return new Promise<AttemptReport>((resolve) => {
        finish = resolve
        attemptSignal.addEventListener('abort', () => resolve({ outcome: 'Failed' }))
      })
    },
    finish: (outcome: AttemptOutcome, output: Omit<AttemptReport, 'outcome'> = {}) => finish({ outcome, ...output }),
    get calls() {
      return calls
    },
    get aborted() {
      return signal?.aborted ?? false
    }
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

function fakeClock(start: string) {
  let current = new Date(start)
  return {
    now: () => new Date(current),
    set: (text: string) => (current = new Date(text))
  }
}

describe('entry list', () => {
  it('a Wake with Start time Now lands in the list as Waiting and starts right away', () => {
    const attempt = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
    const seen: string[] = []
    entries.onChange((list) => seen.push(list[0].status))

    const entry = entries.addWake('Now')

    expect(entry).toMatchObject({ kind: 'Wake', startTime: 'Now' })
    expect(seen).toEqual(['Waiting', 'Running'])
    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Running' })])
    expect(attempt.calls).toBe(1)
  })

  it.each<AttemptOutcome>(['Done', 'Failed'])('the Wake becomes %s when its Attempt ends that way', async (outcome) => {
    const attempt = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
    const entry = entries.addWake('Now')

    attempt.finish(outcome)
    await flush()

    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: outcome })])
  })

  it('the Wake is Failed when its Attempt throws', async () => {
    const entries = createEntryList({ runWakeAttempt: () => Promise.reject(new Error('boom')), store: memoryStore() })
    const entry = entries.addWake('Now')

    await flush()

    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Failed' })])
  })

  describe('at a clock time', () => {
    it('a Wake at a clock time lands in the list as Waiting with its Start time, and does not start yet', () => {
      const attempt = controlledAttempt()
      const clock = fakeClock('2026-11-15T22:00:00')
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now })

      const entry = entries.addWake({ clock: '23:30' })

      expect(entry).toMatchObject({ kind: 'Wake', startTime: { at: new Date('2026-11-15T23:30:00').toISOString() }, status: 'Waiting' })
      expect(attempt.calls).toBe(0)
    })

    it('starts the Entry at the first clock check on or after its Start time, and not before', () => {
      const attempt = controlledAttempt()
      const clock = fakeClock('2026-11-15T22:00:00')
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now })
      const entry = entries.addWake({ clock: '23:30' })

      clock.set('2026-11-15T23:29:59')
      entries.checkClock()
      expect(attempt.calls).toBe(0)

      clock.set('2026-11-15T23:30:20')
      entries.checkClock()
      expect(attempt.calls).toBe(1)
      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Running' })])

      entries.checkClock()
      expect(attempt.calls).toBe(1)
    })

    it('starts on time after the computer slept in between, because each check reads the clock afresh', () => {
      const attempt = controlledAttempt()
      const clock = fakeClock('2026-11-15T22:00:00')
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now })
      entries.addWake({ clock: '05:00' })

      entries.checkClock()
      // Asleep from 22:00 to 04:59: no checks run at all.
      clock.set('2026-11-16T04:59:30')
      entries.checkClock()
      expect(attempt.calls).toBe(0)

      clock.set('2026-11-16T05:00:00')
      entries.checkClock()
      expect(attempt.calls).toBe(1)
    })

    it('a Waiting Entry saved before a restart starts when its Start time comes', () => {
      const store = memoryStore()
      const clock = fakeClock('2026-11-15T22:00:00')
      createEntryList({ runWakeAttempt: controlledAttempt().run, store, now: clock.now }).addWake({ clock: '23:30' })

      const attempt = controlledAttempt()
      const after = createEntryList({ runWakeAttempt: attempt.run, store, now: clock.now })
      clock.set('2026-11-15T23:30:00')
      after.checkClock()

      expect(attempt.calls).toBe(1)
    })
  })

  describe('missed Start time', () => {
    it('a Waiting Entry found more than 5 minutes late after the computer slept does not start and gets Failed', () => {
      const attempt = controlledAttempt()
      const clock = fakeClock('2026-11-15T22:00:00')
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now })
      const entry = entries.addWake({ clock: '05:00' })

      // Asleep from 22:00 to 07:00: the first check after waking is two hours late.
      clock.set('2026-11-16T07:00:00')
      entries.checkClock()

      expect(attempt.calls).toBe(0)
      expect(entries.list()).toEqual([
        expect.objectContaining({ id: entry.id, status: 'Failed', note: 'missed start time' })
      ])
    })

    it('an Entry found 5 minutes or less after its Start time starts as usual', () => {
      const attempt = controlledAttempt()
      const clock = fakeClock('2026-11-15T22:00:00')
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now })
      const entry = entries.addWake({ clock: '05:00' })

      clock.set('2026-11-16T05:05:00')
      entries.checkClock()

      expect(attempt.calls).toBe(1)
      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Running' })])
      expect(entries.list()[0].note).toBeUndefined()
    })

    it('a Waiting Entry missed while the app was closed gets Failed at the first check after opening', () => {
      const store = memoryStore()
      const clock = fakeClock('2026-11-15T22:00:00')
      createEntryList({ runWakeAttempt: controlledAttempt().run, store, now: clock.now }).addWake({ clock: '05:00' })

      // Closed from 22:00 to 09:00.
      clock.set('2026-11-16T09:00:00')
      const attempt = controlledAttempt()
      const after = createEntryList({ runWakeAttempt: attempt.run, store, now: clock.now })
      after.checkClock()

      expect(attempt.calls).toBe(0)
      expect(after.list()).toEqual([expect.objectContaining({ status: 'Failed', note: 'missed start time' })])
      expect(store.saved).toEqual([expect.objectContaining({ status: 'Failed', note: 'missed start time' })])
    })

    it('a Wake with Retry that is more than 5 minutes late starts making Attempts right away', () => {
      const attempt = controlledAttempt()
      const clock = fakeClock('2026-11-15T22:00:00')
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now })
      entries.addWake({ clock: '05:00' }, { retry: true })

      clock.set('2026-11-16T07:00:00')
      entries.checkClock()

      expect(attempt.calls).toBe(1)
      expect(entries.list()).toEqual([expect.objectContaining({ status: 'Running' })])
    })

    it('a Wake with Retry missed while the app was closed starts at the first check after opening', () => {
      const store = memoryStore()
      const clock = fakeClock('2026-11-15T22:00:00')
      createEntryList({ runWakeAttempt: controlledAttempt().run, store, now: clock.now }).addWake(
        { clock: '05:00' },
        { retry: true }
      )

      clock.set('2026-11-16T09:00:00')
      const attempt = controlledAttempt()
      createEntryList({ runWakeAttempt: attempt.run, store, now: clock.now }).checkClock()

      expect(attempt.calls).toBe(1)
    })
  })

  describe('across restarts', () => {
    it('starts with an empty list when nothing has been saved yet', () => {
      const entries = createEntryList({ runWakeAttempt: controlledAttempt().run, store: memoryStore() })

      expect(entries.list()).toEqual([])
    })

    it('saves every change, so a new list after a restart shows the same Entries', async () => {
      const store = memoryStore()
      const attempt = controlledAttempt()
      const before = createEntryList({ runWakeAttempt: attempt.run, store })
      const entry = before.addWake('Now')
      attempt.finish('Done')
      await flush()

      const after = createEntryList({ runWakeAttempt: controlledAttempt().run, store })

      expect(after.list()).toEqual([{ id: entry.id, kind: 'Wake', startTime: 'Now', retry: false, status: 'Done' }])
    })

    it('gives Failed to an Entry still marked Running at start, and does not start it again', () => {
      const store = memoryStore([
        { id: 'cut-off', kind: 'Wake', startTime: 'Now', retry: true, status: 'Running' },
        { id: 'finished', kind: 'Wake', startTime: 'Now', retry: false, status: 'Done' }
      ])
      const attempt = controlledAttempt()

      const entries = createEntryList({ runWakeAttempt: attempt.run, store })

      expect(entries.list()).toEqual([
        { id: 'cut-off', kind: 'Wake', startTime: 'Now', retry: true, status: 'Failed' },
        { id: 'finished', kind: 'Wake', startTime: 'Now', retry: false, status: 'Done' }
      ])
      expect(store.saved.map((entry) => entry.status)).toEqual(['Failed', 'Done'])
      expect(attempt.calls).toBe(0)
    })

    it('loads an Entry saved before Retry existed as a Wake without Retry', () => {
      const saved = [{ id: 'old', kind: 'Wake', startTime: 'Now', status: 'Done' }] as unknown as Entry[]

      const entries = createEntryList({ runWakeAttempt: controlledAttempt().run, store: memoryStore(saved) })

      expect(entries.list()).toEqual([{ id: 'old', kind: 'Wake', startTime: 'Now', retry: false, status: 'Done' }])
    })
  })

  describe('Retry', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const statusOf = (entries: ReturnType<typeof createEntryList>) => entries.list()[0].status

    it('a Wake has no Retry unless it is asked for', () => {
      const entries = createEntryList({ runWakeAttempt: controlledAttempt().run, store: memoryStore() })

      expect(entries.addWake('Now')).toMatchObject({ retry: false })
      expect(entries.addWake('Now', { retry: true })).toMatchObject({ retry: true })
    })

    it('without Retry, a failed Attempt makes the Wake Failed and no new Attempt is made', async () => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      entries.addWake('Now')

      attempt.finish('Failed')
      await vi.advanceTimersByTimeAsync(10 * 60_000)

      expect(statusOf(entries)).toBe('Failed')
      expect(attempt.calls).toBe(1)
    })

    it('an Attempt that hits the usage limit is a failed Attempt: without Retry the Wake is Failed', async () => {
      const attempt = controlledAttempt()
      const lines: LogLine[] = []
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), log: (line) => lines.push(line) })
      entries.addWake('Now')

      attempt.finish('Limit reached')
      await vi.advanceTimersByTimeAsync(10 * 60_000)

      expect(statusOf(entries)).toBe('Failed')
      expect(lines).toEqual([expect.objectContaining({ status: 'Failed' })])
      expect(attempt.calls).toBe(1)
    })

    it('with Retry, an Attempt that hits the usage limit is followed by a new one, like any failed Attempt', async () => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      entries.addWake('Now', { retry: true })

      attempt.finish('Limit reached')
      await vi.advanceTimersByTimeAsync(60_000)

      expect(attempt.calls).toBe(2)
      expect(statusOf(entries)).toBe('Running')
    })

    it('with Retry, a failed Attempt is followed by a new one a minute later, and the Wake stays Running', async () => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      entries.addWake('Now', { retry: true })

      attempt.finish('Failed')
      await vi.advanceTimersByTimeAsync(59_000)
      expect(attempt.calls).toBe(1)
      expect(statusOf(entries)).toBe('Running')

      await vi.advanceTimersByTimeAsync(1_000)
      expect(attempt.calls).toBe(2)
      expect(statusOf(entries)).toBe('Running')

      attempt.finish('Failed')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(attempt.calls).toBe(3)
      expect(statusOf(entries)).toBe('Running')
    })

    it('with Retry, an Attempt that throws counts as failed and is tried again', async () => {
      let calls = 0
      const entries = createEntryList({
        runWakeAttempt: () => (++calls === 1 ? Promise.reject(new Error('boom')) : new Promise(() => {})),
        store: memoryStore()
      })
      entries.addWake('Now', { retry: true })

      await vi.advanceTimersByTimeAsync(60_000)

      expect(calls).toBe(2)
      expect(statusOf(entries)).toBe('Running')
    })

    it('with Retry, the first Attempt that gets an answer makes the Wake Done, and no more Attempts are made', async () => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      entries.addWake('Now', { retry: true })
      attempt.finish('Failed')
      await vi.advanceTimersByTimeAsync(60_000)

      attempt.finish('Done')
      await vi.advanceTimersByTimeAsync(10 * 60_000)

      expect(statusOf(entries)).toBe('Done')
      expect(attempt.calls).toBe(2)
    })

    it.each([false, true])('an Attempt with no answer after 2 minutes is ended and counts as failed (Retry: %s)', async (retry) => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      entries.addWake('Now', { retry })

      await vi.advanceTimersByTimeAsync(119_000)
      expect(attempt.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(1_000)
      expect(attempt.aborted).toBe(true)
      expect(statusOf(entries)).toBe(retry ? 'Running' : 'Failed')

      await vi.advanceTimersByTimeAsync(60_000)
      expect(attempt.calls).toBe(retry ? 2 : 1)
    })

    it('a Wake is Done when Claude answers while its timed-out Attempt is being ended', async () => {
      const entries = createEntryList({
        runWakeAttempt: (signal) =>
          new Promise<AttemptReport>((resolve) => signal.addEventListener('abort', () => resolve({ outcome: 'Done' }))),
        store: memoryStore()
      })
      entries.addWake('Now', { retry: true })

      await vi.advanceTimersByTimeAsync(120_000)

      expect(statusOf(entries)).toBe('Done')
    })

    it('Stop during an Attempt ends that Attempt, makes no more Attempts and gives Stopped', async () => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      const entry = entries.addWake('Now', { retry: true })

      entries.stop(entry.id)
      await vi.advanceTimersByTimeAsync(10 * 60_000)

      expect(attempt.aborted).toBe(true)
      expect(statusOf(entries)).toBe('Stopped')
      expect(attempt.calls).toBe(1)
    })

    it('Stop between two Attempts makes no more Attempts and gives Stopped', async () => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      const entry = entries.addWake('Now', { retry: true })
      attempt.finish('Failed')
      await vi.advanceTimersByTimeAsync(30_000)

      entries.stop(entry.id)
      await vi.advanceTimersByTimeAsync(10 * 60_000)

      expect(statusOf(entries)).toBe('Stopped')
      expect(attempt.calls).toBe(1)
    })

    it('Stop does nothing to a Wake that is not Running', async () => {
      const attempt = controlledAttempt()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
      const entry = entries.addWake('Now', { retry: true })
      attempt.finish('Done')
      await vi.advanceTimersByTimeAsync(0)

      entries.stop(entry.id)

      expect(statusOf(entries)).toBe('Done')
    })

    it('Quit during a later Attempt waits until that Attempt has ended', async () => {
      let exit: (report: AttemptReport) => void = () => {}
      const entries = createEntryList({
        // Like a Claude that takes a moment to exit after the interrupt.
        runWakeAttempt: () => new Promise((resolve) => (exit = resolve)),
        store: memoryStore()
      })
      entries.addWake('Now', { retry: true })
      exit({ outcome: 'Failed' })
      await vi.advanceTimersByTimeAsync(60_000)
      let quitDone = false

      const quitting = entries.quit().then(() => (quitDone = true))
      await vi.advanceTimersByTimeAsync(0)
      expect(quitDone).toBe(false)

      exit({ outcome: 'Failed' })
      await quitting
      expect(statusOf(entries)).toBe('Stopped')
    })
  })

  describe('the Window', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      vi.setSystemTime(new Date('2026-11-16T10:01:00'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    /** The Window end as the settings keep it, with every value it was set to. */
    function memoryWindowEnd(end?: string) {
      let current = end === undefined ? undefined : new Date(end)
      const set: Date[] = []
      return {
        get: () => current,
        set: (next: Date) => {
          current = next
          set.push(next)
        },
        setTo: set
      }
    }

    const setup = (end?: string) => {
      const attempt = controlledAttempt()
      const windowEnd = memoryWindowEnd(end)
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), windowEnd })
      return { attempt, windowEnd, entries }
    }

    it('an answer when no Window end is set gives a Window end 5 hours after the Attempt, rounded down', async () => {
      const { attempt, windowEnd, entries } = setup()
      entries.addWake('Now')

      attempt.finish('Done')
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.setTo).toEqual([new Date('2026-11-16T15:00:00')])
    })

    it('an answer after the Window end gives a new Window end', async () => {
      const { attempt, windowEnd, entries } = setup('2026-11-16T09:30:00')
      entries.addWake('Now')

      attempt.finish('Done')
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.get()).toEqual(new Date('2026-11-16T15:00:00'))
    })

    it('an answer inside the known Window leaves the Window end unchanged', async () => {
      const { attempt, windowEnd, entries } = setup('2026-11-16T12:00:00')
      entries.addWake('Now')

      attempt.finish('Done')
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.setTo).toEqual([])
    })

    it('a failed Attempt never changes the Window end', async () => {
      const { attempt, windowEnd, entries } = setup()
      entries.addWake('Now')

      attempt.finish('Failed')
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.setTo).toEqual([])
    })

    it('a Wake whose Start time is at or before the Window end gets a warning, but still starts at its time', () => {
      const { attempt, entries } = setup('2026-11-16T12:00:00')

      const now = entries.addWake('Now')
      const atEnd = entries.addWake({ clock: '12:00' })

      expect(entries.list()).toEqual([
        expect.objectContaining({ id: now.id, warning: 'starts inside the Window', status: 'Running' }),
        expect.objectContaining({
          id: atEnd.id,
          warning: 'starts inside the Window',
          startTime: { at: new Date('2026-11-16T12:00:00').toISOString() }
        })
      ])
      expect(attempt.calls).toBe(1)
    })

    it('has no warning when no Window end is set or the Start time is after the Window end', () => {
      expect(setup().entries.addWake('Now')).not.toHaveProperty('warning')
      expect(setup('2026-11-16T12:00:00').entries.addWake({ clock: '12:01' })).not.toHaveProperty('warning')
    })

    it('a Waiting Wake gets or loses the warning when the user changes the Window end', () => {
      const { windowEnd, entries } = setup()
      entries.addWake({ clock: '12:00' })

      windowEnd.set(new Date('2026-11-16T12:30:00'))
      entries.refreshWarnings()
      expect(entries.list()[0]).toMatchObject({ warning: 'starts inside the Window' })

      windowEnd.set(new Date('2026-11-16T11:00:00'))
      entries.refreshWarnings()
      expect(entries.list()[0]).not.toHaveProperty('warning')
    })

    it('a recalculated Window end gives the warning to a Waiting Wake inside the new Window', async () => {
      const { attempt, entries } = setup()
      const later = entries.addWake({ clock: '12:00' })
      entries.addWake('Now')

      attempt.finish('Done')
      await vi.advanceTimersByTimeAsync(0)

      expect(entries.list().find((entry) => entry.id === later.id)).toMatchObject({ warning: 'starts inside the Window' })
    })

    it('a Wake that has started keeps its warning when the Window end changes', async () => {
      const { attempt, windowEnd, entries } = setup('2026-11-16T12:00:00')
      entries.addWake('Now')
      attempt.finish('Done')
      await vi.advanceTimersByTimeAsync(0)

      windowEnd.set(new Date('2026-11-16T09:00:00'))
      entries.refreshWarnings()

      expect(entries.list()[0]).toMatchObject({ status: 'Done', warning: 'starts inside the Window' })
    })

    it('a Wake with the warning and Retry recalculates the Window when its successful Attempt comes after the Window end', async () => {
      const { attempt, windowEnd, entries } = setup('2026-11-16T10:02:00')
      expect(entries.addWake('Now', { retry: true })).toMatchObject({ warning: 'starts inside the Window' })

      attempt.finish('Failed') // Attempt at 10:01
      await vi.advanceTimersByTimeAsync(60_000)
      attempt.finish('Failed') // Attempt at 10:02, at the Window end
      await vi.advanceTimersByTimeAsync(60_000)
      expect(windowEnd.setTo).toEqual([])
      attempt.finish('Done') // Attempt at 10:03, after the Window end
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.setTo).toEqual([new Date('2026-11-16T15:00:00')])
    })

    it('a Wake with the warning whose answer comes at the Window end does not recalculate the Window', async () => {
      const { attempt, windowEnd, entries } = setup('2026-11-16T10:02:00')
      entries.addWake('Now', { retry: true })

      attempt.finish('Failed') // Attempt at 10:01
      await vi.advanceTimersByTimeAsync(60_000)
      attempt.finish('Done') // Attempt at 10:02, at the Window end
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.setTo).toEqual([])
    })

    it('a Wake stopped while Claude answers still recalculates the Window', async () => {
      const windowEnd = memoryWindowEnd()
      const entries = createEntryList({
        runWakeAttempt: (signal) =>
          new Promise<AttemptReport>((resolve) => signal.addEventListener('abort', () => resolve({ outcome: 'Done' }))),
        store: memoryStore(),
        windowEnd
      })
      const entry = entries.addWake('Now', { retry: true })

      entries.stop(entry.id)
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.get()).toEqual(new Date('2026-11-16T15:00:00'))
    })
  })

  describe('log', () => {
    function recordingLog() {
      const lines: LogLine[] = []
      return { lines, log: (line: LogLine) => lines.push(line) }
    }

    it('an Attempt that ends adds one line with time, status, session id and last line, and no Project for a Wake', async () => {
      const attempt = controlledAttempt()
      const { lines, log } = recordingLog()
      const clock = fakeClock('2026-11-16T05:00:00Z')
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now, log })
      entries.addWake('Now')

      clock.set('2026-11-16T05:00:03Z')
      attempt.finish('Done', { sessionId: 'abc', lastLine: 'Hi!' })
      await flush()

      expect(lines).toEqual([{ time: '2026-11-16T05:00:03.000Z', status: 'Done', sessionId: 'abc', lastLine: 'Hi!' }])
    })

    it('a Wake that is not logged in gets "not logged in" on the Entry as well as on the line', async () => {
      const attempt = controlledAttempt()
      const { lines, log } = recordingLog()
      const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), log })
      entries.addWake('Now')

      attempt.finish('Failed', { note: 'not logged in' })
      await flush()

      expect(entries.list()).toEqual([expect.objectContaining({ status: 'Failed', note: 'not logged in' })])
      expect(lines).toEqual([expect.objectContaining({ status: 'Failed', note: 'not logged in' })])
    })

    it('an Attempt that gave no output still adds a line, with the time and status', async () => {
      const { lines, log } = recordingLog()
      const clock = fakeClock('2026-11-16T05:00:00Z')
      const entries = createEntryList({
        runWakeAttempt: () => Promise.reject(new Error('claude not found')),
        store: memoryStore(),
        now: clock.now,
        log
      })

      entries.addWake('Now')
      await flush()

      expect(lines).toEqual([{ time: '2026-11-16T05:00:00.000Z', status: 'Failed' }])
    })

    it('with Retry, each Attempt that ends adds its own line', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const attempt = controlledAttempt()
        const { lines, log } = recordingLog()
        const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), log })
        entries.addWake('Now', { retry: true })

        attempt.finish('Failed', { sessionId: 'first' })
        await vi.advanceTimersByTimeAsync(60_000)
        attempt.finish('Done', { sessionId: 'second', lastLine: 'Hi!' })
        await vi.advanceTimersByTimeAsync(0)

        expect(lines).toEqual([
          expect.objectContaining({ status: 'Failed', sessionId: 'first' }),
          expect.objectContaining({ status: 'Done', sessionId: 'second', lastLine: 'Hi!' })
        ])
      } finally {
        vi.useRealTimers()
      }
    })

    it('Stop during an Attempt adds one line with Stopped, once the Attempt has ended', async () => {
      const { lines, log } = recordingLog()
      const entries = createEntryList({
        runWakeAttempt: (signal) =>
          new Promise<AttemptReport>((resolve) =>
            signal.addEventListener('abort', () => resolve({ outcome: 'Failed', sessionId: 'abc' }))
          ),
        store: memoryStore(),
        log
      })
      const entry = entries.addWake('Now', { retry: true })

      entries.stop(entry.id)
      await flush()

      expect(lines).toEqual([expect.objectContaining({ status: 'Stopped', sessionId: 'abc' })])
    })

    it('Stop during an Attempt gives Done on the Entry and on the line when Claude answers while the Attempt is ending', async () => {
      const { lines, log } = recordingLog()
      const entries = createEntryList({
        runWakeAttempt: (signal) =>
          new Promise<AttemptReport>((resolve) =>
            signal.addEventListener('abort', () => resolve({ outcome: 'Done', sessionId: 'abc', lastLine: 'Hi!' }))
          ),
        store: memoryStore(),
        log
      })
      const entry = entries.addWake('Now', { retry: true })

      entries.stop(entry.id)
      await flush()

      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Done' })])
      expect(lines).toEqual([expect.objectContaining({ status: 'Done', sessionId: 'abc', lastLine: 'Hi!' })])
    })

    it('Stop between two Attempts adds one line with Stopped right away', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const attempt = controlledAttempt()
        const { lines, log } = recordingLog()
        const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), log })
        const entry = entries.addWake('Now', { retry: true })
        attempt.finish('Failed')
        await vi.advanceTimersByTimeAsync(30_000)

        entries.stop(entry.id)
        await vi.advanceTimersByTimeAsync(10 * 60_000)

        expect(lines.map((line) => line.status)).toEqual(['Failed', 'Stopped'])
      } finally {
        vi.useRealTimers()
      }
    })

    it('a missed Start time adds a line with Failed and the Note, though no Attempt was made', () => {
      const { lines, log } = recordingLog()
      const clock = fakeClock('2026-11-15T22:00:00Z')
      const entries = createEntryList({ runWakeAttempt: controlledAttempt().run, store: memoryStore(), now: clock.now, log })
      entries.addWake({ clock: '05:00' })

      clock.set('2026-11-16T09:00:00Z')
      entries.checkClock()

      expect(lines).toEqual([{ time: '2026-11-16T09:00:00.000Z', status: 'Failed', note: 'missed start time' }])
    })

    it('an Entry cut off by a crash adds a line with Failed when the app starts again', () => {
      const { lines, log } = recordingLog()
      const store = memoryStore([{ id: 'cut-off', kind: 'Wake', startTime: 'Now', retry: false, status: 'Running' }])

      createEntryList({ runWakeAttempt: controlledAttempt().run, store, now: () => new Date('2026-11-16T07:00:00Z'), log })

      expect(lines).toEqual([{ time: '2026-11-16T07:00:00.000Z', status: 'Failed', note: 'cut off by a restart' }])
    })
  })
})

describe('Run', () => {
  const options: RunOptions = { project: '/Users/me/dev/shop', prompt: 'Solve one issue', permissionMode: 'Auto', model: 'opus' }

  /** A stand-in for Claude doing a Run: waits until the test answers or finishes it. */
  function controlledRun() {
    let finish: (report: AttemptReport) => void = () => {}
    let answer: () => void = () => {}
    let signal: AbortSignal | undefined
    const started: Entry[] = []
    const finishById = new Map<string, (report: AttemptReport) => void>()
    return {
      run: (entry: Entry, runSignal: AbortSignal, onAnswer: () => void) => {
        started.push(entry)
        signal = runSignal
        answer = onAnswer
        return new Promise<AttemptReport>((resolve) => {
          finish = resolve
          finishById.set(entry.id, resolve)
          runSignal.addEventListener('abort', () => resolve({ outcome: 'Failed' }))
        })
      },
      answer: () => answer(),
      /** Ends the Run that started last. */
      finish: (outcome: AttemptOutcome, output: Omit<AttemptReport, 'outcome'> = {}) => finish({ outcome, ...output }),
      finishRun: (id: string, outcome: AttemptOutcome) => finishById.get(id)?.({ outcome }),
      started,
      get aborted() {
        return signal?.aborted ?? false
      }
    }
  }

  const setup = (extra: Partial<Parameters<typeof createEntryList>[0]> = {}) => {
    const run = controlledRun()
    const wake = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: wake.run, runRunAttempt: run.run, store: memoryStore(), ...extra })
    return { run, wake, entries }
  }

  it('a Run with Start time Now lands in the list with its Project, prompt, mode and model, and starts right away', () => {
    const { run, wake, entries } = setup()
    const seen: string[] = []
    entries.onChange((list) => seen.push(list[0].status))

    const entry = entries.addRun('Now', options)

    expect(entry).toMatchObject({ kind: 'Run', startTime: 'Now', retry: false, run: options })
    expect(seen).toEqual(['Waiting', 'Running'])
    expect(run.started).toEqual([expect.objectContaining({ id: entry.id, run: options })])
    expect(wake.calls).toBe(0)
  })

  it.each<AttemptOutcome>(['Done', 'Failed'])('the Run becomes %s when Claude ends that way', async (outcome) => {
    const { run, entries } = setup()
    const entry = entries.addRun('Now', options)

    run.finish(outcome)
    await flush()

    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: outcome })])
  })

  it('the Run is Failed when starting Claude throws', async () => {
    const entries = createEntryList({
      runWakeAttempt: controlledAttempt().run,
      runRunAttempt: () => Promise.reject(new Error('boom')),
      store: memoryStore()
    })
    const entry = entries.addRun('Now', options)

    await flush()

    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Failed' })])
  })

  it('a Run at a clock time waits, then starts at the first clock check on or after its Start time', () => {
    const clock = fakeClock('2026-11-15T22:00:00')
    const { run, entries } = setup({ now: clock.now })
    const entry = entries.addRun({ clock: '04:00' }, options)

    expect(entry).toMatchObject({ status: 'Waiting', startTime: { at: new Date('2026-11-16T04:00:00').toISOString() } })
    entries.checkClock()
    expect(run.started).toHaveLength(0)

    clock.set('2026-11-16T04:00:10')
    entries.checkClock()
    expect(run.started).toHaveLength(1)
  })

  it('a Run keeps its Project, prompt, mode and model across a restart', () => {
    const store = memoryStore()
    const clock = fakeClock('2026-11-15T22:00:00')
    setup({ store, now: clock.now }).entries.addRun({ clock: '04:00' }, options)

    const { entries } = setup({ store, now: clock.now })

    expect(entries.list()).toEqual([expect.objectContaining({ kind: 'Run', status: 'Waiting', run: options })])
  })

  describe('Hard stop', () => {
    it('is the first time the clock shows it after the Start time', () => {
      const clock = fakeClock('2026-11-15T22:00:00')
      const { entries } = setup({ now: clock.now })

      const entry = entries.addRun({ clock: '04:00' }, { ...options, hardStop: '03:00' })

      expect(entry.hardStopAt).toBe(new Date('2026-11-17T03:00:00').toISOString())
    })

    it('a Run still Waiting when its Hard stop passes never starts and gets Stopped with the Note "hard stop"', () => {
      const lines: LogLine[] = []
      const clock = fakeClock('2026-11-15T22:00:00')
      const { run, entries } = setup({ now: clock.now, log: (line) => lines.push(line) })
      const entry = entries.addRun({ clock: '04:00' }, { ...options, hardStop: '03:00' })

      // The computer slept past both the Start time and the Hard stop.
      clock.set('2026-11-17T03:00:00')
      entries.checkClock()

      expect(run.started).toHaveLength(0)
      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Stopped', note: 'hard stop' })])
      expect(lines).toEqual([expect.objectContaining({ project: options.project, status: 'Stopped', note: 'hard stop' })])
    })

    it('a Running Run is stopped when its Hard stop passes and gets Stopped with the Note "hard stop"', async () => {
      const lines: LogLine[] = []
      const clock = fakeClock('2026-11-16T10:00:00')
      const { run, entries } = setup({ now: clock.now, log: (line) => lines.push(line) })
      const entry = entries.addRun('Now', { ...options, hardStop: '12:00' })

      clock.set('2026-11-16T11:59:59')
      entries.checkClock()
      expect(run.aborted).toBe(false)

      clock.set('2026-11-16T12:00:10')
      entries.checkClock()
      await flush()

      expect(run.aborted).toBe(true)
      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Stopped', note: 'hard stop' })])
      expect(lines).toEqual([expect.objectContaining({ project: options.project, status: 'Stopped', note: 'hard stop' })])
    })

    it('a Run without a Hard stop is never stopped by the clock', () => {
      const clock = fakeClock('2026-11-16T10:00:00')
      const { run, entries } = setup({ now: clock.now })
      const entry = entries.addRun('Now', options)

      clock.set('2026-11-20T10:00:00')
      entries.checkClock()

      expect(entry.hardStopAt).toBeUndefined()
      expect(run.aborted).toBe(false)
      expect(entries.list()[0].status).toBe('Running')
    })
  })

  describe('stop button', () => {
    it('Stop ends a Running Run and gives Stopped, with one Stopped line once Claude has exited', async () => {
      const lines: LogLine[] = []
      const { run, entries } = setup({ log: (line) => lines.push(line) })
      const entry = entries.addRun('Now', options)

      entries.stop(entry.id)
      await flush()

      expect(run.aborted).toBe(true)
      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Stopped' })])
      expect(entries.list()[0].note).toBeUndefined()
      expect(lines).toEqual([expect.objectContaining({ project: options.project, status: 'Stopped' })])
    })
  })

  describe('one Run at a time', () => {
    const startedIds = (run: ReturnType<typeof controlledRun>) => run.started.map((entry) => entry.id)

    it('a second Run whose Start time comes while a Run is Running stays Waiting, and starts when the first has ended', async () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      const { run, entries } = setup({ now: clock.now })
      const first = entries.addRun('Now', options)
      const second = entries.addRun({ clock: '04:00' }, options)

      clock.set('2026-11-16T04:00:10')
      entries.checkClock()
      expect(startedIds(run)).toEqual([first.id])
      expect(entries.list()[1]).toMatchObject({ id: second.id, status: 'Waiting' })

      run.finishRun(first.id, 'Done')
      await flush()

      expect(startedIds(run)).toEqual([first.id, second.id])
      expect(entries.list()[1]).toMatchObject({ id: second.id, status: 'Running' })
    })

    it('Waiting Runs start in Start time order, and in the order they were added for the same Start time', async () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      const { run, entries } = setup({ now: clock.now })
      const first = entries.addRun('Now', options)
      const sameTimeA = entries.addRun({ clock: '04:30' }, options)
      const earlier = entries.addRun({ clock: '04:00' }, options)
      const sameTimeB = entries.addRun({ clock: '04:30' }, options)

      clock.set('2026-11-16T04:00:10')
      entries.checkClock()
      clock.set('2026-11-16T04:30:00')
      entries.checkClock()
      const nowRun = entries.addRun('Now', options)
      for (const id of [first.id, earlier.id, sameTimeA.id, sameTimeB.id]) {
        run.finishRun(id, 'Done')
        await flush()
      }

      expect(startedIds(run)).toEqual([first.id, earlier.id, sameTimeA.id, sameTimeB.id, nowRun.id])
    })

    it('a Run added with Start time Now while a Run is Running stays Waiting, and starts when the first has ended', async () => {
      const { run, entries } = setup()
      const first = entries.addRun('Now', options)
      const second = entries.addRun('Now', options)

      expect(entries.list()[1]).toMatchObject({ id: second.id, status: 'Waiting' })
      run.finishRun(first.id, 'Done')
      await flush()

      expect(startedIds(run)).toEqual([first.id, second.id])
    })

    it('a Wake starts at its Start time while a Run is Running', () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      const { run, wake, entries } = setup({ now: clock.now })
      entries.addRun('Now', options)
      entries.addWake('Now')
      entries.addWake({ clock: '04:00' })

      clock.set('2026-11-16T04:00:10')
      entries.checkClock()

      expect(wake.calls).toBe(2)
      expect(entries.list().map((entry) => entry.status)).toEqual(['Running', 'Running', 'Running'])
      expect(run.started).toHaveLength(1)
    })

    it('a Run that starts late only because it waited for its turn starts anyway, without "missed start time"', async () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      const { run, entries } = setup({ now: clock.now })
      const first = entries.addRun('Now', options)
      const second = entries.addRun({ clock: '04:00' }, options)

      clock.set('2026-11-16T04:00:10')
      entries.checkClock()
      clock.set('2026-11-16T06:00:00')
      entries.checkClock()
      run.finishRun(first.id, 'Done')
      await flush()

      expect(entries.list()[1]).toMatchObject({ id: second.id, status: 'Running' })
      expect(entries.list()[1].note).toBeUndefined()
    })

    it('a Run that is late because the computer slept still gets "missed start time", also behind a Running Run', async () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      const { run, entries } = setup({ now: clock.now })
      const first = entries.addRun('Now', options)
      const second = entries.addRun({ clock: '04:00' }, options)

      // The computer slept from before the Start time until long after it.
      clock.set('2026-11-16T06:00:00')
      entries.checkClock()
      run.finishRun(first.id, 'Done')
      await flush()

      expect(startedIds(run)).toEqual([first.id])
      expect(entries.list()[1]).toMatchObject({ id: second.id, status: 'Failed', note: 'missed start time' })
    })

    it('a Run that waited for its turn gets "missed start time" when the app was closed for long', () => {
      const store = memoryStore()
      const clock = fakeClock('2026-11-16T03:00:00')
      const before = setup({ store, now: clock.now }).entries
      before.addRun('Now', options)
      const second = before.addRun('Now', options)

      clock.set('2026-11-16T06:00:00')
      const { run, entries } = setup({ store, now: clock.now })
      entries.checkClock()

      expect(run.started).toHaveLength(0)
      expect(entries.list()[1]).toMatchObject({ id: second.id, status: 'Failed', note: 'missed start time' })
    })

    it('a Run that waited for its turn starts when the app opens again after a short while', () => {
      const store = memoryStore()
      const clock = fakeClock('2026-11-16T03:00:00')
      const before = setup({ store, now: clock.now }).entries
      before.addRun('Now', options)
      const second = before.addRun('Now', options)

      clock.set('2026-11-16T03:02:00')
      const { run, entries } = setup({ store, now: clock.now })
      entries.checkClock()

      expect(startedIds(run)).toEqual([second.id])
    })

    it('a Run still Waiting for its turn when its Hard stop passes never starts and gets Stopped with "hard stop"', async () => {
      const lines: LogLine[] = []
      const clock = fakeClock('2026-11-16T03:00:00')
      const { run, entries } = setup({ now: clock.now, log: (line) => lines.push(line) })
      const first = entries.addRun('Now', options)
      const second = entries.addRun({ clock: '04:00' }, { ...options, hardStop: '05:00' })

      clock.set('2026-11-16T04:00:10')
      entries.checkClock()
      clock.set('2026-11-16T05:00:00')
      entries.checkClock()
      run.finishRun(first.id, 'Done')
      await flush()

      expect(startedIds(run)).toEqual([first.id])
      expect(entries.list()[1]).toMatchObject({ id: second.id, status: 'Stopped', note: 'hard stop' })
      expect(lines).toContainEqual(expect.objectContaining({ status: 'Stopped', note: 'hard stop' }))
    })

    it('when a Running Run is stopped by its Hard stop, the next Run starts', async () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      const { run, entries } = setup({ now: clock.now })
      const first = entries.addRun('Now', { ...options, hardStop: '05:00' })
      const second = entries.addRun({ clock: '04:00' }, options)

      clock.set('2026-11-16T04:00:10')
      entries.checkClock()
      clock.set('2026-11-16T05:00:00')
      entries.checkClock()
      await flush()

      expect(startedIds(run)).toEqual([first.id, second.id])
      expect(entries.list().map((entry) => entry.status)).toEqual(['Stopped', 'Running'])
    })

    it.each<AttemptOutcome>(['Done', 'Failed', 'Limit reached'])('the next Run starts after a Run that ended %s', async (outcome) => {
      const { run, entries } = setup()
      const first = entries.addRun('Now', options)
      const second = entries.addRun('Now', options)

      run.finishRun(first.id, outcome)
      await flush()

      expect(entries.list().map((entry) => entry.status)).toEqual([outcome, 'Running'])
      expect(startedIds(run)).toEqual([first.id, second.id])
    })

    it('after Stop, the next Run waits until the stopped Claude has exited, so two agents never work at once', async () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      let exit: (report: AttemptReport) => void = () => {}
      const started: string[] = []
      const entries = createEntryList({
        runWakeAttempt: controlledAttempt().run,
        // Like Claude after SIGINT: it takes a while to exit.
        runRunAttempt: (entry) => {
          started.push(entry.id)
          return new Promise((resolve) => (exit = resolve))
        },
        store: memoryStore(),
        now: clock.now
      })
      const first = entries.addRun('Now', options)
      const second = entries.addRun('Now', options)

      entries.stop(first.id)
      entries.checkClock()
      expect(started).toEqual([first.id])
      expect(entries.list().map((entry) => entry.status)).toEqual(['Stopped', 'Waiting'])

      exit({ outcome: 'Failed' })
      await flush()

      expect(started).toEqual([first.id, second.id])
    })

    it('a Run whose Claude cannot even be started lets the next Run start', async () => {
      const started: string[] = []
      const entries = createEntryList({
        runWakeAttempt: controlledAttempt().run,
        runRunAttempt: (entry) => {
          started.push(entry.id)
          throw new Error('boom')
        },
        store: memoryStore()
      })
      const first = entries.addRun('Now', options)
      const second = entries.addRun('Now', options)
      await flush()

      expect(started).toEqual([first.id, second.id])
      expect(entries.list().map((entry) => entry.status)).toEqual(['Failed', 'Failed'])
    })

    it('the next Run starts after a Run stopped with the stop button', async () => {
      const { run, entries } = setup()
      const first = entries.addRun('Now', options)
      const second = entries.addRun('Now', options)

      entries.stop(first.id)
      await flush()

      expect(entries.list().map((entry) => entry.status)).toEqual(['Stopped', 'Running'])
      expect(startedIds(run)).toEqual([first.id, second.id])
    })
  })

  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      vi.setSystemTime(new Date('2026-11-16T10:01:00'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('a Run is not ended after 2 minutes, because it works until Claude exits by itself', async () => {
      const { run, entries } = setup()
      entries.addRun('Now', options)

      await vi.advanceTimersByTimeAsync(3 * 60 * 60_000)

      expect(run.aborted).toBe(false)
      expect(entries.list()[0].status).toBe('Running')
    })

    function memoryWindowEnd(end?: string) {
      let current = end === undefined ? undefined : new Date(end)
      return { get: () => current, set: (next: Date) => void (current = next) }
    }

    it('an answer when no Window end is set gives a Window end from the start of the Run, while it is still Running', async () => {
      const windowEnd = memoryWindowEnd()
      const { run, entries } = setup({ windowEnd })
      entries.addRun('Now', options)

      await vi.advanceTimersByTimeAsync(40_000)
      run.answer()

      expect(windowEnd.get()).toEqual(new Date('2026-11-16T15:00:00'))
      expect(entries.list()[0].status).toBe('Running')
    })

    it('an answer after the Window end gives a new Window end', () => {
      const windowEnd = memoryWindowEnd('2026-11-16T09:30:00')
      const { run, entries } = setup({ windowEnd })
      entries.addRun('Now', options)

      run.answer()

      expect(windowEnd.get()).toEqual(new Date('2026-11-16T15:00:00'))
    })

    it('a Run inside the known Window changes nothing', () => {
      const windowEnd = memoryWindowEnd('2026-11-16T12:00:00')
      const { run, entries } = setup({ windowEnd })
      entries.addRun('Now', options)

      run.answer()

      expect(windowEnd.get()).toEqual(new Date('2026-11-16T12:00:00'))
    })

    it('a Run that never got an answer does not change the Window end', async () => {
      const windowEnd = memoryWindowEnd('2026-11-16T09:30:00')
      const { run, entries } = setup({ windowEnd })
      entries.addRun('Now', options)

      run.finish('Failed')
      await vi.advanceTimersByTimeAsync(0)

      expect(windowEnd.get()).toEqual(new Date('2026-11-16T09:30:00'))
    })

    it('a Run gets no warning, even when it starts inside the known Window', () => {
      const { entries } = setup({ windowEnd: memoryWindowEnd('2026-11-16T12:00:00') })
      expect(entries.addRun({ clock: '11:00' }, options).warning).toBeUndefined()
    })
  })

  describe('log', () => {
    it('the line for a Run has its Project', async () => {
      const lines: LogLine[] = []
      const clock = fakeClock('2026-11-16T05:00:00Z')
      const { run, entries } = setup({ now: clock.now, log: (line) => lines.push(line) })
      entries.addRun('Now', options)

      run.finish('Done', { sessionId: 'abc', lastLine: 'Solved #4.' })
      await flush()

      expect(lines).toEqual([
        { time: '2026-11-16T05:00:00.000Z', project: options.project, status: 'Done', sessionId: 'abc', lastLine: 'Solved #4.' }
      ])
    })

    it('a Run that was denied some actions is Done, and its line shows how many', async () => {
      const lines: LogLine[] = []
      const { run, entries } = setup({ log: (line) => lines.push(line) })
      const entry = entries.addRun('Now', options)

      run.finish('Done', { sessionId: 'abc', lastLine: 'Solved #4.', deniedActions: 2 })
      await flush()

      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Done' })])
      expect(entries.list()[0].note).toBeUndefined()
      expect(lines).toEqual([expect.objectContaining({ status: 'Done', deniedActions: 2 })])
    })

    it('a Run with no denied actions has no number on its line', async () => {
      const lines: LogLine[] = []
      const { run, entries } = setup({ log: (line) => lines.push(line) })
      entries.addRun('Now', options)

      run.finish('Done', { sessionId: 'abc', lastLine: 'Solved #4.' })
      await flush()

      expect(lines[0]).not.toHaveProperty('deniedActions')
    })

    it('a Run stopped because Claude Code is not logged in is Failed with "not logged in", on the Entry and the line', async () => {
      const lines: LogLine[] = []
      const { run, entries } = setup({ log: (line) => lines.push(line) })
      const entry = entries.addRun('Now', options)

      run.finish('Failed', { sessionId: 'abc', lastLine: 'Not logged in · Please run /login', note: 'not logged in' })
      await flush()

      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Failed', note: 'not logged in' })])
      expect(lines).toEqual([expect.objectContaining({ project: options.project, status: 'Failed', note: 'not logged in' })])
    })

    it('a Run that hit the usage limit gets Limit reached, on the Entry and the line', async () => {
      const lines: LogLine[] = []
      const { run, entries } = setup({ log: (line) => lines.push(line) })
      const entry = entries.addRun('Now', options)

      run.finish('Limit reached', { sessionId: 'abc', lastLine: "You've hit your limit" })
      await flush()

      expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Limit reached' })])
      expect(lines).toEqual([expect.objectContaining({ project: options.project, status: 'Limit reached', sessionId: 'abc' })])
    })

    it('a Run that got Limit reached is not started again', async () => {
      const { run, entries } = setup()
      entries.addRun('Now', options)

      run.finish('Limit reached')
      await flush()
      entries.checkClock()
      await flush()

      expect(run.started).toHaveLength(1)
      expect(entries.list()[0].status).toBe('Limit reached')
    })

    it('a Run that missed its Start time adds a line with its Project', () => {
      const lines: LogLine[] = []
      const clock = fakeClock('2026-11-15T22:00:00')
      const { entries } = setup({ now: clock.now, log: (line) => lines.push(line) })
      entries.addRun({ clock: '04:00' }, options)

      clock.set('2026-11-16T04:10:00')
      entries.checkClock()

      expect(lines).toEqual([expect.objectContaining({ project: options.project, status: 'Failed', note: 'missed start time' })])
    })

    it('a Run cut off by a crash adds a line with its Project when the app starts again', () => {
      const lines: LogLine[] = []
      const store = memoryStore([{ id: 'r', kind: 'Run', startTime: 'Now', retry: false, status: 'Running', run: options }])
      setup({ store, log: (line) => lines.push(line) })

      expect(lines).toEqual([expect.objectContaining({ project: options.project, status: 'Failed' })])
    })
  })

  describe('Quit', () => {
    it('stops the Running Run, which is Stopped at the next start, with one Stopped line', async () => {
      const lines: LogLine[] = []
      const store = memoryStore()
      const { run, entries } = setup({ store, log: (line) => lines.push(line) })
      const entry = entries.addRun('Now', options)

      await entries.quit()

      expect(run.aborted).toBe(true)
      expect(lines).toEqual([expect.objectContaining({ status: 'Stopped' })])
      expect(setup({ store }).entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Stopped' })])
    })

    it('does not start the next Run in the queue', async () => {
      const store = memoryStore()
      const { run, entries } = setup({ store })
      entries.addRun('Now', options)
      const second = entries.addRun('Now', options)

      await entries.quit()
      entries.checkClock()
      await flush()

      expect(run.started).toHaveLength(1)
      expect(store.saved[1]).toMatchObject({ id: second.id, status: 'Waiting' })
    })

    it('waits until the stopped Claude has exited', async () => {
      let exit: (report: AttemptReport) => void = () => {}
      const entries = createEntryList({
        runWakeAttempt: controlledAttempt().run,
        runRunAttempt: () => new Promise((resolve) => (exit = resolve)),
        store: memoryStore()
      })
      entries.addRun('Now', options)
      let quitDone = false

      const quitting = entries.quit().then(() => (quitDone = true))
      await flush()
      expect(quitDone).toBe(false)

      exit({ outcome: 'Failed' })
      await quitting
      expect(quitDone).toBe(true)
    })

    it('ends a Running Wake and starts no more Entries, not even a Wake whose Start time comes', async () => {
      const clock = fakeClock('2026-11-16T03:00:00')
      const { wake, entries } = setup({ now: clock.now })
      const running = entries.addWake('Now', { retry: true })
      entries.addWake({ clock: '03:30' })

      await entries.quit()
      clock.set('2026-11-16T03:30:10')
      entries.checkClock()
      entries.addWake('Now')

      expect(wake.aborted).toBe(true)
      expect(wake.calls).toBe(1)
      expect(entries.list().map((entry) => entry.status)).toEqual(['Stopped', 'Waiting', 'Waiting'])
      expect(entries.list()[0].id).toBe(running.id)
    })

    it('leaves Waiting Entries Waiting, so the missed Start time rule applies at the next start', async () => {
      const store = memoryStore()
      const clock = fakeClock('2026-11-16T03:00:00')
      const { entries } = setup({ store, now: clock.now })
      entries.addRun({ clock: '04:00' }, options)

      await entries.quit()
      clock.set('2026-11-16T06:00:00')
      const after = setup({ store, now: clock.now })
      after.entries.checkClock()

      expect(after.run.started).toHaveLength(0)
      expect(after.entries.list()[0]).toMatchObject({ status: 'Failed', note: 'missed start time' })
    })
  })
})

describe('remove', () => {
  const options: RunOptions = { project: '/Users/me/dev/shop', prompt: 'Solve one issue', permissionMode: 'Auto', model: 'opus' }

  it.each<AttemptOutcome>(['Done', 'Limit reached', 'Failed'])('a %s Run can be removed and disappears from the list', async (outcome) => {
    let finish: (report: AttemptReport) => void = () => {}
    const entries = createEntryList({
      runWakeAttempt: async () => ({ outcome: 'Done' }),
      runRunAttempt: () => new Promise((resolve) => (finish = resolve)),
      store: memoryStore()
    })
    const entry = entries.addRun('Now', options)
    finish({ outcome })
    await flush()

    entries.remove(entry.id)

    expect(entries.list()).toEqual([])
  })

  it('a Stopped Entry can be removed', async () => {
    const attempt = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
    const entry = entries.addWake('Now', { retry: true })
    entries.stop(entry.id)
    await flush()

    entries.remove(entry.id)

    expect(entries.list()).toEqual([])
  })

  it('a Waiting Wake can be removed, and then it never starts', () => {
    const clock = fakeClock('2026-11-16T03:00:00')
    const attempt = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore(), now: clock.now })
    const entry = entries.addWake({ clock: '04:00' })

    entries.remove(entry.id)
    clock.set('2026-11-16T04:00:10')
    entries.checkClock()

    expect(entries.list()).toEqual([])
    expect(attempt.calls).toBe(0)
  })

  it('a Run Waiting for its turn can be removed, and then it never starts', async () => {
    const started: string[] = []
    let finish: (report: AttemptReport) => void = () => {}
    const entries = createEntryList({
      runWakeAttempt: async () => ({ outcome: 'Done' }),
      runRunAttempt: (entry) => {
        started.push(entry.id)
        return new Promise((resolve) => (finish = resolve))
      },
      store: memoryStore()
    })
    const first = entries.addRun('Now', options)
    const second = entries.addRun('Now', options)

    entries.remove(second.id)
    finish({ outcome: 'Done' })
    await flush()

    expect(started).toEqual([first.id])
    expect(entries.list()).toEqual([expect.objectContaining({ id: first.id, status: 'Done' })])
  })

  it('a Running Entry cannot be removed', () => {
    const attempt = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: attempt.run, store: memoryStore() })
    const entry = entries.addWake('Now')

    entries.remove(entry.id)

    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Running' })])
    expect(attempt.aborted).toBe(false)
  })

  it('a removed Entry stays gone after a restart', async () => {
    const store = memoryStore()
    const entries = createEntryList({ runWakeAttempt: async () => ({ outcome: 'Done' }), store })
    const entry = entries.addWake('Now')
    await flush()

    entries.remove(entry.id)

    expect(createEntryList({ runWakeAttempt: async () => ({ outcome: 'Done' }), store }).list()).toEqual([])
  })

  it('removing an Entry adds no log line', async () => {
    const lines: LogLine[] = []
    const entries = createEntryList({ runWakeAttempt: async () => ({ outcome: 'Done' }), store: memoryStore(), log: (line) => lines.push(line) })
    const entry = entries.addWake('Now')
    await flush()
    const before = [...lines]

    entries.remove(entry.id)

    expect(lines).toEqual(before)
  })

  it('a stopped Wake removed while its Attempt is still ending still gets its Stopped line', async () => {
    const lines: LogLine[] = []
    let finish: (report: AttemptReport) => void = () => {}
    // An Attempt that ignores the abort, like a Claude that takes a moment to exit.
    const entries = createEntryList({
      runWakeAttempt: () => new Promise((resolve) => (finish = resolve)),
      store: memoryStore(),
      log: (line) => lines.push(line)
    })
    const entry = entries.addWake('Now', { retry: true })
    entries.stop(entry.id)

    entries.remove(entry.id)
    finish({ outcome: 'Failed' })
    await flush()

    expect(entries.list()).toEqual([])
    expect(lines).toEqual([expect.objectContaining({ status: 'Stopped' })])
  })
})
