import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { type AttemptReport, readAttemptReport } from './attemptOutcome'

export interface ClaudeProcessOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  /** Aborting ends Claude: an interrupt, then a terminate, then a kill as a last resort. */
  signal?: AbortSignal
  /** How long Claude gets to end after the interrupt before it is terminated, in ms. */
  terminateAfter: number
  /** How long Claude gets to end after the terminate before it is killed, in ms. */
  killAfter: number
  /** Called with each line Claude writes to stdout. */
  onLine?: (line: string) => void
  /** A file that gets everything Claude writes, to stdout and stderr, as it comes. */
  outputFile?: string
}

/** Starts Claude once and waits for it to exit. The report is read from its stream-json output and exit code. */
export function runClaude(
  claudePath: string,
  args: string[],
  { cwd, env, signal, terminateAfter, killAfter, onLine, outputFile }: ClaudeProcessOptions
): Promise<AttemptReport> {
  return new Promise((resolve) => {
    const child = spawn(claudePath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const output = outputFile === undefined ? undefined : openOutput(outputFile)
    const lines: string[] = []
    const stdout = createInterface({ input: child.stdout })
    stdout.on('line', (line) => {
      lines.push(line)
      onLine?.(line)
    })
    if (output) {
      child.stdout.on('data', (chunk) => output.write(chunk))
      child.stderr.on('data', (chunk) => output.write(chunk))
    } else child.stderr.resume()

    // A process that ignores both signals would otherwise keep the Attempt, and its Entry, Running for ever.
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
      if (output) output.end(() => resolve(report))
      else resolve(report)
    }
    child.on('error', () => settle({ outcome: 'Failed' }))
    child.on('close', (exitCode) => settle(readAttemptReport(lines, exitCode)))
  })
}

function openOutput(file: string) {
  mkdirSync(dirname(file), { recursive: true })
  const stream = createWriteStream(file)
  // A file that cannot be written must not end the Attempt: the output is a record, not the status.
  stream.on('error', () => {})
  return stream
}
