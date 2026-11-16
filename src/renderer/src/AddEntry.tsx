import { useState } from 'react'
import type { StartChoice, WakeOptions } from '../../shared/entry'

interface Props {
  onAddWake: (start: StartChoice, options: WakeOptions) => void
}

/** The "+ Add" flow. Only Wake exists so far. */
export function AddEntry({ onAddWake }: Props) {
  const [open, setOpen] = useState(false)
  const [wake, setWake] = useState(true)
  const [retry, setRetry] = useState(false)
  const [startAt, setStartAt] = useState<'now' | 'clock'>('now')
  const [clock, setClock] = useState('')

  const close = () => {
    setOpen(false)
    setRetry(false)
    setStartAt('now')
    setClock('')
  }

  if (!open) {
    return (
      <button type="button" className="add-button" onClick={() => setOpen(true)}>
        + Add
      </button>
    )
  }

  const ready = wake && (startAt === 'now' || clock !== '')

  return (
    <form
      className="add-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        onAddWake(startAt === 'now' ? 'Now' : { clock }, { retry })
        close()
      }}
    >
      <label>
        <input type="checkbox" checked={wake} onChange={(event) => setWake(event.target.checked)} /> Wake
      </label>
      {wake && (
        <label title="One Attempt a minute until one succeeds">
          <input type="checkbox" checked={retry} onChange={(event) => setRetry(event.target.checked)} /> Retry
        </label>
      )}
      <fieldset>
        <legend>Start time</legend>
        <label>
          <input type="radio" name="start-time" value="now" checked={startAt === 'now'} onChange={() => setStartAt('now')} />{' '}
          Now
        </label>
        <label>
          <input
            type="radio"
            name="start-time"
            value="clock"
            checked={startAt === 'clock'}
            onChange={() => setStartAt('clock')}
          />{' '}
          At{' '}
          <input
            type="time"
            aria-label="Clock time"
            value={clock}
            onChange={(event) => {
              setClock(event.target.value)
              setStartAt('clock')
            }}
          />
        </label>
      </fieldset>
      <div className="add-actions">
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button type="submit" disabled={!ready}>
          Add
        </button>
      </div>
    </form>
  )
}
