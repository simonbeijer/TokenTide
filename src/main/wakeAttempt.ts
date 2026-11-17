import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AttemptReport } from './attemptOutcome'
import { runClaude } from './claudeProcess'
import { wakeCommand } from './wakeCommand'

export interface WakeAttemptOptions {
  claudePath: string
  env?: NodeJS.ProcessEnv
  /**
   * Aborting ends the Attempt: Claude gets an interrupt, then a terminate, then a kill as a last resort.
   * The Attempt is Failed unless Claude answered before it exited.
   */
  signal?: AbortSignal
  /** How long Claude gets to end after the interrupt before it is terminated, in ms. */
  terminateAfter?: number
  /** How long Claude gets to end after the terminate before it is killed, in ms. */
  killAfter?: number
  /** Called with each line Claude writes to stdout. */
  onLine?: (line: string) => void
}

/** Makes one Attempt for a Wake: starts Claude in a fresh empty folder and waits for it to exit. */
export async function runWakeAttempt({
  claudePath,
  env = process.env,
  signal,
  terminateAfter = 5_000,
  killAfter = 5_000,
  onLine
}: WakeAttemptOptions): Promise<AttemptReport> {
  if (signal?.aborted) return { outcome: 'Failed' }
  const folder = await mkdtemp(join(tmpdir(), 'tokentide-wake-'))
  try {
    return await runClaude(claudePath, wakeCommand(), { cwd: folder, env, signal, terminateAfter, killAfter, onLine })
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
