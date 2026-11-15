import { describe, expect, it } from 'vitest'
import { startTimeLabel } from './startTimeLabel'

const now = new Date('2026-11-15T22:00:00')
const iso = (text: string) => new Date(text).toISOString()

describe('label for a Start time in the list', () => {
  it('shows Now as Now', () => {
    expect(startTimeLabel('Now', now)).toBe('Now')
  })

  it('shows only the clock time for a Start time today', () => {
    expect(startTimeLabel({ at: iso('2026-11-15T23:30:00') }, now)).toBe('23:30')
  })

  it('adds "tomorrow" for a Start time tomorrow', () => {
    expect(startTimeLabel({ at: iso('2026-11-16T05:00:00') }, now)).toBe('05:00 tomorrow')
  })

  it('adds the date for an older Start time, so a finished Entry never says "tomorrow"', () => {
    expect(startTimeLabel({ at: iso('2026-11-13T05:00:00') }, now)).toBe('05:00, Nov 13')
  })
})
