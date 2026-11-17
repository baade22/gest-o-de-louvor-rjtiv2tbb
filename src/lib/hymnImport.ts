// Importar hinos de arquivo para o Hinário do site (painel Site e App › Hinário).
// Aceita a exportação de músicas do Holyrics (.mufl) e JSON (lista de hinos com número, título e
// letra). Só lê o arquivo que a igreja escolheu; nada vem da internet.

import { readJavaObject } from './javaSerial'

export interface ImportedHymn {
  number: number
  title: string
  lyrics: string
  /** hinário próprio quando o hino diz ser de outro (ex.: um HCC no meio do Cantor Cristão) */
  hymnal?: string
}

export interface ImportResult {
  hymns: ImportedHymn[]
  /** nome do hinário que o arquivo sugere (ex.: "Cantor Cristão") */
  hymnal: string
  skipped: number
}

const HYMNAL_RE =
  /(cantor\s+crist[aã]o|harpa\s+crist[aã]|hin[aá]rio\s+para\s+o\s+culto\s+crist[aã]o|hcc)/i

function clean(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\r/g, '').trim() : ''
}

/** "Cantor Cristão - 498", "CC498 CC-498", "Louvor (Cantor Cristão - 385)", "Coroai cantor cristão 60" */
export function numberFrom(...texts: string[]): number {
  for (const t of texts) {
    if (!t) continue
    const m =
      /(?:hino\s+)?(\d{1,4})\s+HCC\b/i.exec(t) ||
      /\bHCC\s*-?\s*(\d{1,4})\b/i.exec(t) ||
      /(?:crist[aã]o|harpa)\s*[-–nº°.]*\s*(\d{1,4})\b/i.exec(t) ||
      /\b(?:CC|HC|HCC)\s*-?\s*(\d{1,4})\b/i.exec(t) ||
      /^\s*(\d{1,4})\s*[-–.)]\s+\S/.exec(t) ||
      /[-–]\s*(\d{1,4})\s*$/.exec(t)
    if (m) return Number(m[1])
  }
  return 0
}

/** Tira do título o nome do hinário e o número: "Louvor (Cantor Cristão - 385)" -> "Louvor". */
export function cleanTitle(title: string): string {
  let t = title
    .replace(/\(\s*[^)]*(?:crist[aã]o|harpa)[^)]*\)/gi, '')
    .replace(/\s*[-–]?\s*(cantor\s+crist[aã]o|harpa\s+crist[aã])\s*[-–nº°.]*\s*\d*\s*$/i, '')
    .replace(/^\s*(?:hino\s+)?\d{1,4}\s+HCC\s+/i, '')
    .replace(/\s+HCC\s*\d{1,4}\s*$/i, '')
    .replace(/\s*[-–]\s*\d{1,4}\s*HCC\s*$/i, '')
    .replace(/\s*\([^)]*\/[^)]*\)\s*$/, '')
    .replace(/^\s*\d{1,4}\s*[-–.)]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!t) t = title.trim()
  return t
}

function hymnalFrom(...texts: string[]): string {
  for (const t of texts) {
    const m = t && HYMNAL_RE.exec(t)
    if (m) {
      const k = m[1].toLowerCase()
      if (k.startsWith('cantor')) return 'Cantor Cristão'
      if (k.startsWith('harpa')) return 'Harpa Cristã'
      return 'Hinário para o Culto Cristão'
    }
  }
  return ''
}

/** Exportação de músicas do Holyrics (.mufl = lista de com.limagiran.holyrics.model.Music). */
export function parseMufl(bytes: Uint8Array): ImportResult {
  const root = readJavaObject(bytes) as { $items?: unknown[] } | null
  const list = Array.isArray(root?.$items) ? root!.$items : []
  const hymns: ImportedHymn[] = []
  const votes: Record<string, number> = {}
  let skipped = 0
  for (const raw of list) {
    const m = raw as Record<string, unknown>
    if (!m || typeof m !== 'object' || m.archived === true) {
      skipped++
      continue
    }
    const title = clean(m.title)
    const lyrics = clean(m.lyrics)
    const artist = clean(m.artist)
    const note = clean(m.note)
    const language = clean(m.language)
    if (!title) {
      skipped++
      continue
    }
    // O título/nota diz o hinário com mais certeza que o artista (que às vezes é o do arquivo)
    const own = hymnalFrom(title, note)
    const h = own || hymnalFrom(language, artist)
    if (h) votes[h] = (votes[h] || 0) + 1
    hymns.push({
      number: own ? numberFrom(title, note, artist) : numberFrom(artist, note, title),
      title: cleanTitle(title),
      lyrics,
      hymnal: own || undefined,
    })
  }
  const hymnal = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  // Hino que só repete o hinário do arquivo não precisa de hinário próprio
  for (const x of hymns) if (x.hymnal === hymnal) delete x.hymnal
  return { hymns: dedupe(sortHymns(hymns)), hymnal, skipped }
}

