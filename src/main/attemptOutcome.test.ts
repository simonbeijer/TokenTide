import { describe, expect, it } from 'vitest'
import { readAttemptOutcome, readAttemptReport, isAnswer } from './attemptOutcome'

const init = '{"type":"system","subtype":"init","session_id":"abc"}'
const assistant = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"}]},"session_id":"abc"}'
const result = '{"type":"result","subtype":"success","is_error":false,"result":"Hi","session_id":"abc"}'

describe('readAttemptOutcome', () => {
  it('is Done when the last event is a result event and the exit code is 0', () => {
    expect(readAttemptOutcome([init, assistant, result], 0)).toBe('Done')
  })

  it('is Failed when the exit code is not 0, even after a result event', () => {
    expect(readAttemptOutcome([init, assistant, result], 1)).toBe('Failed')
  })

  it('is Failed when the exit code is 0 but the output ends before a result event', () => {
    expect(readAttemptOutcome([init, assistant], 0)).toBe('Failed')
  })

  it('ignores lines that are not JSON events when finding the last event', () => {
    expect(readAttemptOutcome([init, result, '', 'some warning text'], 0)).toBe('Done')
  })

  it('does not read status from text that merely mentions a result', () => {
    expect(readAttemptOutcome([init, assistant, 'type: result'], 0)).toBe('Failed')
  })

  it('is Failed when there is no output at all', () => {
    expect(readAttemptOutcome([], 0)).toBe('Failed')
  })
})

describe('readAttemptReport', () => {
  it('takes the session id and the last line of the answer from the JSON events', () => {
    const answer = '{"type":"result","subtype":"success","is_error":false,"result":"First line\\nLast line","session_id":"abc"}'
    expect(readAttemptReport([init, assistant, answer], 0)).toEqual({
      outcome: 'Done',
      sessionId: 'abc',
      lastLine: 'Last line'
    })
  })

  it('falls back to the last assistant text when there is no result event', () => {
    expect(readAttemptReport([init, assistant], 0)).toEqual({ outcome: 'Failed', sessionId: 'abc', lastLine: 'Hi' })
  })

  it('does not read a session id or a last line from free text', () => {
    expect(readAttemptReport(['session_id: abc', 'Error: something went wrong'], 0)).toEqual({ outcome: 'Failed' })
  })

  it('has only the outcome when there is no output at all', () => {
    expect(readAttemptReport([], null)).toEqual({ outcome: 'Failed' })
  })
})

describe('readAttemptReport: denied actions', () => {
  const resultWith = (extra: object) => resultLine({ is_error: false, result: 'Hi', ...extra })
  const denial = { tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'git push --force' } }

  it('counts the denied actions listed in the result event, and the Run is still Done', () => {
    const report = readAttemptReport([init, resultWith({ permission_denials: [denial, denial] })], 0)
    expect(report).toEqual({ outcome: 'Done', sessionId: 'abc', lastLine: 'Hi', deniedActions: 2 })
  })

  it('has no number when the list of denied actions is empty', () => {
    expect(readAttemptReport([init, resultWith({ permission_denials: [] })], 0)).not.toHaveProperty('deniedActions')
  })

  it('has no number with a Claude Code version that does not list denied actions', () => {
    expect(readAttemptReport([init, resultWith({})], 0)).toEqual({ outcome: 'Done', sessionId: 'abc', lastLine: 'Hi' })
  })

  it('does not count denied actions mentioned in free text', () => {
    const report = readAttemptReport([init, 'permission_denials: [1, 2, 3]', resultWith({})], 0)
    expect(report).not.toHaveProperty('deniedActions')
  })
})

describe('readAttemptReport: not logged in', () => {
  // As Claude Code 2.1.326 writes it when no login is found. The exit code is 1.
  const loginError = JSON.stringify({
    type: 'assistant',
    message: { model: '<synthetic>', content: [{ type: 'text', text: 'Not logged in · Please run /login' }] },
    session_id: 'abc',
    error: 'authentication_failed',
    is_api_error_message: true
  })
  const loginResult = resultLine({ is_error: true, result: 'Not logged in · Please run /login', terminal_reason: 'api_error' })

  it('is Failed with the Note "not logged in"', () => {
    expect(readAttemptReport([init, loginError, loginResult], 1)).toMatchObject({ outcome: 'Failed', note: 'not logged in' })
  })

  it('is Failed with the Note "not logged in" even if the exit code were 0', () => {
    expect(readAttemptReport([init, loginError, loginResult], 0)).toMatchObject({ outcome: 'Failed', note: 'not logged in' })
  })

  it('has no Note for any other failure', () => {
    expect(readAttemptReport([init, assistant], 1)).not.toHaveProperty('note')
  })

  it('does not read a login error from free text', () => {
    expect(readAttemptReport([init, 'Not logged in · Please run /login'], 1)).not.toHaveProperty('note')
  })
})

function resultLine(extra: object) {
  return JSON.stringify({ type: 'result', subtype: 'success', session_id: 'abc', ...extra })
}

describe('isAnswer', () => {
  const assistant = (extra: object = {}, message: object = {}) =>
    JSON.stringify({ type: 'assistant', message: { model: 'claude-opus', content: [{ type: 'text', text: 'Hi' }], ...message }, ...extra })

  it('is an assistant event from the model', () => {
    expect(isAnswer(assistant())).toBe(true)
  })

  it.each([
    ['a start event', JSON.stringify({ type: 'system', subtype: 'init' })],
    ['plain text', 'Hi'],
    ['a login error written as a message', assistant({ error: 'authentication_failed' })],
    ['a message Claude Code made up by itself', assistant({}, { model: '<synthetic>' })]
  ])('is not %s', (_name, line) => {
    expect(isAnswer(line)).toBe(false)
  })
})
