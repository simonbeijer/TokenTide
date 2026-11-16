import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { locateClaude } from './claudeLocation'

let home: string
let elsewhere: string

/** Installs Claude the way its installer does: a link that points into a version folder. */
function installClaudeAt(link: string): string {
  const version = join(home, '.local', 'share', 'claude', 'versions', '2.1.0')
  mkdirSync(join(version, '..'), { recursive: true })
  writeFileSync(version, '#!/bin/sh\n')
  chmodSync(version, 0o755)
  mkdirSync(join(link, '..'), { recursive: true })
  symlinkSync(version, link)
  return link
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'tokentide-home-'))
  elsewhere = mkdtempSync(join(tmpdir(), 'tokentide-elsewhere-'))
})

describe('locateClaude', () => {
  it('uses ~/.local/bin/claude when it is there, and keeps the link rather than the version folder', () => {
    const link = installClaudeAt(join(home, '.local', 'bin', 'claude'))
    const shellAnswer = installClaudeAt(join(elsewhere, 'claude'))

    expect(locateClaude({ home, loginShellClaude: shellAnswer })).toEqual({ path: link, found: true })
  })

  it("uses the login shell's answer when ~/.local/bin/claude is not there", () => {
    const shellAnswer = installClaudeAt(join(elsewhere, 'claude'))

    expect(locateClaude({ home, loginShellClaude: shellAnswer })).toEqual({ path: shellAnswer, found: true })
  })

  it('finds no Claude when neither place has one', () => {
    expect(locateClaude({ home })).toEqual({ found: false })
    expect(locateClaude({ home, loginShellClaude: join(elsewhere, 'claude') })).toEqual({ found: false })
  })

  it('does not take a file that cannot be run for Claude', () => {
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    writeFileSync(join(home, '.local', 'bin', 'claude'), 'not a program')

    expect(locateClaude({ home })).toEqual({ found: false })
  })

  it("uses the user's own path over any Claude the app could find", () => {
    installClaudeAt(join(home, '.local', 'bin', 'claude'))
    const chosen = installClaudeAt(join(elsewhere, 'claude'))

    expect(locateClaude({ home, chosen })).toEqual({ path: chosen, found: true, chosen: true })
  })

  it("keeps the user's own path even when it no longer leads to Claude, and says so", () => {
    installClaudeAt(join(home, '.local', 'bin', 'claude'))
    const chosen = join(elsewhere, 'gone', 'claude')

    expect(locateClaude({ home, chosen })).toEqual({ path: chosen, found: false, chosen: true })
  })
})
