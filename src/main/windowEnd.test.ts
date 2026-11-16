import { describe, expect, it } from 'vitest'
import { windowEndFrom } from './windowEnd'

const at = (text: string) => new Date(text)

describe('Window end from a typed clock time', () => {
  it('a clock time up to 5 hours ahead is the next time the clock shows it', () => {
    expect(windowEndFrom('14:00', at('2026-11-16T10:00:00'))).toEqual(at('2026-11-16T14:00:00'))
  })

  it('exactly 5 hours ahead still counts as ahead', () => {
    expect(windowEndFrom('15:00', at('2026-11-16T10:00:00'))).toEqual(at('2026-11-16T15:00:00'))
  })

  it('a clock time more than 5 hours ahead has already passed, so it is the last time the clock showed it', () => {
    expect(windowEndFrom('09:30', at('2026-11-16T10:00:00'))).toEqual(at('2026-11-16T09:30:00'))
  })

  it('looks back across midnight', () => {
    expect(windowEndFrom('23:30', at('2026-11-16T00:10:00'))).toEqual(at('2026-11-15T23:30:00'))
  })

  it('looks ahead across midnight', () => {
    expect(windowEndFrom('02:00', at('2026-11-15T23:00:00'))).toEqual(at('2026-11-16T02:00:00'))
  })
})
