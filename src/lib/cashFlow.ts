// Fluxo de caixa: saldo realizado até hoje e projetado para as próximas semanas.
// Projeção = lançamentos com data futura + contas a pagar e receber em aberto
// (as vencidas entram amanhã) + a média semanal de contribuições, todo domingo.
// Contas de aplicação não entram no saldo; transferência para elas conta como saída.

import type { FinAccount, FinBill, FinCategory, FinTransaction } from '@/types/finance'

type Account = Pick<FinAccount, 'id' | 'name' | 'opening_balance_cents'> &
  Partial<Pick<FinAccount, 'kind' | 'congregation' | 'min_balance_cents' | 'is_active'>>
type Tx = Pick<FinTransaction, 'type' | 'date' | 'amount_cents' | 'account_id' | 'status'> &
  Partial<Pick<FinTransaction, 'id' | 'to_account_id' | 'category_id' | 'description'>>
type Bill = Pick<FinBill, 'kind' | 'status' | 'amount_cents' | 'due_date'> &
  Partial<Pick<FinBill, 'id' | 'account_id' | 'description'>>
type Category = Pick<FinCategory, 'id'> & Partial<Pick<FinCategory, 'is_contribution' | 'name'>>

export type FlowSource = 'LANCAMENTO' | 'AGENDADO' | 'CONTA' | 'VENCIDA' | 'MEDIA'

export interface FlowItem {
  date: string
  label: string
  /** Positivo entra, negativo sai. */
  cents: number
  group: string
  source: FlowSource
  id?: string
}

export interface FlowPoint {
  date: string
  realized: number | null
  projected: number | null
}

export interface FlowWeek {
  start: string
  end: string
  kind: 'REALIZADO' | 'ATUAL' | 'PROJETADO'
  income: number
  expense: number
  closing: number
  /** Grupos (congregações) que ficam abaixo do mínimo em algum dia da semana. */
  below: string[]
  items: FlowItem[]
}

export interface FlowAlert {
  group: string
  date: string
  balance: number
  min: number
}

export interface CashFlow {
  today: string
  balanceToday: number
  min: number
  points: FlowPoint[]
  weeks: FlowWeek[]
  projectedIn: number
  projectedOut: number
  billsIn: number
  billsOutCount: number
  averageWeekly: number
  averageWeeks: number
  endBalance: number
  worst: { date: string; balance: number }
  alerts: FlowAlert[]
}

/** Nome do grupo de uma conta sem congregação. */
export const WHOLE_CHURCH = 'Igreja toda'

const day = (d: string) => (d || '').slice(0, 10)
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
export function addDays(ymd: string, n: number) {
  return new Date(toUtc(ymd) + n * 86400000).toISOString().slice(0, 10)
}
/** Segunda-feira da semana da data. */
export function weekStart(ymd: string) {
  const dow = new Date(toUtc(ymd)).getUTCDay()
  return addDays(ymd, -((dow + 6) % 7))
}

export interface CashFlowOptions {
  today: string
  /** Dias projetados à frente. */
  days: number
  /** Dias realizados mostrados para trás. */
  pastDays: number
  /** Congregação escolhida (null = todas). */
  congregation: string | null
  /** Somar a média de dízimos e ofertas das últimas semanas. */
  useAverage: boolean
}

