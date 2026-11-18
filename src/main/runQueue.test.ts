import { describe, expect, it } from 'vitest'
import type { Entry } from '../shared/entry'
import { runQueue, startTimeOf } from './runQueue'

const now = new Date('2026-11-16T05:00:00')

let nextId = 0
const run = (startAt: string | 'Now', fields: Partial<Entry> = {}): Entry => ({
  id: `run-${nextId++}`,
  kind: 'Run',
  startTime: startAt === 'Now' ? 'Now' : { at: new Date(startAt).toISOString() },
  retry: false,
  status: 'Waiting',
  ...fields
})
const ids = (entries: Entry[]) => entries.map((entry) => entry.id)

describe('run queue', () => {
  it('holds the Waiting Runs whose Start time has come, earliest Start time first', () => {
    const late = run('2026-11-16T04:30:00')
    const early = run('2026-11-16T04:00:00')
    const notYet = run('2026-11-16T05:00:01')

    expect(ids(runQueue([late, early, notYet], now))).toEqual([early.id, late.id])
  })

  it('a Run whose Start time is exactly now is in the queue', () => {
    const due = run('2026-11-16T05:00:00')
    expect(ids(runQueue([due], now))).toEqual([due.id])
  })

  it('Runs with the same Start time stay in the order they were added', () => {
    const first = run('2026-11-16T04:00:00')
    const second = run('2026-11-16T04:00:00')
    const third = run('2026-11-16T04:00:00')

    expect(ids(runQueue([first, second, third], now))).toEqual([first.id, second.id, third.id])
  })

  it('a Run added with Start time Now is due from the moment it was added', () => {
    const clockRun = run('2026-11-16T04:30:00')
    const nowRun = run('Now', { addedAt: new Date('2026-11-16T04:10:00').toISOString() })

    expect(ids(runQueue([clockRun, nowRun], now))).toEqual([nowRun.id, clockRun.id])
  })

  it('an Entry with Start time Now and no time it was added, such as a Wake, stands for now', () => {
    expect(startTimeOf(run('Now', { kind: 'Wake' }), now)).toEqual(now)
  })

  it('leaves out Wakes and Runs that are not Waiting', () => {
    const wake: Entry = { ...run('2026-11-16T04:00:00'), kind: 'Wake' }
    const running = run('2026-11-16T04:00:00', { status: 'Running' })
    const done = run('2026-11-16T04:00:00', { status: 'Done' })

    expect(runQueue([wake, running, done], now)).toEqual([])
  })

  it('leaves out a Run whose Hard stop has passed, because it must never start', () => {
    const pastHardStop = run('2026-11-16T04:00:00', { hardStopAt: new Date('2026-11-16T05:00:00').toISOString() })
    const beforeHardStop = run('2026-11-16T04:00:00', { hardStopAt: new Date('2026-11-16T06:00:00').toISOString() })

    expect(ids(runQueue([pastHardStop, beforeHardStop], now))).toEqual([beforeHardStop.id])
  })
})
