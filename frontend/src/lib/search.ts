/**
 * Full-text search over the vault: note titles, note text, and diagram titles and code.
 *
 * Query syntax: words match in any order and all must appear somewhere in the file;
 * "quoted text" matches as a phrase; #tag or tag:name keeps notes with that tag;
 * folder:name keeps notes in that folder or below; in:notes / in:diagrams limits where words match.
 */
import type { VaultFile } from '../types'
import { extractTags } from './links'

export interface Query {
  /** Lower-cased words and phrases; every one must match. */
  terms: string[]
  tags: string[]
  folder?: string
  scope: 'all' | 'notes' | 'diagrams'
}

export interface Hit {
  /** `doc` lines are 0-based, like the outline's heading lines; diagram lines are 1-based, like the code editor's. */
  where: 'doc' | 'diagram'
  line: number
  text: string
  diagramId?: string
  diagramTitle?: string
}

export interface Result {
  file: VaultFile
  score: number
  hits: Hit[]
}

const MAX_HITS = 5

export function parseQuery(input: string): Query {
  const q: Query = { terms: [], tags: [], scope: 'all' }
  for (const m of input.matchAll(/"([^"]*)"?|(\S+)/g)) {
    if (m[1] !== undefined) {
      const phrase = m[1].trim().toLowerCase()
      if (phrase) q.terms.push(phrase)
      continue
    }
    const tok = m[2]
    const f = /^(tag|folder|in):(.*)$/i.exec(tok)
    if (tok.startsWith('#') && tok.length > 1) q.tags.push(tok.slice(1).toLowerCase())
    else if (f && f[2]) {
      const key = f[1].toLowerCase()
      const val = f[2].toLowerCase()
      if (key === 'tag') q.tags.push(val.replace(/^#/, ''))
      else if (key === 'folder') q.folder = val.replace(/^\/|\/$/g, '')
      else if (val === 'notes' || val === 'diagrams') q.scope = val
    } else q.terms.push(tok.toLowerCase())
  }
  return q
}

export const isEmpty = (q: Query) => !q.terms.length && !q.tags.length && q.folder === undefined

export function search(files: VaultFile[], input: string): Result[] {
  const q = parseQuery(input)
  if (isEmpty(q)) return []
  const out: Result[] = []
  for (const file of files) {
    if (q.folder !== undefined) {
      const folder = file.folder.toLowerCase()
      if (folder !== q.folder && !folder.startsWith(q.folder + '/')) continue
    }
    if (q.tags.length) {
      const tags = extractTags(file.doc).map((t) => t.toLowerCase())
      if (!q.tags.every((t) => tags.includes(t))) continue
    }
    const r = match(file, q)
    if (r) out.push(r)
  }
  return out.sort((a, b) => b.score - a.score || a.file.title.localeCompare(b.file.title))
}

function match(file: VaultFile, q: Query): Result | null {
  if (!q.terms.length) return { file, score: 0, hits: [] }
  const notes = q.scope !== 'diagrams'
  const diagrams = q.scope !== 'notes'
  const title = file.title.toLowerCase()
  const haystack = [
    notes ? title : '',
    notes ? file.doc.toLowerCase() : '',
    ...(diagrams ? file.diagrams.map((d) => d.title.toLowerCase() + '\n' + d.code.toLowerCase()) : []),
  ].join('\n')
  if (!q.terms.every((t) => haystack.includes(t))) return null

  let score = 0
  for (const t of q.terms) {
    if (notes && title === t) score += 30
    else if (notes && title.includes(t)) score += 10
    score += Math.min(count(haystack, t), 10)
  }

  const hits: (Hit & { n: number })[] = []
  const scan = (text: string, base: Omit<Hit, 'line' | 'text'>, offset: number) =>
    text.split('\n').forEach((raw, i) => {
      const lower = raw.toLowerCase()
      const n = q.terms.filter((t) => lower.includes(t)).length
      if (n) hits.push({ ...base, line: i + offset, text: raw.trim(), n })
    })
  if (notes) scan(file.doc, { where: 'doc' }, 0)
  if (diagrams) for (const d of file.diagrams) scan(d.code, { where: 'diagram', diagramId: d.id, diagramTitle: d.title }, 1)
  // Lines that match more of the query first, then in reading order.
  const best = hits
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.n - a.h.n || a.i - b.i)
    .slice(0, MAX_HITS)
    .sort((a, b) => a.i - b.i)
    .map(({ h }) => ({ where: h.where, line: h.line, text: h.text, ...(h.diagramId && { diagramId: h.diagramId, diagramTitle: h.diagramTitle }) }))
  return { file, score, hits: best }
}

function count(text: string, term: string) {
  let n = 0
  for (let i = text.indexOf(term); i >= 0; i = text.indexOf(term, i + term.length)) n++
  return n
}
