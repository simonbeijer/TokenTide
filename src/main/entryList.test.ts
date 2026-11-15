import { describe, expect, it } from 'vitest'
import type { AttemptOutcome } from './attemptOutcome'
import { createEntryList } from './entryList'

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

describe('entry list', () => {
  it('a Wake with Start time Now lands in the list as Waiting and starts right away', () => {
    const attempt = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: attempt.run })
    const seen: string[] = []
    entries.onChange((list) => seen.push(list[0].status))

    const entry = entries.addWake()

    expect(entry).toMatchObject({ kind: 'Wake', startTime: 'Now' })
    expect(seen).toEqual(['Waiting', 'Running'])
    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Running' })])
    expect(attempt.calls).toBe(1)
  })

  it.each<AttemptOutcome>(['Done', 'Failed'])('the Wake becomes %s when its Attempt ends that way', async (outcome) => {
    const attempt = controlledAttempt()
    const entries = createEntryList({ runWakeAttempt: attempt.run })
    const entry = entries.addWake()

    attempt.finish(outcome)
    await flush()

    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: outcome })])
  })

  it('the Wake is Failed when its Attempt throws', async () => {
    const entries = createEntryList({ runWakeAttempt: () => Promise.reject(new Error('boom')) })
    const entry = entries.addWake()

    await flush()

    expect(entries.list()).toEqual([expect.objectContaining({ id: entry.id, status: 'Failed' })])
  })
})
