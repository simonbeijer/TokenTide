import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { type AttemptReport, readAttemptReport } from './attemptOutcome'
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

type ClaudeOptions = Required<Pick<WakeAttemptOptions, 'env' | 'terminateAfter' | 'killAfter'>> &
  Pick<WakeAttemptOptions, 'signal' | 'onLine'> & { cwd: string }

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

function runClaude(
  claudePath: string,
  args: string[],
  { cwd, env, signal, terminateAfter, killAfter, onLine }: ClaudeOptions
): Promise<AttemptReport> {
  return new Promise((resolve) => {
    const child = spawn(claudePath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const lines: string[] = []
    const stdout = createInterface({ input: child.stdout })
    stdout.on('line', (line) => {
      lines.push(line)
      onLine?.(line)
    })
    child.stderr.resume()

    // A process that ignores both signals would otherwise keep the Attempt, and its Wake, Running for ever.
    let escalation: ReturnType<typeof setTimeout> | undefined
    const interruptThenTerminate = () => {
      child.kill('SIGINT')
      escalation = setTimeout(() => {
        child.kill('SIGTERM')
        escalation = setTimeout(() => child.kill('SIGKILL'), killAfter)
      }, terminateAfter)
    }
    signal?.addEventListener('abort', interruptThenTerminate, { once: true })

    let settled = false
    const settle = (report: AttemptReport) => {
      if (settled) return
      settled = true
      clearTimeout(escalation)
      signal?.removeEventListener('abort', interruptThenTerminate)
      // An answer wins even while the Attempt is being ended: the Window is running then.
      resolve(report)
    }
    child.on('error', () => settle({ outcome: 'Failed' }))
    child.on('close', (exitCode) => settle(readAttemptReport(lines, exitCode)))
  })
}
