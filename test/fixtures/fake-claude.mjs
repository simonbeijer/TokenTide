#!/usr/bin/env node
// Stand-in for the real `claude` binary. Tests never start the real Claude.
// It emits the same kind of stream-json lines and records how it was started.
//
// FAKE_CLAUDE_SCENARIO: success (default) | error-exit | no-result | text-only | hang
// FAKE_CLAUDE_RECORD:   path of a JSON file to write { args, cwd, cwdEntries } to
// FAKE_CLAUDE_SIGNALS:  path of a file to append the name of each signal received to
// FAKE_CLAUDE_IGNORE_SIGINT: when set, an interrupt does not end the process
// FAKE_CLAUDE_IGNORE_SIGTERM: when set, a terminate does not end the process either
// FAKE_CLAUDE_ANSWER_ON_SIGINT: when set, an interrupt makes Claude answer and exit 0
//
// "hang" starts like a real Wake, then never answers until it is interrupted or terminated.
import { appendFileSync, readdirSync, writeFileSync } from 'node:fs'

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

if (scenario === 'hang') {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (process.env.FAKE_CLAUDE_SIGNALS) appendFileSync(process.env.FAKE_CLAUDE_SIGNALS, `${signal}\n`)
      if (signal === 'SIGINT' && process.env.FAKE_CLAUDE_IGNORE_SIGINT) return
      if (signal === 'SIGTERM' && process.env.FAKE_CLAUDE_IGNORE_SIGTERM) return
      if (signal === 'SIGINT' && process.env.FAKE_CLAUDE_ANSWER_ON_SIGINT) {
        emit({ type: 'result', subtype: 'success', is_error: false, result: 'Hi!', session_id: sessionId })
        process.exit(0)
      }
      process.exit(130)
    })
  }
  setInterval(() => {}, 1_000)
  // Tell the test the signal handlers are in place.
  emit({ type: 'system', subtype: 'status', session_id: sessionId })
} else {
  if (scenario === 'error-exit') {
    emit({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: sessionId })
    process.exit(1)
  }

  emit({ type: 'result', subtype: 'success', is_error: false, result: 'Hi!', session_id: sessionId, permission_denials: [] })
  process.exit(0)
}
