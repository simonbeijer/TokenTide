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
