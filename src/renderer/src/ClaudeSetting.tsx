import { useState } from 'react'
import type { ClaudeLocation } from '../../shared/claude'

interface Props {
  claude: ClaudeLocation
  /** Sets the path to Claude; an empty path lets the app find Claude by itself again. */
  onChoosePath: (path: string) => void
}

/** Shows the path to Claude the app uses, and lets the user change it. */
export function ClaudeSetting({ claude, onChoosePath }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const open = editing || !claude.found

  const choose = (path: string) => {
    onChoosePath(path)
    setEditing(false)
  }

  return (
    <section id="claude-setting" className="claude-setting" aria-label="Claude setting">
      <h2 className="claude-title">Claude</h2>
      <p className="claude-path">
        {claude.path ?? 'Not found'}
        {claude.found && <span className="claude-source">{claude.chosen ? ' (set by you)' : ' (found by the app)'}</span>}
      </p>
      {open ? (
        <form
          className="claude-form"
          onSubmit={(event) => {
            event.preventDefault()
            choose(draft)
          }}
        >
          <input
            type="text"
            aria-label="Path to Claude"
            placeholder="/Users/you/.local/bin/claude"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="claude-actions">
            {claude.chosen && (
              <button type="button" onClick={() => choose('')}>
                Find automatically
              </button>
            )}
            {editing && (
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
            <button type="submit" disabled={draft.trim() === ''}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="claude-change"
          onClick={() => {
            setDraft(claude.path ?? '')
            setEditing(true)
          }}
        >
          Change
        </button>
      )}
    </section>
  )
}
