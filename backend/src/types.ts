/**
 * Wire types for the sync API. `VaultFile` mirrors inkvault/src/types.ts; the server
 * stores it as JSON and only reads `id` and `updatedAt`, so extra fields pass through.
 */
export interface VaultFile {
  id: string
  title: string
  folder: string
  updatedAt: number
  [key: string]: unknown
}

export interface Tombstone {
  id: string
  /** Deletion time in ms; it wins over any edit made before it. */
  at: number
}

export interface SyncRequest {
  upserts?: VaultFile[]
  deletes?: Tombstone[]
  folders?: { value: string[]; at: number }
}

export interface VaultSnapshot {
  files: VaultFile[]
  tombstones: Tombstone[]
  folders: { value: string[]; at: number } | null
}
