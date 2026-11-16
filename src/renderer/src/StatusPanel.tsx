import { useEffect, useState } from 'react'
import type { StatusValues } from '../../shared/api'
import { formatClock } from '../../shared/clock'
import { durationLabel } from '../../shared/durationLabel'
import { nextWeeklyReset, type WeeklyReset } from '../../shared/weeklyReset'
import { windowStatus } from '../../shared/windowStatus'

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// The list starts on Monday; the values stay as in `Date.getDay`.
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]

/** The next Weekly reset, or none when the saved value is missing or unreadable, so a bad settings file never breaks the panel. */
const nextResetOf = (reset: WeeklyReset | undefined, now: Date): Date | undefined => {
  if (!reset) return undefined
  try {
    return nextWeeklyReset(reset, now)
  } catch {
    return undefined
  }
}

interface Props {
  now: Date
}

/** The Windows and the time left until the Weekly reset, with the two values the user types in. */
export function StatusPanel({ now }: Props) {
  const [values, setValues] = useState<StatusValues>({})
  const [windowEndDraft, setWindowEndDraft] = useState('')
  const [weekdayDraft, setWeekdayDraft] = useState(1)
  const [resetClockDraft, setResetClockDraft] = useState('')

  useEffect(() => {
    void window.tokentide.getStatusValues().then((loaded) => {
      setValues(loaded)
      if (loaded.windowEnd) setWindowEndDraft(formatClock(new Date(loaded.windowEnd)))
      if (loaded.weeklyReset) {
        setWeekdayDraft(loaded.weeklyReset.weekday)
        setResetClockDraft(loaded.weeklyReset.clock)
      }
    })
  }, [])

  const windows = windowStatus(values.windowEnd ? new Date(values.windowEnd) : undefined, now)
  const nextReset = nextResetOf(values.weeklyReset, now)

  return (
    <section className="status-panel" aria-label="Status panel">
      <div className="status-row">
        <span className="status-label">Current Window</span>
        {windows.current ? (
          <>
            <progress className="window-bar" value={windows.current.filled} max={1} aria-label="Current Window" />
            <span className="status-value">ends in {durationLabel(windows.current.endsIn)}</span>
          </>
        ) : (
          <span className="status-value status-none">No Window</span>
        )}
      </div>
      <div className="status-row">
        <span className="status-label">Next Window</span>
        <span className="status-value">
          {windows.nextStartsIn > 0 ? `in ${durationLabel(windows.nextStartsIn)}` : 'can start now'}
        </span>
      </div>
      <div className="status-row">
        <span className="status-label">Weekly reset</span>
        <span className={nextReset ? 'status-value' : 'status-value status-none'}>
          {nextReset ? `in ${durationLabel(nextReset.getTime() - now.getTime())}` : 'Not set'}
        </span>
      </div>

      <form
        className="status-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (windowEndDraft === '') return
          void window.tokentide.setWindowEnd(windowEndDraft).then(setValues)
        }}
      >
        <label>
          Window end{' '}
          <input
            type="time"
            aria-label="Window end"
            value={windowEndDraft}
            onChange={(event) => setWindowEndDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={windowEndDraft === ''}>
          Set
        </button>
      </form>
      <form
        className="status-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (resetClockDraft === '') return
          void window.tokentide.setWeeklyReset({ weekday: weekdayDraft, clock: resetClockDraft }).then(setValues)
        }}
      >
        <label>
          Weekly reset{' '}
          <select
            aria-label="Weekly reset weekday"
            value={weekdayDraft}
            onChange={(event) => setWeekdayDraft(Number(event.target.value))}
          >
            {weekdayOrder.map((day) => (
              <option key={day} value={day}>
                {weekdays[day]}
              </option>
            ))}
          </select>{' '}
          <input
            type="time"
            aria-label="Weekly reset clock time"
            value={resetClockDraft}
            onChange={(event) => setResetClockDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={resetClockDraft === ''}>
          Set
        </button>
      </form>
    </section>
  )
}
