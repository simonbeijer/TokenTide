import { describe, expect, it } from 'vitest'
import { isMissed, missedAfter } from './lateness'

const at = (text: string) => new Date(text)
const startTime = at('2026-11-16T05:00:00')

describe('missed Start time', () => {
  it('allows up to 5 minutes of lateness', () => {
    expect(missedAfter).toBe(5 * 60_000)
  })

  it('an Entry found on time is not missed', () => {
    expect(isMissed(startTime, at('2026-11-16T05:00:00'))).toBe(false)
  })

  it('an Entry found exactly 5 minutes late is not missed', () => {
    expect(isMissed(startTime, at('2026-11-16T05:05:00'))).toBe(false)
  })

  it('an Entry found more than 5 minutes late is missed', () => {
    expect(isMissed(startTime, at('2026-11-16T05:05:01'))).toBe(true)
  })

  it('an Entry found hours later is missed', () => {
    expect(isMissed(startTime, at('2026-11-16T09:00:00'))).toBe(true)
  })
})
