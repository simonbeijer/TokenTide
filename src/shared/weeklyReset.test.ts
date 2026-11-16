import { describe, expect, it } from 'vitest'
import { nextWeeklyReset } from './weeklyReset'

const at = (text: string) => new Date(text)

// Nov 16, 2026 is a Monday.
describe('next Weekly reset', () => {
  it('a reset later this week comes this week', () => {
    expect(nextWeeklyReset({ weekday: 4, clock: '09:00' }, at('2026-11-16T10:00:00'))).toEqual(at('2026-11-19T09:00:00'))
  })

  it('a reset later today comes today', () => {
    expect(nextWeeklyReset({ weekday: 1, clock: '18:30' }, at('2026-11-16T10:00:00'))).toEqual(at('2026-11-16T18:30:00'))
  })

  it('a reset earlier today comes next week', () => {
    expect(nextWeeklyReset({ weekday: 1, clock: '09:00' }, at('2026-11-16T10:00:00'))).toEqual(at('2026-11-23T09:00:00'))
  })

  it('a reset on an earlier weekday comes next week', () => {
    expect(nextWeeklyReset({ weekday: 0, clock: '23:00' }, at('2026-11-16T10:00:00'))).toEqual(at('2026-11-22T23:00:00'))
  })

  it('once the reset has passed, it repeats a week later', () => {
    expect(nextWeeklyReset({ weekday: 1, clock: '10:00' }, at('2026-11-16T10:00:00'))).toEqual(at('2026-11-23T10:00:00'))
  })

  it('rolls over into a new month and a new year', () => {
    // Dec 31, 2026 is a Thursday.
    expect(nextWeeklyReset({ weekday: 2, clock: '01:00' }, at('2026-12-31T12:00:00'))).toEqual(at('2027-01-05T01:00:00'))
  })

  it.each([
    { weekday: 7, clock: '10:00' },
    { weekday: -1, clock: '10:00' },
    { weekday: 1.5, clock: '10:00' },
    { weekday: 1, clock: '24:00' }
  ])('rejects %j, which is not a Weekly reset', (reset) => {
    expect(() => nextWeeklyReset(reset, at('2026-11-16T10:00:00'))).toThrow()
  })
})