export function cashFlow(
  accounts: Account[],
  txs: Tx[],
  bills: Bill[],
  categories: Category[],
  opts: CashFlowOptions,
): CashFlow {
  const { today } = opts
  const end = addDays(today, opts.days)
  const scoped = accounts.filter(
    (a) =>
      a.kind !== 'APLICACAO' &&
      (opts.congregation === null || (a.congregation || '') === opts.congregation),
  )
  const groupOf = new Map(scoped.map((a) => [a.id, a.congregation || WHOLE_CHURCH]))
  const groups = [...new Set(groupOf.values())]
  if (opts.congregation === null && !groups.includes(WHOLE_CHURCH)) groups.push(WHOLE_CHURCH)
  const mins = new Map<string, number>(groups.map((g) => [g, 0]))
  for (const a of scoped) {
    const g = groupOf.get(a.id)!
    mins.set(g, (mins.get(g) || 0) + Math.max(0, a.min_balance_cents || 0))
  }
  const accountName = new Map(accounts.map((a) => [a.id, a.name]))
  const contribution = new Set(categories.filter((c) => c.is_contribution).map((c) => c.id))
  const categoryName = new Map(categories.map((c) => [c.id, c.name || '']))

  // Saldo inicial de cada grupo e os movimentos (passados e futuros).
  const opening = new Map<string, number>(groups.map((g) => [g, 0]))
  for (const a of scoped) {
    const g = groupOf.get(a.id)!
    opening.set(g, (opening.get(g) || 0) + (a.opening_balance_cents || 0))
  }
  const items: FlowItem[] = []
  const contributions = new Set<FlowItem>()
  const push = (
    date: string,
    accountId: string | undefined,
    cents: number,
    label: string,
    tx: Tx,
  ) => {
    const g = accountId ? groupOf.get(accountId) : undefined
    if (!g) return
    const d = day(date)
    const item: FlowItem = {
      date: d,
      label,
      cents,
      group: g,
      source: d > today ? 'AGENDADO' : 'LANCAMENTO',
      id: tx.id,
    }
    items.push(item)
    if (tx.type === 'ENTRADA' && tx.category_id && contribution.has(tx.category_id))
      contributions.add(item)
  }
  for (const tx of txs) {
    if (tx.status === 'ESTORNADO') continue
    const label =
      tx.description ||
      (tx.category_id && categoryName.get(tx.category_id)) ||
      (tx.type === 'TRANSFERENCIA' ? 'Transferência' : '')
    if (tx.type === 'TRANSFERENCIA') {
      const to = tx.to_account_id ? accountName.get(tx.to_account_id) : ''
      const from = accountName.get(tx.account_id) || ''
      // Entre contas do mesmo grupo não muda o saldo do grupo.
      const gFrom = groupOf.get(tx.account_id)
      const gTo = tx.to_account_id ? groupOf.get(tx.to_account_id) : undefined
      if (gFrom && gFrom === gTo) continue
      push(tx.date, tx.account_id, -tx.amount_cents, `${label} para ${to}`.trim(), tx)
      push(tx.date, tx.to_account_id, tx.amount_cents, `${label} de ${from}`.trim(), tx)
    } else {
      push(
        tx.date,
        tx.account_id,
        tx.type === 'SAIDA' ? -tx.amount_cents : tx.amount_cents,
        label,
        tx,
      )
    }
  }
  const tomorrow = addDays(today, 1)
  for (const b of bills) {
    if (b.status !== 'ABERTO') continue
    let g: string | undefined
    if (b.account_id) g = groupOf.get(b.account_id)
    else if (opts.congregation === null) g = WHOLE_CHURCH
    if (!g) continue
    const due = day(b.due_date)
    if (due > end) continue
    const overdue = due <= today
    items.push({
      date: overdue ? tomorrow : due,
      label: b.description || (b.kind === 'PAGAR' ? 'Conta a pagar' : 'Conta a receber'),
      cents: b.kind === 'PAGAR' ? -b.amount_cents : b.amount_cents,
      group: g,
      source: overdue ? 'VENCIDA' : 'CONTA',
      id: b.id,
    })
  }

  // Média semanal de contribuições: últimas 12 semanas completas (ou desde a primeira).
  const thisWeek = weekStart(today)
  const avgFrom = addDays(thisWeek, -84)
  const avgItems = [...contributions].filter((i) => i.date >= avgFrom && i.date < thisWeek)
  const first = avgItems.reduce((m, i) => (i.date < m ? i.date : m), thisWeek)
  const averageWeeks = avgItems.length
    ? Math.max(1, Math.min(12, Math.round((toUtc(thisWeek) - toUtc(weekStart(first))) / 604800000)))
    : 0
  const avgByGroup = new Map<string, number>()
  for (const i of avgItems) avgByGroup.set(i.group, (avgByGroup.get(i.group) || 0) + i.cents)
  let averageWeekly = 0
  if (opts.useAverage && averageWeeks) {
    for (const [g, total] of avgByGroup) {
      const weekly = Math.round(total / averageWeeks)
      averageWeekly += weekly
      // Todo domingo depois de hoje.
      for (let d = addDays(thisWeek, 6); d <= end; d = addDays(d, 7)) {
        if (d <= today) continue
        items.push({
          date: d,
          label: 'Média de dízimos e ofertas',
          cents: weekly,
          group: g,
          source: 'MEDIA',
        })
      }
    }
  }

  // Saldo dia a dia por grupo.
  const start = addDays(today, -opts.pastDays)
  const before = new Map(opening)
  const byDay = new Map<string, FlowItem[]>()
  for (const i of items) {
    if (i.date < start) before.set(i.group, (before.get(i.group) || 0) + i.cents)
    else if (i.date <= end) byDay.set(i.date, [...(byDay.get(i.date) || []), i])
  }
  const balance = new Map(before)
  const sum = () => [...balance.values()].reduce((s, v) => s + v, 0)
  const points: FlowPoint[] = []
  const daily = new Map<string, Map<string, number>>()
  let balanceToday = 0
  let worst = { date: today, balance: Infinity }
  const alerts = new Map<string, FlowAlert>()
  for (let d = start; d <= end; d = addDays(d, 1)) {
    for (const i of byDay.get(d) || []) balance.set(i.group, (balance.get(i.group) || 0) + i.cents)
    const total = sum()
    daily.set(d, new Map(balance))
    if (d === today) balanceToday = total
    points.push({
      date: d,
      realized: d <= today ? total : null,
      projected: d >= today ? total : null,
    })
    if (d > today) {
      if (total < worst.balance) worst = { date: d, balance: total }
      for (const [g, v] of balance) {
        const min = mins.get(g) || 0
        if (min > 0 && v < min && !alerts.has(g))
          alerts.set(g, { group: g, date: d, balance: v, min })
      }
    }
  }
  if (worst.balance === Infinity) worst = { date: today, balance: balanceToday }

  // Semana a semana.
  const weeks: FlowWeek[] = []
  for (let w = weekStart(start); w <= end; w = addDays(w, 7)) {
    const wEnd = addDays(w, 6)
    const from = w < start ? start : w
    const to = wEnd > end ? end : wEnd
    const list = items
      .filter((i) => i.date >= from && i.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.cents - b.cents)
    const below = new Set<string>()
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d <= today) continue
      for (const [g, v] of daily.get(d) || []) {
        const min = mins.get(g) || 0
        if (min > 0 && v < min) below.add(g)
      }
    }
    const last = daily.get(to)
    weeks.push({
      start: w,
      end: wEnd,
      kind: wEnd < today ? 'REALIZADO' : w > today ? 'PROJETADO' : 'ATUAL',
      income: list.filter((i) => i.cents > 0).reduce((s, i) => s + i.cents, 0),
      expense: -list.filter((i) => i.cents < 0).reduce((s, i) => s + i.cents, 0),
      closing: last ? [...last.values()].reduce((s, v) => s + v, 0) : 0,
      below: [...below].sort(),
      items: list,
    })
  }

  const future = items.filter((i) => i.date > today && i.date <= end)
  return {
    today,
    balanceToday,
    min: [...mins.values()].reduce((s, v) => s + v, 0),
    points,
    weeks,
    projectedIn: future.filter((i) => i.cents > 0).reduce((s, i) => s + i.cents, 0),
    projectedOut: -future.filter((i) => i.cents < 0).reduce((s, i) => s + i.cents, 0),
    billsIn: future
      .filter((i) => i.cents > 0 && (i.source === 'CONTA' || i.source === 'VENCIDA'))
      .reduce((s, i) => s + i.cents, 0),
    billsOutCount: future.filter(
      (i) => i.cents < 0 && (i.source === 'CONTA' || i.source === 'VENCIDA'),
    ).length,
    averageWeekly,
    averageWeeks,
    endBalance: points.length
      ? (points[points.length - 1].projected ?? balanceToday)
      : balanceToday,
    worst,
    alerts: [...alerts.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}
