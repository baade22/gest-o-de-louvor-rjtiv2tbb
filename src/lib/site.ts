/**
 * Site e App da igreja: contas que não dependem do servidor (migração 0098).
 * - horários dos cultos ("ao vivo agora" e "próximo culto"), em horário de Brasília;
 * - agenda agrupada por mês;
 * - arquivo .ics para "salvar na agenda do celular";
 * - links de WhatsApp, Instagram, mapa;
 * - texto simples das páginas (parágrafos, títulos com #, listas com -).
 */

export interface ServiceTime {
  /** 0 = domingo ... 6 = sábado */
  day: number
  /** HH:mm */
  time: string
  label: string
  /** duração em minutos (padrão 120) */
  duration?: number
}

export interface SiteSections {
  agenda: boolean
  cultos: boolean
  assistir: boolean
  contribuir: boolean
  oracao: boolean
  avisos: boolean
  novo: boolean
}

export const DEFAULT_SECTIONS: SiteSections = {
  agenda: true,
  cultos: true,
  assistir: true,
  contribuir: true,
  oracao: true,
  avisos: true,
  novo: true,
}

export const SECTION_LABELS: Record<keyof SiteSections, { title: string; hint: string }> = {
  agenda: { title: 'Agenda', hint: 'Eventos marcados "mostrar no site" e os cultos' },
  cultos: {
    title: 'Cultos na agenda',
    hint: 'Cultos da agenda do louvor: só nome, dia e hora (ensaios e reuniões ficam de fora)',
  },
  assistir: { title: 'Assistir', hint: 'Cultos e vídeos do canal do YouTube, entram sozinhos' },
  contribuir: {
    title: 'Contribuir',
    hint: 'Chave PIX e campanhas públicas do Financeiro, sem valores',
  },
  oracao: { title: 'Pedido de oração', hint: 'Vai para a caixa da pastoral; nunca é publicado' },
  avisos: { title: 'Avisos da semana', hint: 'Os avisos cadastrados aqui, cada um com período' },
  novo: { title: 'Sou novo aqui', hint: 'Abre o link de autocadastro escolhido abaixo' },
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export const DEFAULT_PRIMARY = '#14213d'
export const DEFAULT_ACCENT = '#c8963e'

const BRT_MS = 3 * 3600 * 1000

export function sections(raw?: Partial<SiteSections> | null): SiteSections {
  return { ...DEFAULT_SECTIONS, ...(raw || {}) }
}

function hm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const v = Number(m[1]) * 60 + Number(m[2])
  return v >= 0 && v < 24 * 60 ? v : null
}

/** Limpa a lista de horários (descarta linhas incompletas) e ordena por dia e hora. */
export function cleanServiceTimes(list: unknown): ServiceTime[] {
  if (!Array.isArray(list)) return []
  return list
    .map((x) => x as Partial<ServiceTime>)
    .filter(
      (x) => Number.isInteger(x.day) && x.day! >= 0 && x.day! <= 6 && hm(x.time || '') !== null,
    )
    .map((x) => ({
      day: x.day!,
      time: String(x.time).padStart(5, '0'),
      label: String(x.label || 'Culto').slice(0, 60),
      duration: x.duration && x.duration > 0 ? Math.min(x.duration, 600) : 120,
    }))
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
}

/** Dia da semana e minuto do dia em Brasília. */
export function brtClock(now: Date): { day: number; minute: number; date: string } {
  const b = new Date(now.getTime() - BRT_MS)
  return {
    day: b.getUTCDay(),
    minute: b.getUTCHours() * 60 + b.getUTCMinutes(),
    date: b.toISOString().slice(0, 10),
  }
}

/**
 * Culto acontecendo agora (de 10 minutos antes até o fim da duração).
 * Serve para mostrar "Ao vivo agora" sem depender de API do YouTube.
 */
export function serviceNow(times: ServiceTime[], now = new Date()): ServiceTime | null {
  const { day, minute } = brtClock(now)
  for (const t of times) {
    const start = hm(t.time)
    if (start === null || t.day !== day) continue
    if (minute >= start - 10 && minute < start + (t.duration || 120)) return t
  }
  return null
}

/** Próximo culto a partir de agora (o de hoje, se ainda não começou). */
export function nextService(
  times: ServiceTime[],
  now = new Date(),
): { service: ServiceTime; daysAhead: number } | null {
  const { day, minute } = brtClock(now)
  let best: { service: ServiceTime; daysAhead: number; key: number } | null = null
  for (const t of times) {
    const start = hm(t.time)
    if (start === null) continue
    let ahead = (t.day - day + 7) % 7
    if (ahead === 0 && start <= minute) ahead = 7
    const key = ahead * 1440 + start
    if (!best || key < best.key) best = { service: t, daysAhead: ahead, key }
  }
  return best ? { service: best.service, daysAhead: best.daysAhead } : null
}

export function whenLabel(daysAhead: number, day: number): string {
  if (daysAhead === 0) return 'Hoje'
  if (daysAhead === 1) return 'Amanhã'
  return WEEKDAYS[day]
}

