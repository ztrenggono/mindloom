/**
 * Links to one note, optionally to one of its diagrams or its whiteboard:
 *   #/n/<note id>
 *   #/n/<note id>/<diagram id>
 * A hash keeps them working behind any static server, and the note id survives renames.
 * Opening one needs access to the same server, so it is for people who share the vault.
 */
export interface Target {
  fileId: string
  diagramId?: string
}

export function parseLink(hash: string): Target | null {
  const m = /^#\/n\/([^/]+)(?:\/([^/]+))?\/?$/.exec(hash)
  if (!m) return null
  try {
    return { fileId: decodeURIComponent(m[1]), ...(m[2] && { diagramId: decodeURIComponent(m[2]) }) }
  } catch {
    return null
  }
}

export function linkHash({ fileId, diagramId }: Target) {
  return `#/n/${encodeURIComponent(fileId)}${diagramId ? '/' + encodeURIComponent(diagramId) : ''}`
}

/** The full address to send someone. */
export const linkUrl = (t: Target, base = location.origin + location.pathname) => base + linkHash(t)
