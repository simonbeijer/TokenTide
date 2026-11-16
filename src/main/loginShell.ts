import { execFile } from 'node:child_process'

/** What the user's login shell says. Each part is missing when the shell could not tell. */
export interface LoginShellAnswer {
  /** The PATH a terminal gets. An app started from Finder does not get it by itself. */
  path?: string
  /** Where Claude is, as the shell finds it on its PATH. A link stays a link. */
  claude?: string
}

export interface LoginShellOptions {
  env?: NodeJS.ProcessEnv
  /** How long the shell gets to answer, in ms. A profile can wait for input or hang. */
  timeout?: number
}

// The profile files may print anything, so the answer sits between two markers.
const marker = '__TOKENTIDE__'
const script = `printf '\\n${marker}\\n%s\\n' "$PATH"; command -v claude; printf '${marker}\\n'`

/**
 * Asks the user's login shell for its PATH and for where Claude is.
 * The shell is interactive as well, since many users set PATH in the file only such a shell reads (`~/.zshrc`).
 */
export function readLoginShell(shell: string, { env = process.env, timeout = 10_000 }: LoginShellOptions = {}) {
  return new Promise<LoginShellAnswer>((resolve) => {
    const child = execFile(shell, ['-ilc', script], { env, timeout, killSignal: 'SIGKILL' }, (error, stdout) => {
      if (error && !stdout.includes(`${marker}\n`)) return resolve({})
      resolve(parseAnswer(stdout))
    })
    child.stdin?.end()
  })
}

function parseAnswer(stdout: string): LoginShellAnswer {
  const parts = stdout.split(`${marker}\n`)
  if (parts.length < 3) return {}
  const [path, claude] = parts[1].split('\n')
  return {
    ...(path && { path }),
    // `command -v` names an alias or a function in words; only an absolute path is a place to start Claude from.
    ...(claude?.startsWith('/') && { claude })
  }
}
