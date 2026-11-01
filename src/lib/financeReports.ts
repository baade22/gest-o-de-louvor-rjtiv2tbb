// Relatórios do Financeiro feitos no navegador a partir dos lançamentos.
// Períodos sempre em dias de calendário (YYYY-MM-DD, de e até inclusive).
// Lançamentos estornados nunca entram.

import type {
  FinAccount,
  FinBill,
  FinCategory,
  FinPaymentMethod,
  FinTransaction,
  Person,
} from '@/types/finance'

type Tx = Pick<FinTransaction, 'type' | 'date' | 'amount_cents' | 'account_id' | 'status'> &
  Partial<
    Pick<
      FinTransaction,
      | 'id'
      | 'to_account_id'
      | 'category_id'
      | 'person_id'
      | 'is_anonymous'
      | 'payment_method'
      | 'event_id'
      | 'description'
    >
  >
type Account = Pick<FinAccount, 'id' | 'name' | 'opening_balance_cents'> &
  Partial<Pick<FinAccount, 'kind' | 'congregation' | 'accounting_code' | 'is_active'>>
type Category = Pick<FinCategory, 'id' | 'name' | 'direction'> &
  Partial<Pick<FinCategory, 'is_contribution' | 'accounting_code'>>

const day = (date: string) => (date || '').slice(0, 10)
const valid = (tx: Tx) => tx.status !== 'ESTORNADO'
export const inPeriod = (tx: { date: string }, from: string, to: string) =>
  day(tx.date) >= from && day(tx.date) <= to

/** Só os lançamentos que mexem nas contas escolhidas (null = todas). */
function touches(tx: Tx, accounts: Set<string> | null) {
  if (!accounts) return true
  return accounts.has(tx.account_id) || (!!tx.to_account_id && accounts.has(tx.to_account_id))
}

export interface ReportRow {
  key: string
  label: string
  cents: number
  /** Percentual dentro do grupo (0 a 100). */
  pct: number
  count: number
}

function rowsFrom(map: Map<string, { label: string; cents: number; count: number }>) {
  const total = [...map.values()].reduce((s, r) => s + r.cents, 0)
  return [...map.entries()]
    .map(([key, r]) => ({ key, ...r, pct: total ? (r.cents / total) * 100 : 0 }))
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label))
}

function bump(
  map: Map<string, { label: string; cents: number; count: number }>,
  key: string,
  label: string,
  cents: number,
) {
  const row = map.get(key) || { label, cents: 0, count: 0 }
  row.cents += cents
  row.count += 1
  map.set(key, row)
}

// ---- DRE ----

export interface DreReport {
  income: ReportRow[]
  expense: ReportRow[]
  totalIncome: number
  totalExpense: number
  result: number
}

/** Demonstração do resultado: entradas e saídas por categoria no período. */
export function dreReport(
  txs: Tx[],
  categories: Category[],
  from: string,
  to: string,
  accounts: Set<string> | null = null,
): DreReport {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const income = new Map<string, { label: string; cents: number; count: number }>()
  const expense = new Map<string, { label: string; cents: number; count: number }>()
  for (const tx of txs) {
    if (!valid(tx) || tx.type === 'TRANSFERENCIA' || !inPeriod(tx, from, to)) continue
    if (accounts && !accounts.has(tx.account_id)) continue
    const key = tx.category_id || ''
    const label = (key && names.get(key)) || 'Sem categoria'
    bump(tx.type === 'ENTRADA' ? income : expense, key, label, tx.amount_cents)
  }
  const inc = rowsFrom(income)
  const exp = rowsFrom(expense)
  const totalIncome = inc.reduce((s, r) => s + r.cents, 0)
  const totalExpense = exp.reduce((s, r) => s + r.cents, 0)
  return {
    income: inc,
    expense: exp,
    totalIncome,
    totalExpense,
    result: totalIncome - totalExpense,
  }
}

// ---- Contribuições ----

