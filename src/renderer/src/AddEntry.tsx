import { useEffect, useState } from 'react'
import {
  models,
  type PermissionMode,
  permissionModes,
  type RunOptions,
  type StartChoice,
  type WakeOptions
} from '../../shared/entry'

interface Props {
  onAddWake: (start: StartChoice, options: WakeOptions) => void
  onAddRun: (start: StartChoice, options: RunOptions) => void
}

/** The "+ Add" flow: tick Wake or leave it empty for a Run, fill in what that kind needs, then the Start time. */
export function AddEntry({ onAddWake, onAddRun }: Props) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'Wake' | 'Run'>('Wake')
  const [retry, setRetry] = useState(false)
  const [projects, setProjects] = useState<string[]>([])
  const [project, setProject] = useState('')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('Auto')
  const [model, setModel] = useState<string>(models[0])
  const [prompt, setPrompt] = useState('')
  const [startAt, setStartAt] = useState<'now' | 'clock'>('now')
  const [clock, setClock] = useState('')

  useEffect(() => {
    if (open) void window.tokentide.listProjects().then(setProjects)
  }, [open])

  const close = () => {
    setOpen(false)
    setKind('Wake')
    setRetry(false)
    setProject('')
    setPermissionMode('Auto')
    setModel(models[0])
    setPrompt('')
    setStartAt('now')
    setClock('')
  }

  const chooseProject = async () => {
    const folder = await window.tokentide.chooseProject()
    if (!folder) return
    setProjects(await window.tokentide.listProjects())
    setProject(folder)
  }

  if (!open) {
    return (
      <button type="button" className="add-button" onClick={() => setOpen(true)}>
        + Add
      </button>
    )
  }

  const startReady = startAt === 'now' || clock !== ''
  const runReady = project !== '' && prompt.trim() !== ''
  const ready = startReady && (kind === 'Wake' || runReady)

  return (
    <form
      className="add-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        const start: StartChoice = startAt === 'now' ? 'Now' : { clock }
        // The prompt is sent exactly as written, so it is not trimmed.
        if (kind === 'Wake') onAddWake(start, { retry })
        else onAddRun(start, { project, prompt, permissionMode, model })
        close()
      }}
    >
      <label title="Untick to add a Run">
        <input
          type="checkbox"
          checked={kind === 'Wake'}
          onChange={(event) => setKind(event.target.checked ? 'Wake' : 'Run')}
        />{' '}
        Wake
      </label>
      {kind === 'Wake' && (
        <label title="One Attempt a minute until one succeeds">
          <input type="checkbox" checked={retry} onChange={(event) => setRetry(event.target.checked)} /> Retry
        </label>
      )}
      {kind === 'Run' && (
        <>
          <label className="add-field">
            Project
            <span className="add-project">
              <select value={project} onChange={(event) => setProject(event.target.value)}>
                <option value="" disabled>
                  {projects.length === 0 ? 'No Project yet' : 'Choose a Project'}
                </option>
                {projects.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void chooseProject()}>
                New…
              </button>
            </span>
          </label>
          <fieldset>
            <legend>Permission mode</legend>
            {permissionModes.map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="permission-mode"
                  value={mode}
                  checked={permissionMode === mode}
                  onChange={() => setPermissionMode(mode)}
                />{' '}
                {mode}
              </label>
            ))}
          </fieldset>
          <label className="add-field">
            Model
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {models.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="add-field">
            Prompt
            <textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
        </>
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
