import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export interface JsonFile<T> {
  load(): T
  save(value: T): void
}

/** Keeps one value as JSON in one file, so it survives restarts. `empty` is what a missing or unreadable file gives. */
export function createJsonFile<T>(filePath: string, empty: () => T): JsonFile<T> {
  return {
    load() {
      let text: string
      try {
        text = readFileSync(filePath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty()
        throw error
      }
      try {
        return JSON.parse(text) as T
      } catch {
        // Keep the unreadable file for a look later, and let the app start without it.
        renameSync(filePath, join(dirname(filePath), `${basename(filePath, '.json')}.broken.json`))
        return empty()
      }
    },
    save(value) {
      mkdirSync(dirname(filePath), { recursive: true })
      // Write to a side file first, so a crash mid-write never leaves a half-written file.
      const sideFile = `${filePath}.tmp`
      writeFileSync(sideFile, JSON.stringify(value, null, 2))
      renameSync(sideFile, filePath)
    }
  }
}
