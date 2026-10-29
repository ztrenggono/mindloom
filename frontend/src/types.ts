export type DiagramType = 'erd' | 'flowchart' | 'sequence' | 'cloud' | 'mindmap'

export interface Diagram {
  id: string
  title: string
  type: DiagramType
  code: string
  /** Code saved by "Save snapshot", the baseline the diff view compares against. */
  snapshot?: { code: string; at: number }
}

/** Same three layouts as Eraser: document only, split, or canvas only. */
export type Layout = 'doc' | 'both' | 'canvas'

export interface VaultFile {
  id: string
  title: string
  /** Folder path such as "Database/Notes"; empty string is the vault root. */
  folder: string
  doc: string
  diagrams: Diagram[]
  /** Excalidraw scene elements for the freeform whiteboard. */
  whiteboard: unknown[] | null
  /** Images used on the whiteboard, keyed by Excalidraw file id. */
  whiteboardFiles?: Record<string, unknown>
  layout: Layout
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface VaultState {
  files: Record<string, VaultFile>
  folders: string[]
  openTabs: string[]
  activeTab: string | null
  theme: 'dark' | 'light'
}

export const GRAPH_TAB = '__graph__'
