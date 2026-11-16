import { createJsonFile, type JsonFile } from './jsonFile'

export interface Settings {
  /** The path to Claude the user set in the app. Without it, the app finds Claude by itself at every start. */
  claudePath?: string
}

export type SettingsStore = JsonFile<Settings>

/** Keeps the user's settings as JSON in one file, so they survive restarts. */
export function createSettingsStore(filePath: string): SettingsStore {
  return createJsonFile<Settings>(filePath, () => ({}))
}
