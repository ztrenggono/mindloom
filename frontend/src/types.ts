export interface CommentAnchor {
  field: string
  start: number
  end: number
  quote: string
  currentText?: string
  missing?: boolean
}

export interface CommentReply {
  id: string
  author: string
  body: string
  createdAt: number
}

export interface CommentThread extends CommentReply {
  anchor: CommentAnchor
  resolvedAt?: number
  resolved: boolean
  replies: CommentReply[]
}

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
  comments?: CommentThread[]
  layout: Layout
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export type TrashedFile = VaultFile & { deletedAt: number }

export interface VaultState {
  trash?: Record<string, TrashedFile>
  files: Record<string, VaultFile>
  folders: string[]
  openTabs: string[]
  activeTab: string | null
  theme: 'dark' | 'light'
}

export const GRAPH_TAB = '__graph__'
