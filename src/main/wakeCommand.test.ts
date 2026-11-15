import { describe, expect, it } from 'vitest'
import { wakeCommand } from './wakeCommand'

describe('wakeCommand', () => {
  it('is the Wake command from the plan: one character, cheapest model, no tools, skills or MCP servers', () => {
    expect(wakeCommand()).toEqual([
      '-p', '!',
      '--model', 'haiku',
      '--tools', '',
      '--disable-slash-commands',
      '--strict-mcp-config',
      '--output-format', 'stream-json',
      '--verbose'
    ])
  })

  it('never uses bare mode, which skips the subscription login', () => {
    expect(wakeCommand()).not.toContain('--bare')
  })
})
