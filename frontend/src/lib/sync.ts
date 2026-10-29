/**
 * What is left of whole-file sync from before live collaboration (see ./collab.ts): the shapes
 * an older vault was saved in, read once to move it into the live document, and the API token.
 */
import type { VaultFile } from '../types'

/** Edits an older version of the app had not sent yet, saved next to its state in IndexedDB. */
export interface LegacyPending {
  upserts: string[]
  /** Deleted file id → deletion time. */
  deletes: Record<string, number>
}

/** GET /api/vault: the server's vault from before live collaboration. */
export interface LegacySnapshot {
  files: VaultFile[]
  tombstones: { id: string; at: number }[]
  folders: { value: string[]; at: number } | null
}

/** The backend's API_TOKEN, kept per browser. Storage can be blocked, so failures fall back to none. */
const TOKEN_KEY = 'mindloom:token'

export function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* blocked storage: the token lasts until reload */
  }
}

/** The name others see next to your cursor, kept per browser. */
const NAME_KEY = 'mindloom:name'

export function loadName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY)
    if (saved) return saved
    const name = `Guest ${Math.floor(100 + Math.random() * 900)}`
    localStorage.setItem(NAME_KEY, name)
    return name
  } catch {
    return 'Guest'
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    /* blocked storage: the name lasts until reload */
  }
}
