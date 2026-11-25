// Texto formatado do site (sem HTML, seguro para mostrar ao público).
//
// Blocos (no começo da linha):
//   {justificado} {centro} {direita} {esquerda}  alinhamento do parágrafo
//   {grande} {pequeno}                           tamanho da letra do parágrafo
//   # Título   ## Subtítulo   - item   1. item   > citação
// Linha em branco separa parágrafos; quebra simples continua o mesmo parágrafo.
//
// Dentro do texto:
//   **negrito**  *itálico*  __sublinhado__  ~~riscado~~  ==marca-texto==
//   [texto](https://link)  {azul}texto colorido{/}

import { safeLink } from './site'

export type RichAlign = 'left' | 'center' | 'right' | 'justify'
export type RichSize = 'normal' | 'large' | 'small'
export const RICH_COLORS = {
  azul: '#1f4e8c',
  cinza: '#64748b',
  vermelho: '#b91c1c',
  verde: '#15803d',
  dourado: '#a16207',
} as const
export type RichColor = keyof typeof RICH_COLORS

export type RichInline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b' | 'i' | 'u' | 's' | 'mark'; c: RichInline[] }
  | { t: 'a'; href: string; c: RichInline[] }
  | { t: 'color'; color: RichColor; c: RichInline[] }

type Common = { align: RichAlign; size: RichSize }
export type RichBlock =
  | (Common & { kind: 'p' | 'h' | 'h3' | 'quote'; text: string })
  | (Common & { kind: 'ul' | 'ol'; items: string[]; start?: number })

const ALIGN_WORDS: Record<string, RichAlign> = {
  esquerda: 'left',
  centro: 'center',
  direita: 'right',
  justificado: 'justify',
}
const SIZE_WORDS: Record<string, RichSize> = { grande: 'large', pequeno: 'small' }
export const ALIGN_MARK: Record<RichAlign, string> = {
  left: '',
  center: '{centro}',
  right: '{direita}',
  justify: '{justificado}',
}
export const SIZE_MARK: Record<RichSize, string> = {
  normal: '',
  large: '{grande}',
  small: '{pequeno}',
}

const MARKS_RE = /^(?:\s*\{(esquerda|centro|direita|justificado|grande|pequeno)\})+\s*/

/** Separa as marcas de bloco do começo da linha. */
export function splitMarks(line: string): {
  align?: RichAlign
  size?: RichSize
  rest: string
  marked: boolean
} {
  const m = MARKS_RE.exec(line)
  if (!m) return { rest: line, marked: false }
  let align: RichAlign | undefined
  let size: RichSize | undefined
  for (const w of m[0].match(/[a-z]+/g) || []) {
    if (ALIGN_WORDS[w]) align = ALIGN_WORDS[w]
    if (SIZE_WORDS[w]) size = SIZE_WORDS[w]
  }
  return { align, size, rest: line.slice(m[0].length), marked: true }
}

export type LineKind = 'blank' | 'h' | 'h3' | 'ul' | 'ol' | 'quote' | 'p'

