import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Entry } from '../shared/entry'
import { createEntryStore } from './entryStore'

describe('entry store', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tokentide-store-'))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('loads an empty list when nothing has been saved yet', () => {
    const store = createEntryStore(join(folder, 'missing', 'entries.json'))

    expect(store.load()).toEqual([])
  })

  it('moves an unreadable file aside to entries.broken.json and loads an empty list', () => {
    const file = join(folder, 'entries.json')
    writeFileSync(file, '{ not json')

    expect(createEntryStore(file).load()).toEqual([])
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(join(folder, 'entries.broken.json'), 'utf8')).toBe('{ not json')
  })

  it('loads the Entries that were saved, even into a folder that did not exist', () => {
    const file = join(folder, 'data', 'entries.json')
    const saved: Entry[] = [
      { id: 'a', kind: 'Wake', startTime: 'Now', status: 'Done' },
      { id: 'b', kind: 'Wake', startTime: 'Now', status: 'Failed' }
    ]

    createEntryStore(file).save(saved)

    expect(createEntryStore(file).load()).toEqual(saved)
  })
})