/** JSON: lista (ou { hymns: [...] }) com número, título e letra (vários nomes de campo aceitos). */
export function parseJson(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (_) {
    throw new Error('O arquivo JSON está com erro de formatação.')
  }
  const obj = data as Record<string, unknown>
  // Lista, { hymns: [...] }, { hinos: [...] } ou um objeto com o número como chave ({ "1": {...} })
  const keyed = !Array.isArray(data) && !Array.isArray(obj?.hymns) && !Array.isArray(obj?.hinos)
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(obj?.hymns)
      ? (obj.hymns as unknown[])
      : Array.isArray(obj?.hinos)
        ? (obj.hinos as unknown[])
        : obj && typeof obj === 'object'
          ? Object.entries(obj).map(([k, v]) =>
              v && typeof v === 'object' && !Array.isArray(v) ? { $key: k, ...(v as object) } : v,
            )
          : []
  const pick = (o: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]
    return undefined
  }
  const asText = (v: unknown): string => {
    // estrofes como objeto ({ "1": "...", "2": "..." }) viram lista na ordem dos números
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>
      if (!Object.keys(o).some((k) => ['text', 'texto', 'lyrics', 'letra', 'verse'].includes(k)))
        v = Object.keys(o)
          .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
          .map((k) => o[k])
    }
    if (Array.isArray(v))
      return v
        .map((x) =>
          typeof x === 'string'
            ? asText(x)
            : x && typeof x === 'object'
              ? asText(
                  pick(x as Record<string, unknown>, ['text', 'texto', 'lyrics', 'letra', 'verse']),
                )
              : '',
        )
        .filter(Boolean)
        .join('\n\n')
    return typeof v === 'string'
      ? v
          .replace(/\s*<br\s*\/?>\s*/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/[ \t]+\n/g, '\n')
      : ''
  }
  const hymns: ImportedHymn[] = []
  let skipped = 0
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') {
      skipped++
      continue
    }
    const o = raw as Record<string, unknown>
    const title = clean(
      asText(pick(o, ['title', 'titulo', 'título', 'name', 'nome', 'hino', 'hymn'])),
    )
    if (!title) {
      skipped++
      continue
    }
    const keyN = keyed && /^\d{1,4}$/.test(String(o.$key)) ? Number(o.$key) : NaN
    const n = Number(pick(o, ['number', 'numero', 'número', 'num', 'n', 'id']) ?? keyN)
    let lyrics = asText(
      pick(o, ['lyrics', 'letra', 'text', 'texto', 'verses', 'estrofes', 'stanzas']),
    )
    const chorus = asText(pick(o, ['chorus', 'coro', 'refrao', 'refrão']))
    if (chorus && !lyrics.includes(chorus)) {
      const parts = lyrics.split(/\n\s*\n/)
      lyrics = [parts[0], `Coro\n${chorus}`, ...parts.slice(1)].filter(Boolean).join('\n\n')
    }
    hymns.push({
      number: Number.isFinite(n) && n > 0 && n < 10000 ? Math.floor(n) : numberFrom(title),
      title: cleanTitle(title),
      lyrics: clean(lyrics),
    })
  }
  return { hymns: dedupe(sortHymns(hymns)), hymnal: '', skipped }
}

export async function parseHymnFile(file: File): Promise<ImportResult> {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (buf[0] === 0xac && buf[1] === 0xed) return parseMufl(buf)
  const r = parseJson(new TextDecoder('utf-8').decode(buf))
  // O JSON não diz o hinário: tenta pelo nome do arquivo ("harpa_crista_640_hinos.json")
  if (!r.hymnal) r.hymnal = hymnalFrom(file.name.replace(/[_-]+/g, ' '))
  return r
}

function sortHymns(list: ImportedHymn[]) {
  return list.sort(
    (a, b) => (a.number || 99999) - (b.number || 99999) || a.title.localeCompare(b.title),
  )
}

/** Para comparar títulos: sem acento, sem caixa e sem pontuação. */
export function foldKey(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Mesmo hinário, número e título: fica um só (o de letra mais completa). */
function dedupe(list: ImportedHymn[]) {
  const seen = new Map<string, ImportedHymn>()
  const out: ImportedHymn[] = []
  for (const h of list) {
    const k = `${h.hymnal || ''}|${h.number}|${foldKey(h.title)}`
    const prev = seen.get(k)
    if (!prev) {
      seen.set(k, h)
      out.push(h)
    } else if (h.lyrics.length > prev.lyrics.length) {
      prev.lyrics = h.lyrics
    }
  }
  return out
}
