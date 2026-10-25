// Orçamento anual × realizado, por categoria.
// O previsto é anual; o "ritmo" compara o realizado com a parte do ano que já passou
// (até hoje no ano corrente, o ano todo num ano passado). Estornos nunca entram.

import type { FinAccount, FinBudget, FinCategory, FinTransaction } from '@/types/finance'

type Tx = Pick<FinTransaction, 'type' | 'date' | 'amount_cents' | 'account_id' | 'status'> &
  Partial<Pick<FinTransaction, 'category_id'>>
type Category = Pick<FinCategory, 'id' | 'name' | 'direction'>
type Account = Pick<FinAccount, 'id'> & Partial<Pick<FinAccount, 'congregation'>>
type Line = Pick<FinBudget, 'category_id' | 'amount_cents' | 'year'> &
  Partial<Pick<FinBudget, 'congregation'>>

export type BudgetStatus =
  | 'NO_RITMO'
  | 'ACIMA'
  | 'ESTOUROU'
  | 'ABAIXO'
  | 'SEM_PREVISAO'
  | 'META_BATIDA'

export interface BudgetRow {
  categoryId: string
  name: string
  planned: number
  realized: number
  /** O que já deveria ter sido realizado pelo ritmo do ano. */
  expected: number
  status: BudgetStatus
  /** Quanto o realizado passa do ritmo, em % (positivo = acima). */
  pacePct: number
}

export interface BudgetSide {
  rows: BudgetRow[]
  planned: number
  plannedToDate: number
  realized: number
}

export interface BudgetReport {
  /** Parte do ano que já passou, de 0 a 1. */
  fraction: number
  income: BudgetSide
  expense: BudgetSide
  /** Saídas acima do ritmo ou do previsto. */
  over: BudgetRow[]
  resultPlanned: number
  resultRealized: number
  hasPlan: boolean
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** Parte do ano que já passou em `today` (YYYY-MM-DD). */
export function yearFraction(year: number, today: string) {
  const ty = Number(today.slice(0, 4))
  if (ty > year) return 1
  if (ty < year) return 0
  const start = Date.UTC(year, 0, 1)
  const day = Date.parse(`${today.slice(0, 10)}T00:00:00Z`)
  return Math.min(1, ((day - start) / 86400000 + 1) / (isLeap(year) ? 366 : 365))
}

/** Lançamentos que contam na visão (null = igreja toda). */
function accountFilter(accounts: Account[], congregation: string | null) {
  if (congregation === null) return null
  return new Set(accounts.filter((a) => (a.congregation || '') === congregation).map((a) => a.id))
}

/** Realizado do ano por categoria. */
export function realizedByCategory(
  txs: Tx[],
  year: number,
  accounts: Account[],
  congregation: string | null,
) {
  const allowed = accountFilter(accounts, congregation)
  const out = new Map<string, number>()
  for (const tx of txs) {
    if (tx.status === 'ESTORNADO' || !tx.category_id) continue
    if (tx.type !== 'ENTRADA' && tx.type !== 'SAIDA') continue
    if (Number(tx.date.slice(0, 4)) !== year) continue
    if (allowed && !allowed.has(tx.account_id)) continue
    out.set(tx.category_id, (out.get(tx.category_id) || 0) + tx.amount_cents)
  }
  return out
}

/**
 * Previsto da visão: na igreja toda (null) soma todas as linhas do ano;
 * numa congregação, só as linhas dela.
 */
export function plannedByCategory(lines: Line[], year: number, congregation: string | null) {
  const out = new Map<string, number>()
  for (const l of lines) {
    if (l.year !== year) continue
    if (congregation !== null && (l.congregation || '') !== congregation) continue
    out.set(l.category_id, (out.get(l.category_id) || 0) + l.amount_cents)
  }
  return out
}

function statusOf(
  direction: 'ENTRADA' | 'SAIDA',
  planned: number,
  realized: number,
  expected: number,
) {
  if (!planned) return 'SEM_PREVISAO'
  if (direction === 'SAIDA') {
    if (realized > planned) return 'ESTOUROU'
    if (realized > expected * 1.1) return 'ACIMA'
    if (realized < expected * 0.85) return 'ABAIXO'
    return 'NO_RITMO'
  }
  if (realized >= planned) return 'META_BATIDA'
  if (realized < expected * 0.9) return 'ABAIXO'
  return 'NO_RITMO'
}

export function budgetReport(
  lines: Line[],
  categories: Category[],
  txs: Tx[],
  accounts: Account[],
  opts: { year: number; today: string; congregation: string | null },
): BudgetReport {
  const fraction = yearFraction(opts.year, opts.today)
  const planned = plannedByCategory(lines, opts.year, opts.congregation)
  const realized = realizedByCategory(txs, opts.year, accounts, opts.congregation)
  const side = (direction: 'ENTRADA' | 'SAIDA'): BudgetSide => {
    const rows: BudgetRow[] = []
    for (const c of categories) {
      if (c.direction !== direction) continue
      const p = planned.get(c.id) || 0
      const r = realized.get(c.id) || 0
      if (!p && !r) continue
      const expected = Math.round(p * fraction)
      rows.push({
        categoryId: c.id,
        name: c.name,
        planned: p,
        realized: r,
        expected,
        status: statusOf(direction, p, r, expected),
        pacePct: expected ? (r / expected - 1) * 100 : 0,
      })
    }
    rows.sort((a, b) => b.planned - a.planned || b.realized - a.realized)
    const sum = (f: (r: BudgetRow) => number) => rows.reduce((s, r) => s + f(r), 0)
    return {
      rows,
      planned: sum((r) => r.planned),
      plannedToDate: sum((r) => r.expected),
      realized: sum((r) => r.realized),
    }
  }
  const income = side('ENTRADA')
  const expense = side('SAIDA')
  return {
    fraction,
    income,
    expense,
    over: expense.rows.filter((r) => r.status === 'ACIMA' || r.status === 'ESTOUROU'),
    resultPlanned: income.planned - expense.planned,
    resultRealized: income.realized - expense.realized,
    hasPlan: income.planned + expense.planned > 0,
  }
}

/** Valor com reajuste, arredondado para reais inteiros. */
export const withAdjustment = (cents: number, pct: number) =>
  Math.max(0, Math.round((cents * (1 + pct / 100)) / 100) * 100)
