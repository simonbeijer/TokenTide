import { mkdtempSync, readFileSync } from 'node:fs'
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
    const outcome = await runWakeAttempt({ claudePath: fakeClaude, env: withEnv({ FAKE_CLAUDE_SCENARIO: 'success' }) })
    expect(outcome).toBe('Done')
  })

  it.each(['error-exit', 'no-result', 'text-only'])('is Failed when Claude ends in the %s way', async (scenario) => {
    const outcome = await runWakeAttempt({ claudePath: fakeClaude, env: withEnv({ FAKE_CLAUDE_SCENARIO: scenario }) })
    expect(outcome).toBe('Failed')
  })

  it('is Failed when Claude cannot be started at all', async () => {
    const outcome = await runWakeAttempt({ claudePath: '/nonexistent/claude' })
    expect(outcome).toBe('Failed')
  })
})
