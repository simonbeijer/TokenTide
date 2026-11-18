#!/usr/bin/env node
// Stand-in for the real `claude` binary. Tests never start the real Claude.
// It emits the same kind of stream-json lines and records how it was started.
//
// FAKE_CLAUDE_SCENARIO: success (default) | error-exit | no-result | text-only | hang | denied | old-version | not-logged-in | limit-reached | rate-limit-event
// FAKE_CLAUDE_RECORD:   path of a JSON file to write { args, cwd, cwdEntries } to
// FAKE_CLAUDE_SIGNALS:  path of a file to append the name of each signal received to
// FAKE_CLAUDE_IGNORE_SIGINT: when set, an interrupt does not end the process
// FAKE_CLAUDE_IGNORE_SIGTERM: when set, a terminate does not end the process either
// FAKE_CLAUDE_ANSWER_ON_SIGINT: when set, an interrupt makes Claude answer and exit 0
// FAKE_CLAUDE_STDERR: text to write to stderr at start
//
// "hang" starts like a real Wake, then never answers until it is interrupted or terminated.
// "denied" succeeds but lists two denied actions. "old-version" succeeds with no `permission_denials` field,
// as Claude Code before v2.1.259 does. "not-logged-in" writes what Claude Code 2.1.326 writes without a login.
// "limit-reached" and "rate-limit-event" write the two known shapes of a reached usage limit.
import { appendFileSync, readdirSync, writeFileSync } from 'node:fs'

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? 'success'
if (process.env.FAKE_CLAUDE_RECORD) {
  writeFileSync(
    process.env.FAKE_CLAUDE_RECORD,
    JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), cwdEntries: readdirSync(process.cwd()) })
  )
}

if (process.env.FAKE_CLAUDE_STDERR) process.stderr.write(process.env.FAKE_CLAUDE_STDERR + '\n')

const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n')
const sessionId = 'fake-session'

if (scenario === 'text-only') {
  process.stdout.write('Error: something went wrong\n')
  process.exit(0)
}

emit({ type: 'system', subtype: 'init', session_id: sessionId, model: 'claude-haiku', tools: [], mcp_servers: [] })

if (scenario === 'not-logged-in') {
  const text = 'Not logged in · Please run /login'
  emit({
    type: 'assistant',
    session_id: sessionId,
    message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text }] },
    error: 'authentication_failed',
    is_api_error_message: true
  })
  emit({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: text,
    session_id: sessionId,
    permission_denials: [],
    terminal_reason: 'api_error'
  })
  process.exit(1)
}

// Not verified against a real limit: built on the fields in PLAN.md, Facts.
const limitText = "You've hit your limit"
const rateLimitInfo = { status: 'rejected', resetsAt: 1763460000, rateLimitType: 'five_hour' }
const limitResult = { type: 'result', subtype: 'success', is_error: true, result: limitText, session_id: sessionId, permission_denials: [] }

if (scenario === 'limit-reached') {
  emit({
    type: 'assistant',
    session_id: sessionId,
    message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: limitText }] },
    apiError: 'usage_limit_reached',
    rate_limit_info: rateLimitInfo
  })
  emit(limitResult)
  process.exit(1)
}

if (scenario === 'rate-limit-event') {
  emit({ type: 'rate_limit_event', session_id: sessionId, rate_limit_info: rateLimitInfo })
  emit(limitResult)
  process.exit(1)
}
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

  const result = { type: 'result', subtype: 'success', is_error: false, result: 'Hi!', session_id: sessionId }
  const denial = (command) => ({ tool_name: 'Bash', tool_use_id: command, tool_input: { command } })
  // An old version has no `permission_denials` field at all.
  if (scenario === 'denied') result.permission_denials = [denial('git push --force'), denial('rm -rf build')]
  else if (scenario !== 'old-version') result.permission_denials = []
  emit(result)
  process.exit(0)
}