export function formatTime(t: string): string {
  const v = hm(t)
  if (v === null) return ''
  const h = Math.floor(v / 60)
  const m = v % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export interface AgendaItemLike {
  date: string
  end_date?: string
  time?: string
}

/** Agrupa a agenda por mês ("novembro de 2026"), mantendo a ordem. */
export function groupByMonth<T extends AgendaItemLike>(
  items: T[],
): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = []
  for (const it of items) {
    const [y, m] = it.date.split('-').map(Number)
    if (!y || !m) continue
    const label = `${MONTHS[m - 1]} de ${y}`
    const last = out[out.length - 1]
    if (last && last.label === label) last.items.push(it)
    else out.push({ label, items: [it] })
  }
  return out
}

export function dayParts(date: string): { day: string; weekday: string; month: string } {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return { day: '', weekday: '', month: '' }
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { day: String(d), weekday: WEEKDAYS_SHORT[wd], month: MONTHS[m - 1].slice(0, 3) }
}

export function dateRangeLabel(date: string, end?: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return y ? `${d} de ${MONTHS[m - 1]}` : ''
  }
  if (!end || end === date) return fmt(date)
  const [, m1] = date.split('-').map(Number)
  const [, m2, d2] = end.split('-').map(Number)
  if (m1 === m2) return `${Number(date.slice(8, 10))} a ${d2} de ${MONTHS[m2 - 1]}`
  return `${fmt(date)} a ${fmt(end)}`
}

function icsText(s: string): string {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/** Arquivo .ics de um item da agenda (o celular abre "Adicionar à agenda"). */
export function buildIcs(input: {
  uid: string
  title: string
  date: string
  end_date?: string
  time?: string
  location?: string
  description?: string
  url?: string
  now?: Date
}): string {
  const now = input.now || new Date()
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const d = input.date.replace(/-/g, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LouvorFlow//Site da igreja//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.uid}@louvorflow`,
    `DTSTAMP:${stamp}`,
  ]
  const start = hm(input.time || '')
  if (start !== null && (!input.end_date || input.end_date === input.date)) {
    const t = (v: number) =>
      `${String(Math.floor(v / 60)).padStart(2, '0')}${String(v % 60).padStart(2, '0')}00`
    const end = Math.min(start + 120, 23 * 60 + 59)
    lines.push(`DTSTART;TZID=America/Recife:${d}T${t(start)}`)
    lines.push(`DTEND;TZID=America/Recife:${d}T${t(end)}`)
  } else {
    // Dia inteiro: DTEND é o dia seguinte ao último
    const last = (input.end_date || input.date).split('-').map(Number)
    const next = new Date(Date.UTC(last[0], last[1] - 1, last[2] + 1)).toISOString().slice(0, 10)
    lines.push(`DTSTART;VALUE=DATE:${d}`)
    lines.push(`DTEND;VALUE=DATE:${next.replace(/-/g, '')}`)
  }
  lines.push(`SUMMARY:${icsText(input.title)}`)
  if (input.location) lines.push(`LOCATION:${icsText(input.location)}`)
  const desc = [input.description || '', input.url || ''].filter(Boolean).join('\n\n')
  if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`)
  if (input.url) lines.push(`URL:${input.url}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export function whatsappUrl(phone: string, text = ''): string {
  let digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 11) digits = '55' + digits
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function instagramUrl(v: string): string {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//.test(s)) return s
  return `https://instagram.com/${s.replace(/^@/, '')}`
}

export function facebookUrl(v: string): string {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//.test(s)) return s
  return `https://facebook.com/${s.replace(/^@/, '')}`
}

export function youtubeUrl(v: string): string {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//.test(s)) return s
  return `https://www.youtube.com/${s.startsWith('@') ? s : '@' + s}`
}

export function mapsUrl(address: string, explicit = ''): string {
  if (explicit) return explicit
  if (!address) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** Só aceita link do próprio site (/...) ou https; o resto vira vazio. */
export function safeLink(link: string): string {
  const s = String(link || '').trim()
  if (!s) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (/^https:\/\/[^\s]+$/i.test(s)) return s
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return 'https://' + s
  return ''
}

export function isExternal(link: string): boolean {
  return /^https?:\/\//i.test(link)
}

export function slugify(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export type TextBlock =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

/** Texto das páginas: linha com "# " vira título, "- " vira lista, linha em branco separa. */
export function parseBlocks(body: string): TextBlock[] {
  const out: TextBlock[] = []
  let para: string[] = []
  let list: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') })
    if (list.length) out.push({ kind: 'ul', items: list })
    para = []
    list = []
  }
  for (const raw of String(body || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (/^#{1,3}\s+/.test(line)) {
      flush()
      out.push({ kind: 'h', text: line.replace(/^#{1,3}\s+/, '') })
      continue
    }
    if (/^[-*•]\s+/.test(line)) {
      if (para.length) {
        out.push({ kind: 'p', text: para.join(' ') })
        para = []
      }
      list.push(line.replace(/^[-*•]\s+/, ''))
      continue
    }
    if (list.length) {
      out.push({ kind: 'ul', items: list })
      list = []
    }
    para.push(line)
  }
  flush()
  return out
}

/** Cor legível (preto ou branco) sobre um fundo #rrggbb. */
export function contrastText(hex: string): '#ffffff' | '#111827' {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#111827' : '#ffffff'
}

export function validColor(hex: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : fallback
}

/** Está aberto como app (tela de início)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return !!nav.standalone || window.matchMedia?.('(display-mode: standalone)').matches
}

export function isIos(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))
}
