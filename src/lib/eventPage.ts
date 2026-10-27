/**
 * Página pública do evento e mensagens: texto com formatação simples, campos automáticos,
 * cupons, endereço e links de WhatsApp/mapa. Funções puras (testadas em eventPage.test.ts).
 *
 * As regras de cupom e de mensagem também existem no servidor
 * (hooks/church_event_signup.js e hooks/church_event_payments.js): mudou aqui, muda lá.
 */
import type { ChurchEvent, EventCoupon } from '@/types'

export const DEFAULT_EVENT_COLOR = '#0f766e'

/** Cores prontas para o botão e os destaques da página. */
export const EVENT_COLORS = [
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
  '#be185d',
  '#c2410c',
  '#15803d',
  '#334155',
]

export function eventColor(color?: string): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_EVENT_COLOR
}

// ---------- Campos automáticos das mensagens ----------

export const MESSAGE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'nome', label: 'Primeiro nome' },
  { key: 'evento', label: 'Nome do evento' },
  { key: 'data', label: 'Data' },
  { key: 'local', label: 'Local' },
  { key: 'valor', label: 'Valor' },
  { key: 'igreja', label: 'Igreja' },
]

export type MessageVars = Partial<Record<string, string>>

/** Troca {nome}, {evento}... pelos valores; campo sem valor some. */
export function fillMessage(text: string, vars: MessageVars): string {
  return (text || '').replace(/\{(\w+)\}/g, (all, key: string) => {
    const k = key.toLowerCase()
    return MESSAGE_FIELDS.some((f) => f.key === k) ? (vars[k] ?? '') : all
  })
}

export const DEFAULT_CONFIRM_MESSAGE =
  'Olá, {nome}! Sua inscrição em **{evento}** foi recebida.\n\n' +
  'Data: {data}\nLocal: {local}\n\nQualquer dúvida, fale com a nossa equipe. Deus abençoe!'

export const DEFAULT_PAYMENT_MESSAGE =
  'Olá, {nome}! Recebemos o seu pagamento de **{valor}** para **{evento}**.\n\n' +
  'Sua inscrição está confirmada. Até lá!'

// ---------- Texto com formatação simples ----------
// **negrito**, *itálico*, "- " no começo da linha vira lista, "## " vira título e links
// (http/https) ficam clicáveis. Linha em branco separa parágrafos.

export interface RichSpan {
  text: string
  bold?: boolean
  italic?: boolean
  href?: string
}

export type RichBlock =
  | { type: 'heading'; spans: RichSpan[] }
  | { type: 'paragraph'; lines: RichSpan[][] }
  | { type: 'list'; items: RichSpan[][] }

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/

export function parseInline(line: string): RichSpan[] {
  const out: RichSpan[] = []
  const pattern = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g
  let last = 0
  let m: RegExpExecArray | null
  const pushText = (text: string, style: Omit<RichSpan, 'text'> = {}) => {
    const parts = text.split(URL_RE)
    parts.forEach((part, i) => {
      if (!part) return
      out.push(i % 2 === 1 ? { ...style, text: part, href: part } : { ...style, text: part })
    })
  }
  while ((m = pattern.exec(line))) {
    if (m.index > last) pushText(line.slice(last, m.index))
    if (m[1] !== undefined) pushText(m[1], { bold: true })
    else pushText(m[2], { italic: true })
    last = m.index + m[0].length
  }
  if (last < line.length) pushText(line.slice(last))
  return out
}

