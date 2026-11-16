import type { Entry } from '../shared/entry'
import { createJsonFile, type JsonFile } from './jsonFile'

export type EntryStore = JsonFile<Entry[]>

/** Keeps the Entries as JSON in one file, so they survive restarts. */
export function createEntryStore(filePath: string): EntryStore {
  return createJsonFile<Entry[]>(filePath, () => [])
}
