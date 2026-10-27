/**
 * Regras puras dos eventos da igreja: totais de inscrição, pagamento e presença.
 */
import type { ChurchEvent, EventRegistration, PaymentMethod } from '@/types'
import { toCalendarYMD } from '@/lib/dateUtils'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  ISENTO: 'Isento',
  OUTRO: 'Outro',
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function isFree(event: Pick<ChurchEvent, 'price'>): boolean {
  return !event.price || event.price <= 0
}

/** Evento já passou (conta o último dia, se tiver data de término). */
export function isPastEvent(
  event: Pick<ChurchEvent, 'starts_on' | 'ends_on'>,
  todayYMD: string,
): boolean {
  const last = toCalendarYMD(event.ends_on) || toCalendarYMD(event.starts_on)
  return !!last && last < todayYMD
}

export interface RegistrationSummary {
  total: number
  paid: number
  pending: number
  attended: number
  /** Valor já recebido. */
  collected: number
  /** Quanto falta receber de quem não pagou (inscrições não isentas). */
  toCollect: number
  spotsLeft: number | null
}

/** Valor que a inscrição deve: o do cupom, se houver, ou o do evento. */
export function registrationDue(
  event: Pick<ChurchEvent, 'price'>,
  reg: Pick<EventRegistration, 'amount_due'>,
): number {
  return reg.amount_due && reg.amount_due > 0 ? reg.amount_due : event.price || 0
}

export function summarizeRegistrations(
  event: Pick<ChurchEvent, 'price' | 'capacity'>,
  regs: EventRegistration[],
): RegistrationSummary {
  let paid = 0
  let pending = 0
  let attended = 0
  let collected = 0
  let toCollect = 0
  for (const r of regs) {
    if (r.paid) {
      paid++
      collected += r.payment_method === 'ISENTO' ? 0 : (r.paid_amount ?? registrationDue(event, r))
    } else if (!isFree(event)) {
      pending++
      toCollect += registrationDue(event, r)
    }
    if (r.attended) attended++
  }
  return {
    total: regs.length,
    paid,
    pending,
    attended,
    collected,
    toCollect,
    spotsLeft: event.capacity ? Math.max(0, event.capacity - regs.length) : null,
  }
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export type RegistrationFilter = 'TODOS' | 'PAGOS' | 'PENDENTES' | 'PRESENTES' | 'AUSENTES'

export function filterRegistrations(
  regs: EventRegistration[],
  search: string,
  filter: RegistrationFilter = 'TODOS',
): EventRegistration[] {
  const q = normalize(search.trim())
  const digits = q.replace(/\D/g, '')
  return regs
    .filter((r) => {
      if (filter === 'PAGOS' && !r.paid) return false
      if (filter === 'PENDENTES' && r.paid) return false
      if (filter === 'PRESENTES' && !r.attended) return false
      if (filter === 'AUSENTES' && r.attended) return false
      if (!q) return true
      if (normalize(r.name).includes(q)) return true
      return !!digits && (r.phone || '').replace(/\D/g, '').includes(digits)
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** "20 a 22 de nov." ou "20 de nov. · 19:30" para cartões e cabeçalhos. */
export function eventDateLabel(
  event: Pick<ChurchEvent, 'starts_on' | 'ends_on' | 'start_time'>,
): string {
  const months = [
    'jan.',
    'fev.',
    'mar.',
    'abr.',
    'mai.',
    'jun.',
    'jul.',
    'ago.',
    'set.',
    'out.',
    'nov.',
    'dez.',
  ]
  const s = toCalendarYMD(event.starts_on)
  if (!s) return ''
  const [, sm, sd] = s.split('-').map(Number)
  const e = toCalendarYMD(event.ends_on)
  let label = `${sd} de ${months[sm - 1]}`
  if (e && e !== s) {
    const [, em, ed] = e.split('-').map(Number)
    label =
      em === sm
        ? `${sd} a ${ed} de ${months[sm - 1]}`
        : `${sd} de ${months[sm - 1]} a ${ed} de ${months[em - 1]}`
  }
  return event.start_time ? `${label} · ${event.start_time}` : label
}
