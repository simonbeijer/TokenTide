import { useState } from 'react'

interface Props {
  onAddWake: () => void
}

/** The "+ Add" flow. Only Wake with Start time Now exists so far. */
export function AddEntry({ onAddWake }: Props) {
  const [open, setOpen] = useState(false)
  const [wake, setWake] = useState(true)

  if (!open) {
    return (
      <button type="button" className="add-button" onClick={() => setOpen(true)}>
        + Add
      </button>
    )
  }

  return (
    <form
      className="add-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!wake) return
        onAddWake()
        setOpen(false)
      }}
    >
      <label>
        <input type="checkbox" checked={wake} onChange={(event) => setWake(event.target.checked)} /> Wake
      </label>
      <fieldset>
        <legend>Start time</legend>
        <label>
          <input type="radio" name="start-time" value="now" checked readOnly /> Now
        </label>
      </fieldset>
      <div className="add-actions">
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" disabled={!wake}>
          Add
        </button>
      </div>
    </form>
  )
}
