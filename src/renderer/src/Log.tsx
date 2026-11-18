import { useEffect, useState } from 'react'
import type { LogLine } from '../../shared/log'
import { statusClass } from './statusClass'

const twoDigits = (value: number) => String(value).padStart(2, '0')

function timeLabel(time: string): string {
  const at = new Date(time)
  const date = `${at.getFullYear()}-${twoDigits(at.getMonth() + 1)}-${twoDigits(at.getDate())}`
  return `${date} ${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}:${twoDigits(at.getSeconds())}`
}

/** The log: one line per event, newest first. */
export function Log() {
  const [lines, setLines] = useState<LogLine[]>([])

  useEffect(() => {
    let added: LogLine[] = []
    let loaded = false
    const stop = window.tokentide.onLogLine((line) => {
      if (loaded) setLines((current) => [...current, line])
      else added = [...added, line]
    })
    // A line that arrives while the file is being read is kept until the read is done.
    void window.tokentide.listLog().then((saved) => {
      loaded = true
      setLines([...saved, ...added])
    })
    return stop
  }, [])

  return (
    <section className="log" aria-label="Log">
      <h2 className="log-title">Log</h2>
      <ol className="log-lines">
        {lines
          .map((line, index) => (
            <li key={index} className="log-line">
              <span className="log-time">{timeLabel(line.time)}</span>
              <span className="log-project">{line.project ?? ''}</span>
              <span className={`log-status ${statusClass(line.status)}`}>{line.status}</span>
              <span className="log-session">{line.sessionId ?? ''}</span>
              {line.deniedActions !== undefined && <span className="log-denied">{line.deniedActions} denied</span>}
              {line.note !== undefined && <span className="log-note">{line.note}</span>}
              <span className="log-last-line">{line.lastLine ?? ''}</span>
            </li>
          ))
          .reverse()}
      </ol>
    </section>
  )
}