export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = []
  let para: RichSpan[][] = []
  let list: RichSpan[][] = []
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', lines: para })
    if (list.length) blocks.push({ type: 'list', items: list })
    para = []
    list = []
  }
  for (const raw of (text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const item = /^\s*[-•]\s+(.*)$/.exec(line)
    if (item) {
      if (para.length) {
        blocks.push({ type: 'paragraph', lines: para })
        para = []
      }
      list.push(parseInline(item[1]))
      continue
    }
    if (list.length) {
      blocks.push({ type: 'list', items: list })
      list = []
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(line)
    if (heading) {
      if (para.length) {
        blocks.push({ type: 'paragraph', lines: para })
        para = []
      }
      blocks.push({ type: 'heading', spans: parseInline(heading[1]) })
      continue
    }
    para.push(parseInline(line))
  }
  flush()
  return blocks
}

/** Versão para WhatsApp: *negrito* e _itálico_, sem marcação de título. */
export function richToWhatsApp(text: string): string {
  return (text || '')
    .split('\n')
    .map((line) => line.replace(/^#{1,3}\s+(.*)$/, '**$1**'))
    .join('\n')
    .replace(/\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g, (_, bold?: string, italic?: string) =>
      bold !== undefined ? `*${bold}*` : `_${italic}_`,
    )
}

// ---------- Cupons ----------

export function normalizeCouponCode(code: string): string {
  return (code || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 30)
}

export function findCoupon(coupons: EventCoupon[] | null | undefined, code: string) {
  const c = normalizeCouponCode(code)
  if (!c || !Array.isArray(coupons)) return null
  return coupons.find((x) => normalizeCouponCode(x.code) === c) || null
}

/** Valor com o desconto do cupom, em reais, arredondado ao centavo e nunca negativo. */
export function priceWithCoupon(price: number, coupon: EventCoupon | null | undefined): number {
  const base = Math.max(0, price || 0)
  if (!coupon || !(coupon.value > 0)) return base
  const off = coupon.kind === 'PERCENT' ? (base * Math.min(coupon.value, 100)) / 100 : coupon.value
  return Math.max(0, Math.round((base - off) * 100) / 100)
}

export function couponLabel(coupon: EventCoupon): string {
  return coupon.kind === 'PERCENT'
    ? `${coupon.value}% de desconto`
    : `${coupon.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`
}

// ---------- Situação das inscrições ----------

export type ClosedReason = '' | 'soon' | 'closed' | 'deadline' | 'full' | 'ended'

export const CLOSED_REASON_LABELS: Record<Exclude<ClosedReason, ''>, string> = {
  soon: 'Inscrições em breve',
  closed: 'Inscrições encerradas',
  deadline: 'O prazo de inscrição terminou',
  full: 'As vagas acabaram',
  ended: 'Evento encerrado',
}

/** Data de hoje no horário de Brasília (AAAA-MM-DD). */
export function todayBrazil(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

export function signupClosedReason(
  event: Pick<
    ChurchEvent,
    'registration_open' | 'publish_only' | 'registration_deadline' | 'closed_at' | 'capacity'
  >,
  todayYMD: string,
  taken: number,
): ClosedReason {
  if (event.closed_at) return 'ended'
  if (event.publish_only) return 'soon'
  if (!event.registration_open) return 'closed'
  const deadline = (event.registration_deadline || '').slice(0, 10)
  if (deadline && todayYMD > deadline) return 'deadline'
  if (event.capacity && taken >= event.capacity) return 'full'
  return ''
}

// ---------- Endereço, mapa e WhatsApp ----------

export type EventAddress = Pick<
  ChurchEvent,
  | 'address_street'
  | 'address_number'
  | 'address_complement'
  | 'address_district'
  | 'address_city'
  | 'address_state'
  | 'address_cep'
>

/** "Av. Vera Cruz, 117, IBMA" e "Vera Cruz · Camaragibe-PE". */
export function addressLines(a: EventAddress): [string, string] {
  const first = [a.address_street, a.address_number, a.address_complement]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(', ')
  const city = [a.address_city, a.address_state]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join('-')
  const second = [(a.address_district || '').trim(), city].filter(Boolean).join(' · ')
  return [first, second]
}

export function hasAddress(a: EventAddress): boolean {
  return !!(a.address_street || a.address_city)
}

export function mapsUrl(a: EventAddress, place = ''): string {
  const q = [
    a.address_street,
    a.address_number,
    a.address_district,
    a.address_city,
    a.address_state,
    a.address_cep,
  ]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || place)}`
}

export function onlyDigits(v: string): string {
  return (v || '').replace(/\D/g, '')
}

export function formatCep(v: string): string {
  const d = onlyDigits(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Resposta do ViaCEP (viacep.com.br) para os campos do evento; null se o CEP não existe. */
export function parseViaCep(data: unknown): Partial<EventAddress> | null {
  if (!data || typeof data !== 'object' || (data as { erro?: unknown }).erro) return null
  const d = data as Record<string, string>
  return {
    address_cep: formatCep(d.cep || ''),
    address_street: d.logradouro || '',
    address_district: d.bairro || '',
    address_city: d.localidade || '',
    address_state: (d.uf || '').toUpperCase(),
  }
}

/** Link do WhatsApp; número brasileiro sem DDI ganha o 55. */
export function whatsappUrl(phone: string, text = ''): string {
  let d = onlyDigits(phone)
  if (d.length === 10 || d.length === 11) d = `55${d}`
  const msg = text ? `?text=${encodeURIComponent(text)}` : ''
  return d ? `https://wa.me/${d}${msg}` : `https://wa.me/${msg}`
}

/** Identificador do Pix da inscrição (até 25 letras e números). */
export function registrationPixTxid(registrationId: string): string {
  return `EV${(registrationId || '').replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 25)
}

/** Campos das mensagens para uma inscrição (o servidor monta os mesmos no e-mail). */
export function messageVarsFor(
  event: Pick<ChurchEvent, 'title' | 'location' | 'address_street' | 'address_number' | 'price'>,
  reg: { name: string; amount?: number },
  dateLabel: string,
  churchName = '',
): MessageVars {
  const amount = reg.amount ?? event.price ?? 0
  return {
    nome: (reg.name || '').trim().split(/\s+/)[0],
    evento: event.title,
    data: dateLabel,
    local:
      event.location || [event.address_street, event.address_number].filter(Boolean).join(', '),
    valor:
      amount > 0
        ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'gratuito',
    igreja: churchName,
  }
}
