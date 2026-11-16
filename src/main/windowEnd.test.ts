import { describe, expect, it } from 'vitest'
import { roundDownToTenMinutes, startsInsideWindow, windowEndAfterAnswer, windowEndFrom } from './windowEnd'

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

describe('rounding a Window start down to 10 minutes', () => {
  it.each([
    ['2026-11-16T10:01:00', '2026-11-16T10:00:00'],
    ['2026-11-16T10:00:00', '2026-11-16T10:00:00'],
    ['2026-11-16T10:09:59', '2026-11-16T10:00:00'],
    ['2026-11-16T07:08:30', '2026-11-16T07:00:00'],
    ['2026-11-16T00:25:00', '2026-11-16T00:20:00']
  ])('%s rounds down to %s', (start, rounded) => {
    expect(roundDownToTenMinutes(at(start))).toEqual(at(rounded))
  })
})

describe('Window end after a Wake gets an answer', () => {
  it('with no Window end set, a Wake at 10:01 gives a Window from 10:00 to 15:00', () => {
    expect(windowEndAfterAnswer(undefined, at('2026-11-16T10:01:00'))).toEqual(at('2026-11-16T15:00:00'))
  })

  it('an Attempt after the Window end gives a new Window end', () => {
    expect(windowEndAfterAnswer(at('2026-11-16T10:00:00'), at('2026-11-16T10:01:00'))).toEqual(
      at('2026-11-16T15:00:00')
    )
  })

  it('an Attempt inside the known Window changes nothing', () => {
    expect(windowEndAfterAnswer(at('2026-11-16T12:00:00'), at('2026-11-16T10:01:00'))).toBeUndefined()
  })

  it('an Attempt exactly at the Window end changes nothing', () => {
    expect(windowEndAfterAnswer(at('2026-11-16T10:00:00'), at('2026-11-16T10:00:00'))).toBeUndefined()
  })
})

describe('a Wake that starts inside the Window', () => {
  it('has no warning when no Window end is set', () => {
    expect(startsInsideWindow(at('2026-11-16T10:00:00'), undefined)).toBe(false)
  })

  it('has a warning when its Start time is before the Window end', () => {
    expect(startsInsideWindow(at('2026-11-16T09:00:00'), at('2026-11-16T10:00:00'))).toBe(true)
  })

  it('has a warning when its Start time is exactly the Window end', () => {
    expect(startsInsideWindow(at('2026-11-16T10:00:00'), at('2026-11-16T10:00:00'))).toBe(true)
  })

  it('has no warning when its Start time is after the Window end', () => {
    expect(startsInsideWindow(at('2026-11-16T10:01:00'), at('2026-11-16T10:00:00'))).toBe(false)
  })
})
