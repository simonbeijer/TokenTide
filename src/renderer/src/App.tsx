import { useEffect, useState } from 'react'
import type { Entry } from '../../shared/entry'
import { AddEntry } from './AddEntry'

export function App() {
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    void window.tokentide.listEntries().then(setEntries)
    return window.tokentide.onEntriesChanged(setEntries)
  }, [])

  return (
    <main className="app">
      <section className="status-panel" aria-label="Status panel" />
      <AddEntry onAddWake={() => void window.tokentide.addWake()} />
      <ul className="entry-list" aria-label="Entries">
        {entries.map((entry) => (
          <li key={entry.id} className="entry">
            <span className="entry-kind">{entry.kind}</span>
            <span className="entry-start">{entry.startTime}</span>
            <span className={`entry-status status-${entry.status.toLowerCase()}`}>{entry.status}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
