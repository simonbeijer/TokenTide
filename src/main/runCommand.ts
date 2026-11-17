import type { RunOptions } from '../shared/entry'

/**
 * Arguments for a Run, as given in PLAN.md under Tech, Commands. "Skip all prompts" replaces `--permission-mode auto`
 * with `--dangerously-skip-permissions`. The prompt comes last, after `--`, so a prompt that starts with a dash
 * is never read as an option.
 */
export function runCommand({ prompt, permissionMode, model }: Omit<RunOptions, 'project'>): string[] {
  return [
    '-p',
    ...(permissionMode === 'Auto' ? ['--permission-mode', 'auto'] : ['--dangerously-skip-permissions']),
    '--permission-prompts', 'none',
    '--strict-mcp-config',
    '--model', model,
    '--output-format', 'stream-json',
    '--verbose',
    '--', prompt
  ]
}
