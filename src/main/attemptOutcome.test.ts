import { describe, expect, it } from 'vitest'
import { readAttemptOutcome } from './attemptOutcome'

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
