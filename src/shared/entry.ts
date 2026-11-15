export type EntryStatus = 'Waiting' | 'Running' | 'Done' | 'Failed'

export type EntryKind = 'Wake'

export interface Entry {
  id: string
  kind: EntryKind
  startTime: 'Now'
  status: EntryStatus
}
