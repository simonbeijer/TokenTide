import { appendFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LogLine } from '../shared/log'
import { createLogStore } from './logStore'

const done: LogLine = { time: '2026-11-16T05:00:03.000Z', status: 'Done', sessionId: 'abc', lastLine: 'Hi!' }
const missed: LogLine = { time: '2026-11-16T06:00:00.000Z', status: 'Failed', note: 'missed start time' }

describe('log store', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tokentide-log-'))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('reads an empty log when nothing has been written yet', () => {
    expect(createLogStore(join(folder, 'missing', 'log.jsonl')).read()).toEqual([])
  })

  it('keeps the lines in order after a restart', () => {
    const file = join(folder, 'data', 'log.jsonl')
    const before = createLogStore(file)
    before.append(done)
    before.append(missed)

    expect(createLogStore(file).read()).toEqual([done, missed])
  })

  it('skips a line it cannot read and keeps the rest', () => {
    const file = join(folder, 'log.jsonl')
    const store = createLogStore(file)
    store.append(done)
    appendFileSync(file, '{ half a line\n')
    store.append(missed)

    expect(store.read()).toEqual([done, missed])
  })
})
