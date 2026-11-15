import { describe, expect, it } from 'vitest'
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

function controlledAttempt() {
  let finish: (outcome: AttemptOutcome) => void = () => {}
  let calls = 0
  return {
    run: () => {
      calls++
      return new Promise<AttemptOutcome>((resolve) => (finish = resolve))
    },
    finish: (outcome: AttemptOutcome) => finish(outcome),
    get calls() {
      return calls
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

      expect(after.list()).toEqual([{ id: entry.id, kind: 'Wake', startTime: 'Now', status: 'Done' }])
    })

    it('gives Failed to an Entry still marked Running at start, and does not start it again', () => {
      const store = memoryStore([
        { id: 'cut-off', kind: 'Wake', startTime: 'Now', status: 'Running' },
        { id: 'finished', kind: 'Wake', startTime: 'Now', status: 'Done' }
      ])
      const attempt = controlledAttempt()

      const entries = createEntryList({ runWakeAttempt: attempt.run, store })

      expect(entries.list()).toEqual([
        { id: 'cut-off', kind: 'Wake', startTime: 'Now', status: 'Failed' },
        { id: 'finished', kind: 'Wake', startTime: 'Now', status: 'Done' }
      ])
      expect(store.saved.map((entry) => entry.status)).toEqual(['Failed', 'Done'])
      expect(attempt.calls).toBe(0)
    })
  })
})
