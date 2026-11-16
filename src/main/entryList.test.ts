import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry } from '../shared/entry'
import type { AttemptOutcome } from './attemptOutcome'
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
  let finish: (outcome: AttemptOutcome) => void = () => {}
  let signal: AbortSignal | undefined
  let calls = 0
  return {
    run: (attemptSignal: AbortSignal) => {
      calls++
      signal = attemptSignal
      return new Promise<AttemptOutcome>((resolve) => {
        finish = resolve
        attemptSignal.addEventListener('abort', () => resolve('Failed'))
      })
    },
    finish: (outcome: AttemptOutcome) => finish(outcome),
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
          new Promise<AttemptOutcome>((resolve) => signal.addEventListener('abort', () => resolve('Done'))),
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
  })
})