export interface ContributionsReport {
  total: number
  nominal: number
  anonymous: number
  contributors: number
  byPerson: ReportRow[]
  byCategory: ReportRow[]
  byMethod: ReportRow[]
}

const METHOD_LABELS: Record<FinPaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Transferência',
  BOLETO: 'Boleto',
  CHEQUE: 'Cheque',
  OUTRO: 'Outro',
}

/** Entradas em categorias de contribuição (dízimo, ofertas...), por pessoa, tipo e forma. */
export function contributionsReport(
  txs: Tx[],
  categories: Category[],
  people: Pick<Person, 'id' | 'name'>[],
  from: string,
  to: string,
  accounts: Set<string> | null = null,
): ContributionsReport {
  const contribution = new Map(
    categories.filter((c) => c.is_contribution).map((c) => [c.id, c.name]),
  )
  const names = new Map(people.map((p) => [p.id, p.name]))
  const byPerson = new Map<string, { label: string; cents: number; count: number }>()
  const byCategory = new Map<string, { label: string; cents: number; count: number }>()
  const byMethod = new Map<string, { label: string; cents: number; count: number }>()
  let nominal = 0
  let anonymous = 0
  for (const tx of txs) {
    if (!valid(tx) || tx.type !== 'ENTRADA' || !inPeriod(tx, from, to)) continue
    if (!tx.category_id || !contribution.has(tx.category_id)) continue
    if (accounts && !accounts.has(tx.account_id)) continue
    const named = !!tx.person_id && !tx.is_anonymous
    if (named) {
      nominal += tx.amount_cents
      bump(byPerson, tx.person_id!, names.get(tx.person_id!) || 'Pessoa', tx.amount_cents)
    } else anonymous += tx.amount_cents
    bump(byCategory, tx.category_id, contribution.get(tx.category_id)!, tx.amount_cents)
    const method = tx.payment_method || ''
    bump(byMethod, method, method ? METHOD_LABELS[method] : 'Não informada', tx.amount_cents)
  }
  return {
    total: nominal + anonymous,
    nominal,
    anonymous,
    contributors: byPerson.size,
    byPerson: rowsFrom(byPerson),
    byCategory: rowsFrom(byCategory),
    byMethod: rowsFrom(byMethod),
  }
}

// ---- Declaração de faturamento ----

export interface RevenueMonth {
  /** AAAA-MM */
  month: string
  contributions: number
  other: number
  total: number
}

export interface RevenueReport {
  months: RevenueMonth[]
  contributions: number
  other: number
  total: number
  /** Média por mês do período */
  average: number
}

/**
 * Receita mês a mês (todas as entradas, sem transferências entre contas), separando as
 * contribuições (dízimos e ofertas) das outras receitas. Meses sem entrada aparecem zerados.
 */
