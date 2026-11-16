import { describe, expect, it } from 'vitest'
import { windowStatus } from './windowStatus'

const at = (text: string) => new Date(text)
const hour = 60 * 60_000

describe('the Window from a Window end', () => {
  it('with no Window end, there is no Window and a new one can start now', () => {
    expect(windowStatus(undefined, at('2026-11-16T10:00:00'))).toEqual({ current: null, nextStartsIn: 0 })
  })

  it('a Window end in the future gives a Window that has filled for the time since its start', () => {
    expect(windowStatus(at('2026-11-16T12:00:00'), at('2026-11-16T10:00:00'))).toEqual({
      current: { filled: 3 / 5, endsIn: 2 * hour },
      nextStartsIn: 2 * hour
    })
  })

  it('a Window that has just started is empty', () => {
    expect(windowStatus(at('2026-11-16T15:00:00'), at('2026-11-16T10:00:00')).current?.filled).toBe(0)
  })

  it('a Window end more than 5 hours away gives an empty bar, never a negative one', () => {
    expect(windowStatus(at('2026-11-17T08:00:00'), at('2026-11-16T10:00:00'))).toEqual({
      current: { filled: 0, endsIn: 22 * hour },
      nextStartsIn: 22 * hour
    })
  })

  it('at the Window end, there is no Window and a new one can start now', () => {
    expect(windowStatus(at('2026-11-16T10:00:00'), at('2026-11-16T10:00:00'))).toEqual({ current: null, nextStartsIn: 0 })
  })

  it('after the Window end, there is no Window and a new one can start now', () => {
    expect(windowStatus(at('2026-11-16T09:00:00'), at('2026-11-16T10:00:00'))).toEqual({ current: null, nextStartsIn: 0 })
  })
})
