import { describe, expect, it } from 'vitest'
import { durationLabel } from './durationLabel'

const minute = 60_000
const hour = 60 * minute

describe('label for a time left', () => {
  it('shows whole hours as hours', () => {
    expect(durationLabel(2 * hour)).toBe('2 h')
  })

  it('shows hours and minutes', () => {
    expect(durationLabel(2 * hour + 15 * minute)).toBe('2 h 15 min')
  })

  it('shows only minutes under an hour', () => {
    expect(durationLabel(45 * minute)).toBe('45 min')
  })

  it('rounds a part of a minute up, so the label never says 0 min before the end', () => {
    expect(durationLabel(10_000)).toBe('1 min')
    expect(durationLabel(hour - 30_000)).toBe('1 h')
  })

  it('shows days and hours from 24 hours up, leaving out the minutes', () => {
    expect(durationLabel(3 * 24 * hour + 4 * hour + 20 * minute)).toBe('3 d 4 h')
    expect(durationLabel(24 * hour)).toBe('1 d')
  })
})
