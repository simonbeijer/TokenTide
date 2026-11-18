import { useEffect, useState } from 'react'
import type { ClaudeLocation } from '../../shared/claude'
import type { Entry } from '../../shared/entry'
import { startTimeLabel } from '../../shared/startTimeLabel'
import { AddEntry } from './AddEntry'
import { ClaudeSetting } from './ClaudeSetting'
import { Log } from './Log'
import { StatusPanel } from './StatusPanel'
import { statusClass } from './statusClass'

/** The folder's own name, which is what the user knows a Project by. */
const projectName = (folder: string) => folder.split('/').filter(Boolean).at(-1) ?? folder

export function App() {
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    void window.tokentide.listEntries().then(setEntries)
    return window.tokentide.onEntriesChanged(setEntries)
  }, [])

  const [claude, setClaude] = useState<ClaudeLocation>()
  useEffect(() => {
    void window.tokentide.getClaude().then(setClaude)
  }, [])

  // Redraw often, so the Status panel counts down and a label such as "05:00 tomorrow" turns into "05:00" after midnight.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <main className="app">
      {claude && !claude.found && (
        <p role="alert" className="claude-missing">
          {claude.path ? `Claude was not found at ${claude.path}.` : 'Claude was not found.'}{' '}
          <a href="#claude-setting">Set the path to Claude</a> in the Claude setting.
        </p>
      )}
      <StatusPanel now={now} />
      <AddEntry
        onAddWake={(start, options) => void window.tokentide.addWake(start, options)}
        onAddRun={(start, options) => void window.tokentide.addRun(start, options)}
      />
      <ul className="entry-list" aria-label="Entries">
        {entries.map((entry) => (
          <li key={entry.id} className="entry">
            <span className="entry-kind">{entry.kind}</span>
            <span className="entry-start">{startTimeLabel(entry.startTime, now)}</span>
            {entry.retry && <span className="entry-retry">Retry</span>}
            {entry.run && (
              <span className="entry-run" title={`${entry.run.project}\n${entry.run.permissionMode} · ${entry.run.model}\n\n${entry.run.prompt}`}>
                {projectName(entry.run.project)} · {entry.run.model}
              </span>
            )}
            {entry.hardStopAt && (
              <span className="entry-hard-stop" title="Hard stop">
                stops {startTimeLabel({ at: entry.hardStopAt }, now)}
              </span>
            )}
            <span className={`entry-status ${statusClass(entry.status)}`}>{entry.status}</span>
            {entry.note && <span className="entry-note">{entry.note}</span>}
            {entry.warning && (
              <span className="entry-warning" role="note">
                ⚠ {entry.warning}
              </span>
            )}
            {(entry.kind === 'Run' || entry.retry) && entry.status === 'Running' && (
              <button type="button" className="entry-stop" onClick={() => void window.tokentide.stopEntry(entry.id)}>
                Stop
              </button>
            )}
            {entry.status !== 'Running' && (
              <button type="button" className="entry-remove" onClick={() => void window.tokentide.removeEntry(entry.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {claude && (
        <ClaudeSetting claude={claude} onChoosePath={(path) => void window.tokentide.setClaudePath(path).then(setClaude)} />
      )}
      <Log />
    </main>
  )
}
