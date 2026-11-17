import type { RunOptions } from '../shared/entry'
import { type AttemptReport, isAnswer } from './attemptOutcome'
import { runClaude } from './claudeProcess'
import { runCommand } from './runCommand'

export interface RunAttemptOptions {
  claudePath: string
  run: RunOptions
  /** Where the full output of the Run is saved. */
  outputFile: string
  env?: NodeJS.ProcessEnv
  /** Aborting ends the Run: Claude gets an interrupt, then a terminate, then a kill as a last resort. */
  signal?: AbortSignal
  /** How long Claude gets to end after the interrupt before it is terminated, in ms. */
  terminateAfter?: number
  /** How long Claude gets to end after the terminate before it is killed, in ms. */
  killAfter?: number
  /** Called once, when Claude first answers. A Window is running from then on. */
  onAnswer?: () => void
  /** Called with each line Claude writes to stdout. */
  onLine?: (line: string) => void
}

/** Makes the one Attempt of a Run: starts Claude in the Project's folder and waits for it to exit by itself. */
export async function runRunAttempt({
  claudePath,
  run,
  outputFile,
  env = process.env,
  signal,
  terminateAfter = 5_000,
  killAfter = 5_000,
  onAnswer,
  onLine
}: RunAttemptOptions): Promise<AttemptReport> {
  if (signal?.aborted) return { outcome: 'Failed' }
  let answered = false
  return runClaude(claudePath, runCommand(run), {
    cwd: run.project,
    env,
    signal,
    terminateAfter,
    killAfter,
    outputFile,
    onLine: (line) => {
      onLine?.(line)
      if (answered || !isAnswer(line)) return
      answered = true
      onAnswer?.()
    }
  })
}
