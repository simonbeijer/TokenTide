import { describe, expect, it } from 'vitest'
import { formatClock, parseClock } from './clock'

describe('clock time', () => {
  it('reads hours and minutes from "HH:MM"', () => {
    expect(parseClock('07:05')).toEqual({ hours: 7, minutes: 5 })
  })

  it.each(['', '7', '24:00', '12:60', '1230'])('rejects %j', (clock) => {
    expect(() => parseClock(clock)).toThrow()
  })

  it('writes a moment as "HH:MM" with two digits each', () => {
    expect(formatClock(new Date('2026-11-16T07:05:30'))).toBe('07:05')
  })
})
