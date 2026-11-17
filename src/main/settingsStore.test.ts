import { existsSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore } from './settingsStore'

describe('settings store', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'tokentide-settings-'))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('has no settings before anything has been saved', () => {
    expect(createSettingsStore(join(folder, 'missing', 'settings.json')).load()).toEqual({})
  })

  it("keeps the user's Claude path across a restart", () => {
    const file = join(folder, 'data', 'settings.json')

    createSettingsStore(file).save({ claudePath: '/opt/bin/claude' })

    expect(createSettingsStore(file).load()).toEqual({ claudePath: '/opt/bin/claude' })
  })

  it('keeps the Window end and the Weekly reset across a restart', () => {
    const file = join(folder, 'settings.json')
    const statusValues = { windowEnd: '2026-11-16T14:00:00.000Z', weeklyReset: { weekday: 4, clock: '09:00' } }

    createSettingsStore(file).save(statusValues)

    expect(createSettingsStore(file).load()).toEqual(statusValues)
  })

  it('keeps the saved Projects across a restart', () => {
    const file = join(folder, 'settings.json')

    createSettingsStore(file).save({ projects: ['/Users/me/dev/shop', '/Users/me/dev/blog'] })

    expect(createSettingsStore(file).load()).toEqual({ projects: ['/Users/me/dev/shop', '/Users/me/dev/blog'] })
  })

  it('starts with no settings when the file cannot be read, and moves it aside', () => {
    const file = join(folder, 'settings.json')
    writeFileSync(file, '{ not json')

    expect(createSettingsStore(file).load()).toEqual({})
    expect(existsSync(join(folder, 'settings.broken.json'))).toBe(true)
  })
})
