#!/usr/bin/env node
// Stand-in for the real `claude` binary. Tests never start the real Claude.
// It emits the same kind of stream-json lines and records how it was started.
//
// FAKE_CLAUDE_SCENARIO: success (default) | error-exit | no-result | text-only
// FAKE_CLAUDE_RECORD:   path of a JSON file to write { args, cwd, cwdEntries } to
import { readdirSync, writeFileSync } from 'node:fs'

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? 'success'
if (process.env.FAKE_CLAUDE_RECORD) {
  writeFileSync(
    process.env.FAKE_CLAUDE_RECORD,
    JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), cwdEntries: readdirSync(process.cwd()) })
  )
}

const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n')
const sessionId = 'fake-session'

if (scenario === 'text-only') {
  process.stdout.write('Error: something went wrong\n')
  process.exit(0)
}

emit({ type: 'system', subtype: 'init', session_id: sessionId, model: 'claude-haiku', tools: [], mcp_servers: [] })
emit({ type: 'assistant', session_id: sessionId, message: { content: [{ type: 'text', text: 'Hi!' }] } })

if (scenario === 'no-result') process.exit(0)

if (scenario === 'error-exit') {
  emit({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: sessionId })
  process.exit(1)
}

emit({ type: 'result', subtype: 'success', is_error: false, result: 'Hi!', session_id: sessionId, permission_denials: [] })
process.exit(0)
