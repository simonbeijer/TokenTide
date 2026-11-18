import { describe, expect, it } from 'vitest'
import type { Entry, EntryStatus } from '../shared/entry'
import { createKeepAwake, type PowerSaveBlocker } from './keepAwake'

/** Stands in for Electron's powerSaveBlocker, so nothing really keeps the computer awake. */
function fakeBlocker() {
  const started = new Set<number>()
  let nextBlockId = 1
  const blocker: PowerSaveBlocker = {
    start: () => {
      const id = nextBlockId++
      started.add(id)
      return id
    },
    stop: (id) => {
      started.delete(id)
    }
  }
  return { blocker, keepingAwake: () => started.size > 0, blockCount: () => started.size }
}

let nextId = 0
const entry = (status: EntryStatus, kind: Entry['kind'] = 'Wake'): Entry => ({
  id: `entry-${nextId++}`,
  kind,
  startTime: { at: new Date('2026-11-18T03:00:00').toISOString() },
  retry: false,
  status
})

describe('keep awake', () => {
  it('keeps the computer awake while an Entry is Waiting', () => {
    const fake = fakeBlocker()
    createKeepAwake(fake.blocker).update([entry('Waiting')])
    expect(fake.keepingAwake()).toBe(true)
  })

  it('keeps the computer awake while a Run is Running', () => {
    const fake = fakeBlocker()
    createKeepAwake(fake.blocker).update([entry('Done'), entry('Running', 'Run')])
    expect(fake.keepingAwake()).toBe(true)
  })

  it('lets the computer sleep when every Entry has ended', () => {
    const fake = fakeBlocker()
    createKeepAwake(fake.blocker).update(
      (['Done', 'Limit reached', 'Stopped', 'Failed'] as const).map((status) => entry(status))
    )
    expect(fake.keepingAwake()).toBe(false)
  })

  it('stops keeping the computer awake when the last Waiting or Running Entry ends', () => {
    const fake = fakeBlocker()
    const keepAwake = createKeepAwake(fake.blocker)
    keepAwake.update([entry('Waiting')])
    keepAwake.update([entry('Running')])
    keepAwake.update([entry('Done')])
    expect(fake.keepingAwake()).toBe(false)
  })

  it('stops keeping the computer awake when the last Waiting Entry is removed', () => {
    const fake = fakeBlocker()
    const keepAwake = createKeepAwake(fake.blocker)
    keepAwake.update([entry('Waiting')])
    keepAwake.update([])
    expect(fake.keepingAwake()).toBe(false)
  })

  it('holds a single block however often the list changes', () => {
    const fake = fakeBlocker()
    const keepAwake = createKeepAwake(fake.blocker)
    keepAwake.update([entry('Waiting')])
    keepAwake.update([entry('Waiting'), entry('Waiting')])
    keepAwake.update([entry('Running')])
    expect(fake.blockCount()).toBe(1)
  })

  it('keeps the computer awake again when a new Entry is added after all had ended', () => {
    const fake = fakeBlocker()
    const keepAwake = createKeepAwake(fake.blocker)
    keepAwake.update([entry('Waiting')])
    keepAwake.update([entry('Done')])
    keepAwake.update([entry('Done'), entry('Waiting')])
    expect(fake.keepingAwake()).toBe(true)
  })

  it('on Quit stops keeping the computer awake for good, though Waiting Entries stay Waiting', () => {
    const fake = fakeBlocker()
    const keepAwake = createKeepAwake(fake.blocker)
    keepAwake.update([entry('Waiting'), entry('Running', 'Run')])
    keepAwake.quit()
    // Quit stops the Running Run, and that change still reaches the list's listeners.
    keepAwake.update([entry('Waiting'), entry('Stopped', 'Run')])
    expect(fake.keepingAwake()).toBe(false)
  })
})
