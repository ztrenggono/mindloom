import { parseErd, parseFlow, parseMindmap, parseSequence, type MindNode } from '../dsl/parse'
import type { DiagramType } from '../types'

export interface DiagramObject { line: number; label: string; link?: string }

export function diagramObjects(type: DiagramType, code: string): DiagramObject[] {
  let objects: { line?: number; label: string; link?: string }[]
  if (type === 'erd') objects = [...parseErd(code).entities.values()].map((n) => ({ ...n, label: n.name }))
  else if (type === 'sequence') objects = parseSequence(code).participants.map((n) => ({ ...n, label: n.name }))
  else if (type === 'mindmap') {
    objects = []
    const visit = (n: MindNode) => { objects.push(n); n.children.forEach(visit) }
    parseMindmap(code).roots.forEach(visit)
  } else objects = [...parseFlow(code).nodes.values()]
  const lines = code.split('\n')
  return objects.filter((n): n is DiagramObject => Boolean(n.line) && !/\s+(?:<>|-->|<--|>|<|--|-)\s+/.test(lines[n.line! - 1]))
}

/** Only called for an explicit object declaration returned by diagramObjects. */
export function setObjectLink(code: string, line: number, target: string) {
  const lines = code.split('\n')
  const source = lines[line - 1]
  if (source === undefined) return code
  const commentAt = source.indexOf('//')
  const comment = commentAt < 0 ? '' : source.slice(commentAt)
  let declaration = commentAt < 0 ? source : source.slice(0, commentAt)
  const attrs = /\[([^\]]*)\]/.exec(declaration)
  const parts = (attrs?.[1].split(',') ?? []).map((s) => s.trim()).filter((s) => s && !/^link\s*:/i.test(s))
  if (target) parts.push(`link: ${target}`)
  const block = parts.length ? `[${parts.join(', ')}]` : ''
  if (attrs) declaration = declaration.slice(0, attrs.index) + block + declaration.slice(attrs.index + attrs[0].length)
  else if (block) declaration = declaration.replace(/\s*(\{)?\s*$/, (_, brace: string | undefined) => ` ${block}${brace ? ' {' : ''}`)
  lines[line - 1] = declaration.trimEnd() + (comment ? ' ' + comment : '')
  return lines.join('\n')
}
