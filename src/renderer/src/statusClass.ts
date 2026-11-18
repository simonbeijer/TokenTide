import type { EntryStatus } from '../../shared/entry'

/** The CSS class for a status, such as "status-limit-reached". */
export const statusClass = (status: EntryStatus) => `status-${status.toLowerCase().replaceAll(' ', '-')}`
