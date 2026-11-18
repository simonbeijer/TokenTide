import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RunOptions } from '../shared/entry'
import { runCommand } from './runCommand'
import { runRunAttempt } from './runAttempt'

const fakeClaude = resolve(__dirname, '../../test/fixtures/fake-claude.mjs')

const withEnv = (vars: Record<string, string>) => ({ ...process.env, ...vars })

const tempFolder = () => mkdtempSync(join(tmpdir(), 'tokentide-test-'))

function setup(vars: Record<string, string> = {}, run: Partial<RunOptions> = {}) {
  const folder = tempFolder()
  const record = join(folder, 'record.json')
  const project = mkdtempSync(join(tmpdir(), 'tokentide-project-'))
  const outputFile = join(folder, 'runs', 'entry.log')
  const options: RunOptions = { project, prompt: 'Solve one issue', permissionMode: 'Auto', model: 'opus', ...run }
  return {
    options,
    record,
    outputFile,
    started: () => JSON.parse(readFileSync(record, 'utf8')),
    attempt: (extra: { onAnswer?: () => void } = {}) =>
      runRunAttempt({
        claudePath: fakeClaude,
        env: withEnv({ FAKE_CLAUDE_RECORD: record, ...vars }),
        run: options,
        outputFile,
        ...extra
      })
  }
}

describe('runRunAttempt', () => {
  it("starts Claude in the Project's folder with the Run command", async () => {
    const run = setup()
    await run.attempt()

    const started = run.started()
    expect(started.args).toEqual(runCommand(run.options))
    expect(started.cwd).toBe(realpathSync(run.options.project))
  })

  it('passes the prompt to Claude exactly as written, whatever characters it contains', async () => {
    const prompt = `-p "quoted" 'single' $HOME \`date\` ; rm -rf / && echo åäö 🌊\nsecond line\\n`
    const run = setup({}, { prompt })
    await run.attempt()

    expect(run.started().args.at(-1)).toBe(prompt)
  })

  it('is Done with the session id and last line when Claude ends with a result event and exit code 0', async () => {
    const report = await setup().attempt()
    expect(report).toEqual({ outcome: 'Done', sessionId: 'fake-session', lastLine: 'Hi!' })
  })

  it.each(['error-exit', 'no-result', 'text-only'])('is Failed when Claude ends in the %s way', async (scenario) => {
    const { outcome } = await setup({ FAKE_CLAUDE_SCENARIO: scenario }).attempt()
    expect(outcome).toBe('Failed')
  })

  it('is Done with the number of denied actions when Claude was denied some but exits with code 0', async () => {
    const report = await setup({ FAKE_CLAUDE_SCENARIO: 'denied' }).attempt()
    expect(report).toEqual({ outcome: 'Done', sessionId: 'fake-session', lastLine: 'Hi!', deniedActions: 2 })
  })

  it('is Done with no number when the Claude Code version does not list denied actions', async () => {
    const report = await setup({ FAKE_CLAUDE_SCENARIO: 'old-version' }).attempt()
    expect(report).toEqual({ outcome: 'Done', sessionId: 'fake-session', lastLine: 'Hi!' })
  })

  it('is Failed with the Note "not logged in" when Claude Code is not logged in', async () => {
    const report = await setup({ FAKE_CLAUDE_SCENARIO: 'not-logged-in' }).attempt()
    expect(report).toMatchObject({ outcome: 'Failed', note: 'not logged in' })
  })

  it('is Failed when Claude cannot be started at all', async () => {
    const run = setup()
    const report = await runRunAttempt({ claudePath: '/nonexistent/claude', run: run.options, outputFile: run.outputFile })
    expect(report).toEqual({ outcome: 'Failed' })
  })

  it('saves the full output, both what Claude writes and its errors, in its own file', async () => {
    const run = setup({ FAKE_CLAUDE_STDERR: 'a warning from Claude' })
    await run.attempt()

    const saved = readFileSync(run.outputFile, 'utf8')
    expect(saved).toContain('"type":"system"')
    expect(saved).toContain('"type":"result"')
    expect(saved).toContain('a warning from Claude')
  })

  it('tells once that Claude has answered, as soon as it does', async () => {
    let answers = 0
    await setup().attempt({ onAnswer: () => answers++ })
    expect(answers).toBe(1)
  })

  describe('when stopped', () => {
    /** Stops the Run once Claude has started and listens for signals. */
    const stopWhenListening = (controller: AbortController) => (line: string) => {
      if (line.includes('"subtype":"status"')) controller.abort()
    }

    const stoppedRun = async (vars: Record<string, string>, timing: { terminateAfter?: number; killAfter?: number } = {}) => {
      const signals = join(tempFolder(), 'signals.txt')
      const run = setup()
      const controller = new AbortController()
      const report = await runRunAttempt({
        claudePath: fakeClaude,
        env: withEnv({ FAKE_CLAUDE_RECORD: run.record, FAKE_CLAUDE_SCENARIO: 'hang', FAKE_CLAUDE_SIGNALS: signals, ...vars }),
        run: run.options,
        outputFile: run.outputFile,
        signal: controller.signal,
        onLine: stopWhenListening(controller),
        ...timing
      })
      const received = existsSync(signals) ? readFileSync(signals, 'utf8').trim().split('\n') : []
      return { report, received, saved: readFileSync(run.outputFile, 'utf8') }
    }

    it('interrupts Claude, which then exits, and keeps the output saved so far', async () => {
      const { report, received, saved } = await stoppedRun({})

      expect(report.outcome).toBe('Failed')
      expect(received).toEqual(['SIGINT'])
      expect(saved).toContain('"text":"Hi!"')
    })

    it('terminates Claude when it has not exited shortly after the interrupt', async () => {
      const { received } = await stoppedRun({ FAKE_CLAUDE_IGNORE_SIGINT: '1' }, { terminateAfter: 50 })
      expect(received).toEqual(['SIGINT', 'SIGTERM'])
    })

    it('leaves no Claude behind even when it ignores both the interrupt and the terminate', async () => {
      const { report } = await stoppedRun(
        { FAKE_CLAUDE_IGNORE_SIGINT: '1', FAKE_CLAUDE_IGNORE_SIGTERM: '1' },
        { terminateAfter: 50, killAfter: 50 }
      )
      expect(report.outcome).toBe('Failed')
    })
  })

  it('does not tell of an answer when Claude never answered', async () => {
    let answers = 0
    await setup({ FAKE_CLAUDE_SCENARIO: 'text-only' }).attempt({ onAnswer: () => answers++ })
    expect(answers).toBe(0)
  })
})