export function revenueReport(
  txs: Tx[],
  categories: Category[],
  from: string,
  to: string,
  accounts: Set<string> | null = null,
): RevenueReport {
  const contribution = new Set(categories.filter((c) => c.is_contribution).map((c) => c.id))
  const months: RevenueMonth[] = []
  const index = new Map<string, RevenueMonth>()
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const last = to.slice(0, 7)
  for (let i = 0; i < 240; i++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    if (ym > last) break
    const row = { month: ym, contributions: 0, other: 0, total: 0 }
    months.push(row)
    index.set(ym, row)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  for (const tx of txs) {
    if (!valid(tx) || tx.type !== 'ENTRADA' || !inPeriod(tx, from, to)) continue
    if (accounts && !accounts.has(tx.account_id)) continue
    const row = index.get(day(tx.date).slice(0, 7))
    if (!row) continue
    if (tx.category_id && contribution.has(tx.category_id)) row.contributions += tx.amount_cents
    else row.other += tx.amount_cents
    row.total += tx.amount_cents
  }
  const sum = (k: 'contributions' | 'other' | 'total') => months.reduce((s, r) => s + r[k], 0)
  const total = sum('total')
  return {
    months,
    contributions: sum('contributions'),
    other: sum('other'),
    total,
    average: months.length ? Math.round(total / months.length) : 0,
  }
}

// ---- Balancete e disponibilidades ----

export interface AccountMovement {
  id: string
  name: string
  kind?: string
  congregation?: string
  opening: number
  income: number
  expense: number
  transfersIn: number
  transfersOut: number
  closing: number
}

/** Saldo inicial, entradas, saídas, transferências e saldo final de cada conta no período. */
export function accountMovements(
  accounts: Account[],
  txs: Tx[],
  from: string,
  to: string,
): AccountMovement[] {
  const rows = new Map<string, AccountMovement>()
  for (const a of accounts) {
    const base = a.opening_balance_cents || 0
    rows.set(a.id, {
      id: a.id,
      name: a.name,
      kind: a.kind,
      congregation: a.congregation || '',
      opening: base,
      income: 0,
      expense: 0,
      transfersIn: 0,
      transfersOut: 0,
      closing: base,
    })
  }
  for (const tx of txs) {
    if (!valid(tx)) continue
    const d = day(tx.date)
    if (d > to) continue
    const before = d < from
    const add = (id: string | undefined, cents: number, field: keyof AccountMovement) => {
      const row = id ? rows.get(id) : undefined
      if (!row) return
      if (before) row.opening += cents
      else (row[field] as number) += Math.abs(cents)
      row.closing += cents
    }
    if (tx.type === 'TRANSFERENCIA') {
      add(tx.account_id, -tx.amount_cents, 'transfersOut')
      add(tx.to_account_id, tx.amount_cents, 'transfersIn')
    } else if (tx.type === 'SAIDA') add(tx.account_id, -tx.amount_cents, 'expense')
    else add(tx.account_id, tx.amount_cents, 'income')
  }
  return [...rows.values()]
}

/** Saldo de cada conta no fim de um dia, agrupado por congregação. */
export function availabilityReport(accounts: Account[], txs: Tx[], date: string) {
  const rows = accountMovements(accounts, txs, date, date)
    .filter((r) => r.closing !== 0 || accounts.find((a) => a.id === r.id)?.is_active !== false)
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      congregation: r.congregation,
      cents: r.closing,
    }))
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const g = r.congregation || 'Igreja toda'
    groups.set(g, [...(groups.get(g) || []), r])
  }
  return {
    groups: [...groups.entries()]
      .sort(([a], [b]) => (a === 'Igreja toda' ? -1 : b === 'Igreja toda' ? 1 : a.localeCompare(b)))
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
        total: items.reduce((s, r) => s + r.cents, 0),
      })),
    total: rows.reduce((s, r) => s + r.cents, 0),
  }
}

// ---- Razão por categoria ----

export interface LedgerRow {
  id?: string
  date: string
  description: string
  cents: number
  running: number
}

/** Todos os lançamentos de uma categoria no período, com o acumulado. */
export function categoryLedger(
  txs: Tx[],
  categoryId: string,
  from: string,
  to: string,
  accounts: Set<string> | null = null,
): { rows: LedgerRow[]; total: number } {
  let running = 0
  const rows = txs
    .filter(
      (tx) =>
        valid(tx) &&
        tx.type !== 'TRANSFERENCIA' &&
        tx.category_id === categoryId &&
        inPeriod(tx, from, to) &&
        touches(tx, accounts),
    )
    .sort((a, b) => (day(a.date) < day(b.date) ? -1 : day(a.date) > day(b.date) ? 1 : 0))
    .map((tx) => {
      running += tx.amount_cents
      return {
        id: tx.id,
        date: day(tx.date),
        description: tx.description || '',
        cents: tx.amount_cents,
        running,
      }
    })
  return { rows, total: running }
}

// ---- Contas pagas e recebidas ----

