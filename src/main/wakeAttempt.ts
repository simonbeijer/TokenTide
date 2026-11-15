import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { type AttemptOutcome, readAttemptOutcome } from './attemptOutcome'
import { wakeCommand } from './wakeCommand'

export interface WakeAttemptOptions {
  claudePath: string
  env?: NodeJS.ProcessEnv
}

/** Makes one Attempt for a Wake: starts Claude in a fresh empty folder and waits for it to exit. */
export async function runWakeAttempt({ claudePath, env = process.env }: WakeAttemptOptions): Promise<AttemptOutcome> {
  const folder = await mkdtemp(join(tmpdir(), 'tokentide-wake-'))
  try {
    return await runClaude(claudePath, wakeCommand(), folder, env)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

function runClaude(claudePath: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<AttemptOutcome> {
  return new Promise((resolve) => {
    const child = spawn(claudePath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const lines: string[] = []
    const stdout = createInterface({ input: child.stdout })
    stdout.on('line', (line) => lines.push(line))
    child.stderr.resume()

    let settled = false
    const settle = (outcome: AttemptOutcome) => {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    child.on('error', () => settle('Failed'))
    child.on('close', (exitCode) => settle(readAttemptOutcome(lines, exitCode)))
  })
}