/** Tipo da linha (já sem as marcas) e o texto sem o prefixo. */
export function lineKind(rest: string): { kind: LineKind; text: string } {
  const s = rest.trim()
  if (!s) return { kind: 'blank', text: '' }
  let m: RegExpExecArray | null
  if ((m = /^##+\s+(.*)$/.exec(s))) return { kind: 'h3', text: m[1] }
  if ((m = /^#\s+(.*)$/.exec(s))) return { kind: 'h', text: m[1] }
  if ((m = /^[-*•]\s+(.*)$/.exec(s))) return { kind: 'ul', text: m[1] }
  if ((m = /^\d{1,3}[.)]\s+(.*)$/.exec(s))) return { kind: 'ol', text: m[1] }
  if ((m = /^>\s?(.*)$/.exec(s))) return { kind: 'quote', text: m[1] }
  return { kind: 'p', text: s }
}

/**
 * Índices das linhas que começam um bloco (onde ficam as marcas de alinhamento e tamanho):
 * a 1ª linha de cada parágrafo, cada título e o 1º item de cada lista/citação.
 */
export function blockStarts(lines: string[]): number[] {
  const out: number[] = []
  let prev: LineKind = 'blank'
  lines.forEach((line, i) => {
    const { kind } = lineKind(splitMarks(line).rest)
    if (kind === 'blank') {
      prev = 'blank'
      return
    }
    if (kind === 'h' || kind === 'h3' || kind !== prev) out.push(i)
    prev = kind
  })
  return out
}

/**
 * `defaultAlign`: alinhamento dos parágrafos sem marca (o site usa esquerda; os documentos da
 * assembleia, justificado). Com ele diferente de esquerda, {esquerda} passa a valer.
 */
export function parseRich(body: string, defaultAlign: RichAlign = 'left'): RichBlock[] {
  const out: RichBlock[] = []
  let cur: RichBlock | null = null
  const flush = () => {
    if (cur) out.push(cur)
    cur = null
  }
  for (const raw of String(body || '').split(/\r?\n/)) {
    const { align, size, rest, marked } = splitMarks(raw)
    const { kind, text } = lineKind(rest)
    if (kind === 'blank') {
      flush()
      continue
    }
    const c = cur as RichBlock | null
    const fmt = { align: align || defaultAlign, size: size || 'normal' } as Common
    if (kind === 'h' || kind === 'h3') {
      flush()
      out.push({ kind, text, ...fmt })
      continue
    }
    if (kind === 'ul' || kind === 'ol') {
      if (c && c.kind === kind) c.items.push(text)
      else {
        flush()
        // lista numerada começa no número escrito (itens separados por linha em branco seguem 1, 2, 3)
        const n = kind === 'ol' ? Number(/^\s*(\d{1,3})/.exec(rest)?.[1] || 1) : undefined
        cur = { kind, items: [text], ...fmt, ...(n && n > 1 ? { start: n } : {}) }
      }
      continue
    }
    // parágrafo ou citação: continua o bloco se for do mesmo tipo e a linha não tiver marcas
    if (c && c.kind === kind && !marked) {
      c.text += '\n' + text
      continue
    }
    flush()
    cur = { kind, text, ...fmt }
  }
  flush()
  return out
}

const INLINE_RE =
  /\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|==(.+?)==|\*(?!\s)(.+?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\{(azul|cinza|vermelho|verde|dourado)\}([\s\S]+?)\{\/\}/

export function parseInline(s: string): RichInline[] {
  const out: RichInline[] = []
  const text = (v: string) => {
    v.split('\n').forEach((part, i) => {
      if (i) out.push({ t: 'br' })
      if (part) out.push({ t: 'text', v: part })
    })
  }
  let rest = String(s || '')
  while (rest) {
    const m = INLINE_RE.exec(rest)
    if (!m) {
      text(rest)
      break
    }
    if (m.index) text(rest.slice(0, m.index))
    if (m[1] != null) out.push({ t: 'b', c: parseInline(m[1]) })
    else if (m[2] != null) out.push({ t: 'u', c: parseInline(m[2]) })
    else if (m[3] != null) out.push({ t: 's', c: parseInline(m[3]) })
    else if (m[4] != null) out.push({ t: 'mark', c: parseInline(m[4]) })
    else if (m[5] != null) out.push({ t: 'i', c: parseInline(m[5]) })
    else if (m[6] != null) {
      const href = safeLink(m[7])
      if (href) out.push({ t: 'a', href, c: parseInline(m[6]) })
      else text(m[6])
    } else if (m[8] != null)
      out.push({ t: 'color', color: m[8] as RichColor, c: parseInline(m[9]) })
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

function inlinePlain(nodes: RichInline[]): string {
  return nodes.map((n) => (n.t === 'text' ? n.v : n.t === 'br' ? ' ' : inlinePlain(n.c))).join('')
}

/** Texto sem as marcas de formatação (para listas no painel e resumos). */
export function richToPlain(body: string): string {
  return parseRich(body)
    .map((b) =>
      'items' in b
        ? b.items.map((t) => inlinePlain(parseInline(t))).join(' · ')
        : inlinePlain(parseInline(b.text)),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- edição (usada pela barra do editor) ----------

export type Edit = { value: string; start: number; end: number }

/** Põe ou tira um par de marcas em volta da seleção (ex.: ** para negrito). */
export function toggleWrap(
  v: string,
  start: number,
  end: number,
  open: string,
  close = open,
): Edit {
  const before = v.slice(0, start)
  const sel = v.slice(start, end)
  const after = v.slice(end)
  if (before.endsWith(open) && after.startsWith(close)) {
    return {
      value: before.slice(0, -open.length) + sel + after.slice(close.length),
      start: start - open.length,
      end: end - open.length,
    }
  }
  if (sel.startsWith(open) && sel.endsWith(close) && sel.length >= open.length + close.length) {
    const inner = sel.slice(open.length, sel.length - close.length)
    return { value: before + inner + after, start, end: start + inner.length }
  }
  // não leva espaços das pontas para dentro da marca
  const lead = sel.length - sel.trimStart().length
  const trail = sel.length - sel.trimEnd().length
  const core = sel.trim()
  const ins = sel.slice(0, lead) + open + core + close + sel.slice(sel.length - trail)
  const s = start + lead + open.length
  return { value: before + ins + after, start: s, end: s + core.length }
}

function lineRange(v: string, start: number, end: number) {
  const a = v.lastIndexOf('\n', start - 1) + 1
  let b = v.indexOf('\n', end > start && v[end - 1] === '\n' ? end - 1 : end)
  if (b < 0) b = v.length
  return { a, b }
}

/** Transforma as linhas da seleção em título, lista, citação ou parágrafo (clicar de novo desfaz). */
export function setLineKind(
  v: string,
  start: number,
  end: number,
  kind: 'h' | 'h3' | 'ul' | 'ol' | 'quote',
): Edit {
  const { a, b } = lineRange(v, start, end)
  const lines = v.slice(a, b).split('\n')
  const parsed = lines.map((l) => {
    const sm = splitMarks(l)
    const marks = l.slice(0, l.length - sm.rest.length)
    return { marks, ...lineKind(sm.rest) }
  })
  const filled = parsed.filter((p) => p.kind !== 'blank')
  const all = filled.length > 0 && filled.every((p) => p.kind === kind)
  let n = 0
  const prefix = (): string =>
    kind === 'h'
      ? '# '
      : kind === 'h3'
        ? '## '
        : kind === 'ul'
          ? '- '
          : kind === 'ol'
            ? `${++n}. `
            : '> '
  const out = parsed.map((p, i) => {
    if (p.kind === 'blank') return lines[i]
    return p.marks + (all ? '' : prefix()) + p.text
  })
  const text = out.join('\n')
  return { value: v.slice(0, a) + text + v.slice(b), start: a, end: a + text.length }
}

/**
 * Alinhamento ou tamanho dos parágrafos da seleção. Sem nada selecionado, vale para o texto todo.
 */
export function setBlockFormat(
  v: string,
  start: number,
  end: number,
  fmt: { align?: RichAlign; size?: RichSize },
  defaultAlign: RichAlign = 'left',
): Edit {
  const lines = v.split('\n')
  const whole = start === end
  // linha de cada posição
  const lineOf = (pos: number) => v.slice(0, pos).split('\n').length - 1
  const first = whole ? 0 : lineOf(start)
  const last = whole
    ? lines.length - 1
    : lineOf(Math.max(start, end - (v[end - 1] === '\n' ? 1 : 0)))
  const starts = blockStarts(lines)
  // o bloco onde a seleção começa também conta
  const targets = new Set<number>()
  let owner = -1
  for (const s of starts) {
    if (s <= first) owner = s
    if (s >= first && s <= last) targets.add(s)
  }
  if (owner >= 0) targets.add(owner)
  const out = lines.map((line, i) => {
    if (!targets.has(i)) return line
    const sm = splitMarks(line)
    const align = fmt.align ?? sm.align ?? defaultAlign
    const size = fmt.size ?? sm.size ?? 'normal'
    // o alinhamento padrão fica sem marca; esquerda ganha {esquerda} quando o padrão é outro
    const mark = align === defaultAlign ? '' : ALIGN_MARK[align] || '{esquerda}'
    return mark + SIZE_MARK[size] + sm.rest.replace(/^\s+/, '')
  })
  const value = out.join('\n')
  if (whole)
    return { value, start: value.length - (v.length - start), end: value.length - (v.length - end) }
  const a = out.slice(0, first).join('\n').length + (first ? 1 : 0)
  const b = out.slice(0, last + 1).join('\n').length
  return { value, start: a, end: b }
}

/** Alinhamento e tamanho do bloco onde está o cursor (para acender o botão certo). */
export function formatAt(v: string, pos: number, defaultAlign: RichAlign = 'left'): Common {
  const lines = v.split('\n')
  const line = v.slice(0, pos).split('\n').length - 1
  let owner = -1
  for (const s of blockStarts(lines)) if (s <= line) owner = s
  const sm = owner >= 0 ? splitMarks(lines[owner]) : { align: undefined, size: undefined }
  return { align: sm.align || defaultAlign, size: sm.size || 'normal' }
}
