import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runWakeAttempt } from './wakeAttempt'
import { wakeCommand } from './wakeCommand'

const fakeClaude = resolve(__dirname, '../../test/fixtures/fake-claude.mjs')

const withEnv = (vars: Record<string, string>) => ({ ...process.env, ...vars })

function recordFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'tokentide-test-')), 'record.json')
}

describe('runWakeAttempt', () => {
  it('starts Claude in an empty folder with the Wake command', async () => {
    const record = recordFile()
    await runWakeAttempt({ claudePath: fakeClaude, env: withEnv({ FAKE_CLAUDE_RECORD: record }) })

    const started = JSON.parse(readFileSync(record, 'utf8'))
    expect(started.args).toEqual(wakeCommand())
    expect(started.cwdEntries).toEqual([])
    expect(started.cwd).not.toBe(process.cwd())
  })

  it('is Done when Claude ends with a result event and exit code 0', async () => {
    const { outcome } = await runWakeAttempt({ claudePath: fakeClaude, env: withEnv({ FAKE_CLAUDE_SCENARIO: 'success' }) })
    expect(outcome).toBe('Done')
  })

  it.each(['error-exit', 'no-result', 'text-only'])('is Failed when Claude ends in the %s way', async (scenario) => {
    const { outcome } = await runWakeAttempt({ claudePath: fakeClaude, env: withEnv({ FAKE_CLAUDE_SCENARIO: scenario }) })
    expect(outcome).toBe('Failed')
  })

  it('is Failed when Claude cannot be started at all, and has nothing else to report', async () => {
    const report = await runWakeAttempt({ claudePath: '/nonexistent/claude' })
    expect(report).toEqual({ outcome: 'Failed' })
  })

  it("reports Claude's session id and the last line of its answer", async () => {
    const report = await runWakeAttempt({ claudePath: fakeClaude, env: withEnv({ FAKE_CLAUDE_SCENARIO: 'success' }) })
    expect(report).toEqual({ outcome: 'Done', sessionId: 'fake-session', lastLine: 'Hi!' })
  })

  describe('when the signal is aborted', () => {
    const signalsReceived = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : [])

    /** Aborts once Claude has started and listens for signals. */
    const abortWhenListening = (controller: AbortController) => (line: string) => {
      if (line.includes('"subtype":"status"')) controller.abort()
    }

    it('interrupts Claude, and the Attempt is Failed', async () => {
      const signals = recordFile()
      const controller = new AbortController()

      const { outcome } = await runWakeAttempt({
        claudePath: fakeClaude,
        env: withEnv({ FAKE_CLAUDE_SCENARIO: 'hang', FAKE_CLAUDE_SIGNALS: signals }),
        signal: controller.signal,
        onLine: abortWhenListening(controller),
        terminateAfter: 5_000
      })

      expect(outcome).toBe('Failed')
      expect(signalsReceived(signals)).toEqual(['SIGINT'])
    })

    it('terminates Claude when the interrupt does not end it', async () => {
      const signals = recordFile()
      const controller = new AbortController()

      const { outcome } = await runWakeAttempt({
        claudePath: fakeClaude,
        env: withEnv({ FAKE_CLAUDE_SCENARIO: 'hang', FAKE_CLAUDE_SIGNALS: signals, FAKE_CLAUDE_IGNORE_SIGINT: '1' }),
        signal: controller.signal,
        onLine: abortWhenListening(controller),
        terminateAfter: 50
      })

      expect(outcome).toBe('Failed')
      expect(signalsReceived(signals)).toEqual(['SIGINT', 'SIGTERM'])
    })

    it('kills Claude when neither the interrupt nor the terminate ends it', async () => {
      const signals = recordFile()
      const controller = new AbortController()

      const { outcome } = await runWakeAttempt({
        claudePath: fakeClaude,
        env: withEnv({
          FAKE_CLAUDE_SCENARIO: 'hang',
          FAKE_CLAUDE_SIGNALS: signals,
          FAKE_CLAUDE_IGNORE_SIGINT: '1',
          FAKE_CLAUDE_IGNORE_SIGTERM: '1'
        }),
        signal: controller.signal,
        onLine: abortWhenListening(controller),
        terminateAfter: 50,
        killAfter: 50
      })

      expect(outcome).toBe('Failed')
      expect(signalsReceived(signals)).toEqual(['SIGINT', 'SIGTERM'])
    })

    it('is Done when Claude answers while it is being ended, because the Window is then running', async () => {
      const controller = new AbortController()

      const { outcome } = await runWakeAttempt({
        claudePath: fakeClaude,
        env: withEnv({ FAKE_CLAUDE_SCENARIO: 'hang', FAKE_CLAUDE_ANSWER_ON_SIGINT: '1' }),
        signal: controller.signal,
        onLine: abortWhenListening(controller)
      })

      expect(outcome).toBe('Done')
    })

    it('does not start Claude when the signal is already aborted', async () => {
      const record = recordFile()

      const { outcome } = await runWakeAttempt({
        claudePath: fakeClaude,
        env: withEnv({ FAKE_CLAUDE_RECORD: record }),
        signal: AbortSignal.abort()
      })

      expect(outcome).toBe('Failed')
      expect(existsSync(record)).toBe(false)
    })
  })
})
