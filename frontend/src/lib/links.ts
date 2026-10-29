import type { VaultFile } from '../types'

const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g
const TAG = /(^|\s)#([\p{L}\p{N}_/-]+)/gu

export function extractLinks(doc: string): string[] {
  const out = new Set<string>()
  for (const m of stripCode(doc).matchAll(WIKI)) out.add(m[1].trim())
  return [...out]
}

const DIAGRAM_LINK = /\blink:\s*("?)([^,\]"\n]+)\1/g

/** Notes named by `link:` properties in a file's diagrams. */
export function diagramLinks(file: VaultFile): string[] {
  const out = new Set<string>()
  for (const d of file.diagrams) for (const m of d.code.replace(/\/\/.*$/gm, '').matchAll(DIAGRAM_LINK)) out.add(m[2].trim())
  return [...out]
}

/** Wikilinks in the note plus links from its diagrams. */
export function fileLinks(file: VaultFile): string[] {
  return [...new Set([...extractLinks(file.doc), ...diagramLinks(file)])]
}

export function extractTags(doc: string): string[] {
  const out = new Set<string>()
  for (const m of stripCode(doc).matchAll(TAG)) {
    if (!/^\d+$/.test(m[2])) out.add(m[2])
  }
  return [...out]
}

export function extractHeadings(doc: string): { level: number; text: string; line: number }[] {
  const res: { level: number; text: string; line: number }[] = []
  let inCode = false
  doc.split('\n').forEach((l, i) => {
    if (l.startsWith('```')) inCode = !inCode
    const m = !inCode && /^(#{1,6})\s+(.+)/.exec(l)
    if (m) res.push({ level: m[1].length, text: m[2].trim(), line: i })
  })
  return res
}

function stripCode(doc: string) {
  return doc.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
}

export function findByTitle(files: Record<string, VaultFile>, title: string) {
  const t = title.trim().toLowerCase()
  return Object.values(files).find((f) => f.title.toLowerCase() === t)
}

export function backlinks(files: Record<string, VaultFile>, target: VaultFile) {
  const t = target.title.toLowerCase()
  return Object.values(files).filter(
    (f) => f.id !== target.id && fileLinks(f).some((l) => l.toLowerCase() === t),
  )
}

/** Files that mention the title as plain text without linking it. */
export function unlinkedMentions(files: Record<string, VaultFile>, target: VaultFile) {
  const t = target.title.toLowerCase()
  if (t.length < 3) return []
  return Object.values(files).filter((f) => {
    if (f.id === target.id) return false
    const body = f.doc.replace(WIKI, '').toLowerCase()
    return body.includes(t) && !extractLinks(f.doc).some((l) => l.toLowerCase() === t)
  })
}

export function wikiToHtml(md: string): string {
  return md.replace(WIKI, (_, target: string, alias?: string) => {
    const label = alias ?? target
    return `<a class="internal-link" data-target="${escapeAttr(target.trim())}">${label}</a>`
  })
}

export function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
