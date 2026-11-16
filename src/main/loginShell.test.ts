import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readLoginShell } from './loginShell'

const fakeShell = resolve(__dirname, '../../test/fixtures/fake-login-shell.sh')

function folderWithClaudeLink(): { bin: string; link: string } {
  const root = mkdtempSync(join(tmpdir(), 'tokentide-shell-'))
  const versions = join(root, 'versions')
  const bin = join(root, 'bin')
  mkdirSync(versions)
  mkdirSync(bin)
  writeFileSync(join(versions, '2.1.0'), '#!/bin/sh\n')
  chmodSync(join(versions, '2.1.0'), 0o755)
  symlinkSync(join(versions, '2.1.0'), join(bin, 'claude'))
  return { bin, link: join(bin, 'claude') }
}

describe('readLoginShell', () => {
  it("reads the login shell's PATH, past any noise the profile prints", async () => {
    const answer = await readLoginShell(fakeShell, { env: { FAKE_SHELL_PATH: '/opt/a:/usr/bin:/bin' } })

    expect(answer.path).toBe('/opt/a:/usr/bin:/bin')
  })

  it('asks where Claude is and gets the link, not the version folder it points to', async () => {
    const { bin, link } = folderWithClaudeLink()

    const answer = await readLoginShell(fakeShell, { env: { FAKE_SHELL_PATH: `${bin}:/usr/bin:/bin` } })

    expect(answer.claude).toBe(link)
  })

  it('has no answer for Claude when the login shell cannot find it', async () => {
    const answer = await readLoginShell(fakeShell, { env: { FAKE_SHELL_PATH: '/usr/bin:/bin' } })

    expect(answer.claude).toBeUndefined()
  })

  it('starts the shell as an interactive login shell, so both its profile files are read', async () => {
    const record = join(mkdtempSync(join(tmpdir(), 'tokentide-shell-')), 'args')

    await readLoginShell(fakeShell, { env: { FAKE_SHELL_PATH: '/usr/bin:/bin', FAKE_SHELL_RECORD: record } })

    expect(readFileSync(record, 'utf8').split('\n')[0]).toBe('-ilc')
  })

  it('has no answer at all when the shell cannot be started', async () => {
    expect(await readLoginShell('/nonexistent/shell')).toEqual({})
  })

  it('gives up on a shell that never ends', async () => {
    const hangingShell = join(mkdtempSync(join(tmpdir(), 'tokentide-shell-')), 'hang.sh')
    writeFileSync(hangingShell, '#!/bin/sh\nexec sleep 30\n')
    chmodSync(hangingShell, 0o755)

    expect(await readLoginShell(hangingShell, { timeout: 200 })).toEqual({})
  })
})
