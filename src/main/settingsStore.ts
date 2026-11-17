import type { StatusValues } from '../shared/api'
import { createJsonFile, type JsonFile } from './jsonFile'

export interface Settings extends StatusValues {
  /** The path to Claude the user set in the app. Without it, the app finds Claude by itself at every start. */
  claudePath?: string
  /** The Project folders the user has picked, so they can be picked again. */
  projects?: string[]
}

export type SettingsStore = JsonFile<Settings>

/** Keeps the user's settings as JSON in one file, so they survive restarts. */
export function createSettingsStore(filePath: string): SettingsStore {
  return createJsonFile<Settings>(filePath, () => ({}))
}
