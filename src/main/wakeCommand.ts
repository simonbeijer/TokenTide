/**
 * Arguments for a Wake, as given in PLAN.md under Tech, Commands.
 * A Wake must never use `--bare`: bare mode skips the subscription login and starts no Window.
 */
export function wakeCommand(): string[] {
  return [
    '-p', '!',
    '--model', 'haiku',
    '--tools', '',
    '--disable-slash-commands',
    '--strict-mcp-config',
    '--output-format', 'stream-json',
    '--verbose'
  ]
}
