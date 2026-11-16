import { accessSync, constants, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ClaudeLocation } from '../shared/claude'

export interface LocateClaudeOptions {
  home: string
  /** The path the user set in the app. It wins over anything the app could find. */
  chosen?: string
  /** Where the login shell says Claude is. */
  loginShellClaude?: string
}

/**
 * Decides which Claude the app starts: the user's own path, else `~/.local/bin/claude`, else the login shell's answer.
 * A path is never resolved: the installer's link stays put while the version folder it points to changes with every update.
 */
export function locateClaude({ home, chosen, loginShellClaude }: LocateClaudeOptions): ClaudeLocation {
  if (chosen) return { path: chosen, found: canRun(chosen), chosen: true }
  const candidates = [join(home, '.local', 'bin', 'claude'), loginShellClaude]
  const path = candidates.find((candidate) => candidate !== undefined && canRun(candidate))
  return path ? { path, found: true } : { found: false }
}

function canRun(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}
