import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LogLine } from '../shared/log'

export interface LogStore {
  read(): LogLine[]
  append(line: LogLine): void
}

/** Keeps the log as one JSON object per line in one file, so it survives restarts and a line is never rewritten. */
export function createLogStore(filePath: string): LogStore {
  return {
    read() {
      let text: string
      try {
        text = readFileSync(filePath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
      return text.split('\n').flatMap((line) => {
        if (line.trim() === '') return []
        try {
          return [JSON.parse(line) as LogLine]
        } catch {
          // One unreadable line must not hide the rest of the log.
          return []
        }
      })
    },
    append(line) {
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, `${JSON.stringify(line)}\n`)
    }
  }
}
