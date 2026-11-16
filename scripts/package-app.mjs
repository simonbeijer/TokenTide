#!/usr/bin/env node
// Builds dist/TokenTide.app from the electron-vite output in out/, so the app can be started from Finder.
// It wraps the app in the Electron.app that npm already installed, so nothing is downloaded.
// Run it through `npm run package`, which builds out/ first.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronApp = join(root, 'node_modules', 'electron', 'dist', 'Electron.app')
const target = join(root, 'dist', 'TokenTide.app')
const contents = join(target, 'Contents')
const plist = join(contents, 'Info.plist')

if (process.platform !== 'darwin') throw new Error('TokenTide.app can only be built on macOS.')
if (!existsSync(join(root, 'out', 'main', 'index.js'))) throw new Error('out/ is missing. Run `npm run package`.')

const run = (command, ...args) => execFileSync(command, args, { stdio: 'inherit' })

rmSync(target, { recursive: true, force: true })
mkdirSync(dirname(target), { recursive: true })
// ditto keeps the links and attributes inside the frameworks, which cp can break.
run('ditto', electronApp, target)

// Electron starts the app it finds in Resources/app instead of its default app.
const resources = join(contents, 'Resources')
rmSync(join(resources, 'default_app.asar'), { force: true })
const app = join(resources, 'app')
cpSync(join(root, 'out'), join(app, 'out'), { recursive: true })
// The name stays the same as in development, so both use the same data folder.
const { name, version, description } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
writeFileSync(join(app, 'package.json'), JSON.stringify({ name, version, description, main: 'out/main/index.js' }, null, 2))

for (const [key, value] of [
  ['CFBundleName', 'TokenTide'],
  ['CFBundleDisplayName', 'TokenTide'],
  ['CFBundleIdentifier', 'app.tokentide'],
  ['CFBundleShortVersionString', version],
  ['CFBundleVersion', version]
]) {
  run('plutil', '-replace', key, '-string', value, plist)
}

// Changing the bundle breaks Electron's signature, and macOS will not start an app with a broken one. Sign it again,
// ad hoc: enough to start it on this computer, not to hand it to others.
run('codesign', '--force', '--deep', '--sign', '-', target)

console.log(`Built ${target}`)
