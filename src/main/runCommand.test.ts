import { describe, expect, it } from 'vitest'
import { runCommand } from './runCommand'

describe('runCommand', () => {
  it('is the Run command from the plan for Auto, with the prompt last after an end of options', () => {
    expect(runCommand({ prompt: 'Solve one issue', permissionMode: 'Auto', model: 'opus' })).toEqual([
      '-p',
      '--permission-mode', 'auto',
      '--permission-prompts', 'none',
      '--strict-mcp-config',
      '--model', 'opus',
      '--output-format', 'stream-json',
      '--verbose',
      '--', 'Solve one issue'
    ])
  })

  it('replaces the auto permission mode with skipping all prompts, and still says nobody can answer prompts', () => {
    expect(runCommand({ prompt: 'x', permissionMode: 'Skip all prompts', model: 'sonnet' })).toEqual([
      '-p',
      '--dangerously-skip-permissions',
      '--permission-prompts', 'none',
      '--strict-mcp-config',
      '--model', 'sonnet',
      '--output-format', 'stream-json',
      '--verbose',
      '--', 'x'
    ])
  })

  it('passes a prompt that looks like an option as the prompt', () => {
    expect(runCommand({ prompt: '--help me', permissionMode: 'Auto', model: 'opus' }).at(-1)).toBe('--help me')
  })

  it('never uses bare mode, which skips the subscription login', () => {
    expect(runCommand({ prompt: 'x', permissionMode: 'Auto', model: 'opus' })).not.toContain('--bare')
  })
})
