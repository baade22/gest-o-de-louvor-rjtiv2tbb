// Contas do Financeiro feitas no navegador: saldos e totais a partir dos lançamentos.
// Lançamentos estornados nunca entram em saldo nem em total.

import type { FinAccount, FinCategory, FinDirection, FinTransaction } from '@/types/finance'

type TxLike = Pick<FinTransaction, 'type' | 'amount_cents' | 'account_id' | 'status' | 'date'> &
  Partial<Pick<FinTransaction, 'category_id' | 'is_anonymous'>>

const counts = (tx: TxLike) => tx.status !== 'ESTORNADO'
const signed = (tx: TxLike) => (tx.type === 'SAIDA' ? -tx.amount_cents : tx.amount_cents)

/** Saldo de cada conta = saldo inicial + entradas - saídas. */
export function accountBalances(
  accounts: Pick<FinAccount, 'id' | 'opening_balance_cents'>[],
  txs: TxLike[],
): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const a of accounts) balances[a.id] = a.opening_balance_cents || 0
  for (const tx of txs) {
    if (!counts(tx) || !(tx.account_id in balances)) continue
    balances[tx.account_id] += signed(tx)
  }
  return balances
}

/** "2026-10-12 12:00:00.000Z" → "2026-10" */
export const monthOf = (date: string) => (date || '').slice(0, 7)

/** Primeiro dia do mês e primeiro dia do mês seguinte, para filtros de período. */
export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { start: `${ym}-01`, end: `${next}-01` }
}

/** Mês anterior ou seguinte: shiftMonth("2026-01", -1) → "2025-12" */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export interface PeriodTotals {
  income: number
  expense: number
  result: number
  contributions: number
  anonymous: number
}

/** Totais de um conjunto de lançamentos (normalmente os de um mês). */
export function periodTotals(
  txs: TxLike[],
  categories: Pick<FinCategory, 'id' | 'is_contribution'>[] = [],
): PeriodTotals {
  const contributionIds = new Set(categories.filter((c) => c.is_contribution).map((c) => c.id))
  const totals: PeriodTotals = { income: 0, expense: 0, result: 0, contributions: 0, anonymous: 0 }
  for (const tx of txs) {
    if (!counts(tx)) continue
    if (tx.type === 'ENTRADA') {
      totals.income += tx.amount_cents
      if (tx.category_id && contributionIds.has(tx.category_id)) {
        totals.contributions += tx.amount_cents
        if (tx.is_anonymous) totals.anonymous += tx.amount_cents
      }
    } else {
      totals.expense += tx.amount_cents
    }
  }
  totals.result = totals.income - totals.expense
  return totals
}

/** Entradas e saídas mês a mês, do mais antigo ao mais novo. */
export function monthlySeries(
  txs: TxLike[],
  lastMonth: string,
  months: number,
): { month: string; income: number; expense: number }[] {
  const series = Array.from({ length: months }, (_, i) => ({
    month: shiftMonth(lastMonth, i - months + 1),
    income: 0,
    expense: 0,
  }))
  const byMonth = new Map(series.map((s) => [s.month, s]))
  for (const tx of txs) {
    const bucket = counts(tx) ? byMonth.get(monthOf(tx.date)) : undefined
    if (!bucket) continue
    if (tx.type === 'ENTRADA') bucket.income += tx.amount_cents
    else bucket.expense += tx.amount_cents
  }
  return series
}

/** Plano de contas sugerido para uma igreja que está começando. */
export const DEFAULT_CATEGORIES: {
  name: string
  direction: FinDirection
  is_contribution?: boolean
}[] = [
  { name: 'Dízimo', direction: 'ENTRADA', is_contribution: true },
  { name: 'Oferta', direction: 'ENTRADA', is_contribution: true },
  { name: 'Oferta de missões', direction: 'ENTRADA', is_contribution: true },
  { name: 'Campanha', direction: 'ENTRADA', is_contribution: true },
  { name: 'Eventos e inscrições', direction: 'ENTRADA' },
  { name: 'Outras entradas', direction: 'ENTRADA' },
  { name: 'Aluguel', direction: 'SAIDA' },
  { name: 'Energia', direction: 'SAIDA' },
  { name: 'Água', direction: 'SAIDA' },
  { name: 'Internet e telefone', direction: 'SAIDA' },
  { name: 'Manutenção e limpeza', direction: 'SAIDA' },
  { name: 'Material de escritório', direction: 'SAIDA' },
  { name: 'Ministérios', direction: 'SAIDA' },
  { name: 'Missões', direction: 'SAIDA' },
  { name: 'Ação social', direction: 'SAIDA' },
  { name: 'Prebenda pastoral', direction: 'SAIDA' },
  { name: 'Tarifas bancárias', direction: 'SAIDA' },
  { name: 'Outras saídas', direction: 'SAIDA' },
]
