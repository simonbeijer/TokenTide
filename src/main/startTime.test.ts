import { describe, expect, it } from 'vitest'
import { nextOccurrence } from './startTime'

const at = (text: string) => new Date(text)

describe('next occurrence of a clock time, within 24 hours', () => {
  it('a clock time later today gives a Start time today', () => {
    expect(nextOccurrence('14:30', at('2026-11-15T10:00:00'))).toEqual(at('2026-11-15T14:30:00'))
  })

  it('a clock time that has already passed today gives a Start time tomorrow', () => {
    expect(nextOccurrence('09:15', at('2026-11-15T10:00:00'))).toEqual(at('2026-11-16T09:15:00'))
  })

  it('the clock time of the current minute counts as today, so the Entry is due right away', () => {
    expect(nextOccurrence('10:00', at('2026-11-15T10:00:40'))).toEqual(at('2026-11-15T10:00:00'))
  })

  it('the minute before now is tomorrow, almost 24 hours away', () => {
    expect(nextOccurrence('09:59', at('2026-11-15T10:00:40'))).toEqual(at('2026-11-16T09:59:00'))
  })

  describe('around midnight', () => {
    it('00:10 chosen at 23:50 is ten minutes later, the next day', () => {
      expect(nextOccurrence('00:10', at('2026-11-15T23:50:00'))).toEqual(at('2026-11-16T00:10:00'))
    })

    it('23:50 chosen at 00:10 is later the same day', () => {
      expect(nextOccurrence('23:50', at('2026-11-16T00:10:00'))).toEqual(at('2026-11-16T23:50:00'))
    })

    it('00:00 chosen at 23:59 is midnight, one minute later', () => {
      expect(nextOccurrence('00:00', at('2026-11-15T23:59:30'))).toEqual(at('2026-11-16T00:00:00'))
    })

    it('rolls over into a new month and a new year', () => {
      expect(nextOccurrence('01:00', at('2026-12-31T22:00:00'))).toEqual(at('2027-01-01T01:00:00'))
    })
  })

  it.each(['', '7', '24:00', '12:60', '1230', 'ab:cd'])('rejects %j, which is not a clock time', (clock) => {
    expect(() => nextOccurrence(clock, at('2026-11-15T10:00:00'))).toThrow()
  })
})
