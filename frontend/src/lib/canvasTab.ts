import type { VaultFile } from '../types'

/** The whiteboard's id among a note's canvas tabs. */
export const WHITEBOARD = '__whiteboard__'

/**
 * The canvas tab a note shows when `active` is chosen: that diagram if it exists, the
 * whiteboard if chosen or when there are no diagrams, otherwise the first diagram.
 */
export function canvasTab(file: Pick<VaultFile, 'diagrams'>, active: string) {
  if (file.diagrams.some((d) => d.id === active)) return active
  return active === WHITEBOARD || !file.diagrams.length ? WHITEBOARD : file.diagrams[0].id
}
