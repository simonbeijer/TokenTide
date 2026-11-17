import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
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

  it('does not tell of an answer when Claude never answered', async () => {
    let answers = 0
    await setup({ FAKE_CLAUDE_SCENARIO: 'text-only' }).attempt({ onAnswer: () => answers++ })
    expect(answers).toBe(0)
  })
})
