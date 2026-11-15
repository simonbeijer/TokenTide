import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Entry } from '../shared/entry'

export interface EntryStore {
  load(): Entry[]
  save(entries: Entry[]): void
}

/** Keeps the Entries as JSON in one file, so they survive restarts. */
export function createEntryStore(filePath: string): EntryStore {
  return {
    load() {
      let text: string
      try {
        text = readFileSync(filePath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
      try {
        return JSON.parse(text) as Entry[]
      } catch {
        // Keep the unreadable file for a look later, and let the app start with an empty list.
        renameSync(filePath, join(dirname(filePath), `${basename(filePath, '.json')}.broken.json`))
        return []
      }
    },
    save(entries) {
      mkdirSync(dirname(filePath), { recursive: true })
      // Write to a side file first, so a crash mid-write never leaves a half-written list.
      const sideFile = `${filePath}.tmp`
      writeFileSync(sideFile, JSON.stringify(entries, null, 2))
      renameSync(sideFile, filePath)
    }
  }
}
