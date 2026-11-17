import { describe, expect, it } from 'vitest'
import { hardStopAfter, hardStopPassed } from './hardStop'

describe('hardStopAfter', () => {
  it('is later the same day when the clock time comes after the Start time', () => {
    expect(hardStopAfter('18:00', new Date('2026-11-16T10:00:00'))).toEqual(new Date('2026-11-16T18:00:00'))
  })

  it('is the next day when the clock time comes before the Start time', () => {
    expect(hardStopAfter('06:00', new Date('2026-11-15T22:00:00'))).toEqual(new Date('2026-11-16T06:00:00'))
  })

  it('is a day later when the clock time is the Start time itself, because it must come after it', () => {
    expect(hardStopAfter('04:00', new Date('2026-11-16T04:00:00'))).toEqual(new Date('2026-11-17T04:00:00'))
  })

  it('is a day later when the Start time is within the same minute', () => {
    expect(hardStopAfter('10:00', new Date('2026-11-16T10:00:30'))).toEqual(new Date('2026-11-17T10:00:00'))
  })
})

describe('hardStopPassed', () => {
  const hardStop = new Date('2026-11-16T18:00:00')

  it('has not passed before the Hard stop', () => {
    expect(hardStopPassed(hardStop, new Date('2026-11-16T17:59:59'))).toBe(false)
  })

  it('has passed at and after the Hard stop', () => {
    expect(hardStopPassed(hardStop, new Date('2026-11-16T18:00:00'))).toBe(true)
    expect(hardStopPassed(hardStop, new Date('2026-11-17T09:00:00'))).toBe(true)
  })

  it('never passes for a Run without a Hard stop', () => {
    expect(hardStopPassed(undefined, new Date('2099-01-01T00:00:00'))).toBe(false)
  })
})