export function billsReport(bills: FinBill[], from: string, to: string) {
  const paid = bills
    .filter((b) => b.status === 'PAGO' && b.paid_at && inPeriod({ date: b.paid_at }, from, to))
    .sort((a, b) => day(a.paid_at!).localeCompare(day(b.paid_at!)))
  const open = bills
    .filter((b) => b.status === 'ABERTO' && day(b.due_date) <= to)
    .sort((a, b) => day(a.due_date).localeCompare(day(b.due_date)))
  const sum = (list: FinBill[], kind: FinBill['kind'], field: 'paid' | 'amount') =>
    list
      .filter((b) => b.kind === kind)
      .reduce(
        (s, b) => s + (field === 'paid' ? b.paid_amount_cents || b.amount_cents : b.amount_cents),
        0,
      )
  return {
    paid,
    open,
    paidOut: sum(paid, 'PAGAR', 'paid'),
    paidIn: sum(paid, 'RECEBER', 'paid'),
    openOut: sum(open, 'PAGAR', 'amount'),
    openIn: sum(open, 'RECEBER', 'amount'),
  }
}

// ---- Planilhas ----

const cell = (s: string, sep: string) =>
  s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s

export function toCsv(rows: (string | number)[][], sep = ';') {
  return '﻿' + rows.map((r) => r.map((v) => cell(String(v), sep)).join(sep)).join('\n')
}

export const centsToText = (cents: number, decimal: ',' | '.' = ',') =>
  (cents / 100).toFixed(2).replace('.', decimal)

export interface AccountingOptions {
  separator: ';' | ',' | '|' | '\t'
  dateFormat: 'DD/MM/AAAA' | 'AAAA-MM-DD'
  decimal: ',' | '.'
  header: boolean
}

/**
 * Arquivo para o contador: uma linha por lançamento com conta de débito e de crédito
 * (código contábil da conta e da categoria; sem código, vai o nome).
 * Entrada: débito na conta, crédito na categoria. Saída: o contrário.
 * Transferência: débito na conta de destino, crédito na de origem.
 */
export function accountingExport(
  txs: Tx[],
  accounts: Account[],
  categories: Category[],
  from: string,
  to: string,
  opts: AccountingOptions,
) {
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const catById = new Map(categories.map((c) => [c.id, c]))
  const missing = new Set<string>()
  const accCode = (id?: string) => {
    const a = id ? accById.get(id) : undefined
    if (!a) return ''
    if (!a.accounting_code) missing.add(`Conta: ${a.name}`)
    return a.accounting_code || a.name
  }
  const catCode = (id?: string) => {
    const c = id ? catById.get(id) : undefined
    if (!c) {
      missing.add('Lançamentos sem categoria')
      return ''
    }
    if (!c.accounting_code) missing.add(`Categoria: ${c.name}`)
    return c.accounting_code || c.name
  }
  const fmt = (d: string) => {
    const [y, m, dd] = day(d).split('-')
    return opts.dateFormat === 'DD/MM/AAAA' ? `${dd}/${m}/${y}` : `${y}-${m}-${dd}`
  }
  const rows: (string | number)[][] = opts.header
    ? [['Data', 'Débito', 'Crédito', 'Valor', 'Histórico']]
    : []
  const list = txs
    .filter((tx) => valid(tx) && inPeriod(tx, from, to))
    .sort((a, b) => day(a.date).localeCompare(day(b.date)))
  for (const tx of list) {
    let debit = ''
    let credit = ''
    if (tx.type === 'TRANSFERENCIA') {
      debit = accCode(tx.to_account_id)
      credit = accCode(tx.account_id)
    } else if (tx.type === 'ENTRADA') {
      debit = accCode(tx.account_id)
      credit = catCode(tx.category_id)
    } else {
      debit = catCode(tx.category_id)
      credit = accCode(tx.account_id)
    }
    const history =
      tx.description ||
      (tx.type === 'TRANSFERENCIA'
        ? 'Transferência entre contas'
        : (tx.category_id && catById.get(tx.category_id)?.name) || '')
    rows.push([fmt(tx.date), debit, credit, centsToText(tx.amount_cents, opts.decimal), history])
  }
  return { csv: toCsv(rows, opts.separator), lines: list.length, missing: [...missing].sort() }
}
