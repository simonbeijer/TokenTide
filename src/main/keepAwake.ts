import type { Entry } from '../shared/entry'

/** The part of Electron's powerSaveBlocker the app uses. */
export interface PowerSaveBlocker {
  start(): number
  stop(id: number): void
}

/** The computer must stay awake while any Entry still has to start or is working, so it starts on time at night. */
const needsAwake = (entries: Entry[]) =>
  entries.some((entry) => entry.status === 'Waiting' || entry.status === 'Running')

/**
 * Keeps the computer awake while any Entry is Waiting or Running, and lets it sleep otherwise.
 * A charger and an open lid are still needed: this only stops the computer from going to sleep by itself.
 */
export function createKeepAwake(blocker: PowerSaveBlocker) {
  let blockId: number | undefined
  /** Set on Quit: Waiting Entries stay Waiting then, but nothing will start them until the app is opened again. */
  let quitting = false
  const letSleep = () => {
    if (blockId !== undefined) blocker.stop(blockId)
    blockId = undefined
  }

  return {
    /** Called with the list at start and after every change to it. */
    update(entries: Entry[]) {
      if (!quitting && needsAwake(entries)) {
        if (blockId === undefined) blockId = blocker.start()
      } else letSleep()
    },
    /** Quit: lets the computer sleep again, whatever the list says from now on. */
    quit() {
      quitting = true
      letSleep()
    }
  }
}
