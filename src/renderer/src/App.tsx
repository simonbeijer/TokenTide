import { useEffect, useState } from 'react'
import type { Entry } from '../../shared/entry'
import { startTimeLabel } from '../../shared/startTimeLabel'
import { AddEntry } from './AddEntry'

export function App() {
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    void window.tokentide.listEntries().then(setEntries)
    return window.tokentide.onEntriesChanged(setEntries)
  }, [])

  // Redraw every minute, so a label such as "05:00 tomorrow" turns into "05:00" after midnight.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <main className="app">
      <section className="status-panel" aria-label="Status panel" />
      <AddEntry onAddWake={(start) => void window.tokentide.addWake(start)} />
      <ul className="entry-list" aria-label="Entries">
        {entries.map((entry) => (
          <li key={entry.id} className="entry">
            <span className="entry-kind">{entry.kind}</span>
            <span className="entry-start">{startTimeLabel(entry.startTime, now)}</span>
            <span className={`entry-status status-${entry.status.toLowerCase()}`}>{entry.status}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
