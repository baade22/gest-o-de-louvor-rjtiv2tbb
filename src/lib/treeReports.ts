// Relatórios do Financeiro pela árvore do plano de contas (D.R.E. e Balancete) e o
// Fluxo de caixa, no formato dos relatórios do Eklesia.
// Períodos em dias de calendário (YYYY-MM-DD, de e até inclusive). Estornados nunca entram.

import type { FinAccount, FinCategory, FinTransaction } from '@/types/finance'
import { treeOrder } from './categoryTree'
import { accountMovements, type BalanceRule } from './financeReports'

export type TreeTx = Pick<
  FinTransaction,
  'id' | 'type' | 'date' | 'amount_cents' | 'account_id' | 'status'
> &
  Partial<
    Pick<
      FinTransaction,
      | 'to_account_id'
      | 'category_id'
      | 'person_id'
      | 'supplier_id'
      | 'description'
      | 'is_anonymous'
      | 'bank_line_id'
      | 'to_bank_line_id'
    >
  >

export type TreeCategory = Pick<FinCategory, 'id' | 'name' | 'direction'> &
  Partial<Pick<FinCategory, 'parent_id' | 'is_group' | 'short_code'>>

type Account = Pick<FinAccount, 'id' | 'name' | 'opening_balance_cents'> &
  Partial<Pick<FinAccount, 'kind' | 'congregation' | 'short_code' | 'is_active'>>

const day = (date: string) => (date || '').slice(0, 10)
const valid = (tx: TreeTx) => tx.status !== 'ESTORNADO'
const inPeriod = (tx: { date: string }, from: string, to: string) =>
  day(tx.date) >= from && day(tx.date) <= to

/** Meses (YYYY-MM) de um período, em ordem. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const end = to.slice(0, 7)
  for (let i = 0; i < 240; i++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    if (ym > end) break
    out.push(ym)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export interface TreeLine {
  id: string
  name: string
  code: string
  /** 0 = primeiro nível. */
  depth: number
  /** Linha que soma outras (grupo do plano de contas, ou nível agrupado). */
  isGroup: boolean
  direction: 'ENTRADA' | 'SAIDA'
  /** Um valor por coluna, sempre positivo (quem mostra decide o sinal). */
  values: number[]
  total: number
  count: number
  /** Lançamentos da linha (só nas que não têm filhos à mostra), em ordem de data. */
  items: TreeTx[]
}

export interface TreeTotals {
  income: TreeLine[]
  expense: TreeLine[]
  /** Soma das colunas das entradas e das saídas. */
  incomeValues: number[]
  expenseValues: number[]
  /** Quantos lançamentos entraram. */
  records: number
}

const NONE = '__none__'

/**
 * Soma entradas e saídas do período pela árvore de categorias.
 * `column` diz em qual coluna cada lançamento cai (-1 fica de fora).
 * `levels` mostra até esse nível (1 = só o primeiro); os de baixo somam no de cima.
 */
export function treeTotals(
  categories: TreeCategory[],
  txs: TreeTx[],
  opts: {
    from: string
    to: string
    columns: number
    column: (tx: TreeTx) => number
    accounts?: Set<string> | null
    levels?: number
  },
): TreeTotals {
  const { from, to, columns, column, accounts = null, levels = 99 } = opts
  const byId = new Map(categories.map((c) => [c.id, c]))
  const zero = () => new Array<number>(columns).fill(0)
  // Soma de cada nó (categoria, grupo ou "sem categoria" de cada lado)
  const sums = new Map<string, { values: number[]; count: number; items: TreeTx[] }>()
  const node = (id: string) => {
    let n = sums.get(id)
    if (!n) {
      n = { values: zero(), count: 0, items: [] }
      sums.set(id, n)
    }
    return n
  }
  const totals = { ENTRADA: zero(), SAIDA: zero() }
  let records = 0
  for (const tx of txs) {
    if (!valid(tx) || tx.type === 'TRANSFERENCIA' || !inPeriod(tx, from, to)) continue
    if (accounts && !accounts.has(tx.account_id)) continue
    const col = column(tx)
    if (col < 0 || col >= columns) continue
    const dir = tx.type === 'ENTRADA' ? 'ENTRADA' : 'SAIDA'
    records++
    totals[dir][col] += tx.amount_cents
    const cat = tx.category_id ? byId.get(tx.category_id) : undefined
    // Sobe a árvore somando em cada nível
    let id = cat && cat.direction === dir ? cat.id : `${NONE}${dir}`
    const seen = new Set<string>()
    while (id && !seen.has(id)) {
      seen.add(id)
      const n = node(id)
      n.values[col] += tx.amount_cents
      n.count++
      n.items.push(tx)
      id = byId.get(id)?.parent_id || ''
    }
  }

  const build = (dir: 'ENTRADA' | 'SAIDA'): TreeLine[] => {
    const ordered = treeOrder(categories.filter((c) => c.direction === dir))
    const hasKids = new Set(
      ordered.map((o) => o.row.parent_id).filter((p): p is string => !!p && byId.has(p)),
    )
    const lines: TreeLine[] = []
    for (const { row, depth } of ordered) {
      const n = sums.get(row.id)
      if (!n || depth >= levels) continue
      const showsKids = hasKids.has(row.id) && depth + 1 < levels
      lines.push({
        id: row.id,
        name: row.name,
        code: row.short_code || '',
        depth,
        isGroup: !!row.is_group || hasKids.has(row.id),
        direction: dir,
        values: n.values,
        total: n.values.reduce((s, v) => s + v, 0),
        count: n.count,
        items: showsKids ? [] : [...n.items].sort((a, b) => day(a.date).localeCompare(day(b.date))),
      })
    }
    const none = sums.get(`${NONE}${dir}`)
    if (none)
      lines.push({
        id: `${NONE}${dir}`,
        name: 'Sem categoria',
        code: '',
        depth: 0,
        isGroup: false,
        direction: dir,
        values: none.values,
        total: none.values.reduce((s, v) => s + v, 0),
        count: none.count,
        items: [...none.items].sort((a, b) => day(a.date).localeCompare(day(b.date))),
      })
    return lines
  }

  return {
    income: build('ENTRADA'),
    expense: build('SAIDA'),
    incomeValues: totals.ENTRADA,
    expenseValues: totals.SAIDA,
    records,
  }
}

// ---- Fluxo de caixa ----

export interface FlowLine {
  id: string
  date: string
  accountName: string
  /** Pessoa ou fornecedor. */
  who: string
  category: string
  description: string
  /** Entrada positiva, saída negativa. */
  cents: number
  transfer: boolean
}

export interface FlowDay {
  date: string
  lines: FlowLine[]
  /** Movimento do dia (entradas menos saídas). */
  subtotal: number
  /** Quanto havia somando as contas do relatório no fim do dia. */
  balance: number
}

export interface CashFlowReport {
  opening: { id: string; code: string; name: string; cents: number }[]
  closing: { id: string; code: string; name: string; cents: number }[]
  openingTotal: number
  closingTotal: number
  days: FlowDay[]
  income: number
  expense: number
  records: number
}

/**
 * Saldo inicial das contas, movimento do período dia a dia (com subtotal) e saldo final.
 * Transferência entre duas contas do relatório não muda o total: só aparece com
 * `transfers`; se só um lado está no relatório, entra sempre (é dinheiro entrando ou saindo).
 */
export function cashFlowReport(
  accounts: Account[],
  txs: TreeTx[],
  from: string,
  to: string,
  names: {
    categories: Map<string, string>
    people: Map<string, string>
    suppliers: Map<string, string>
  },
  transfers = false,
  include?: BalanceRule,
): CashFlowReport {
  const scope = new Set(accounts.map((a) => a.id))
  const accName = new Map(accounts.map((a) => [a.id, a.name]))
  const moves = accountMovements(accounts, txs, from, to, include)
  const counts = (tx: TreeTx, accountId: string) => !include || include(tx, accountId)
  const code = (a: Account, i: number) => a.short_code || String(i + 1).padStart(4, '0')
  const list = accounts
    .map((a, i) => ({ a, i, m: moves.find((m) => m.id === a.id)! }))
    .filter(({ a, m }) => a.is_active !== false || m.opening || m.closing)
  const opening = list.map(({ a, i, m }) => ({
    id: a.id,
    code: code(a, i),
    name: a.name,
    cents: m.opening,
  }))
  const closing = list.map(({ a, i, m }) => ({
    id: a.id,
    code: code(a, i),
    name: a.name,
    cents: m.closing,
  }))

  const lines: FlowLine[] = []
  for (const tx of txs) {
    if (!valid(tx) || !inPeriod(tx, from, to)) continue
    const who =
      (tx.person_id && names.people.get(tx.person_id)) ||
      (tx.supplier_id && names.suppliers.get(tx.supplier_id)) ||
      (tx.is_anonymous ? 'Anônimo' : '')
    const base = {
      date: day(tx.date),
      who,
      category: (tx.category_id && names.categories.get(tx.category_id)) || '',
      description: tx.description || '',
    }
    if (tx.type === 'TRANSFERENCIA') {
      const outIn = scope.has(tx.account_id) && counts(tx, tx.account_id)
      const inIn = !!tx.to_account_id && scope.has(tx.to_account_id) && counts(tx, tx.to_account_id)
      if (outIn && inIn && !transfers) continue
      const label = `Transferência ${accName.get(tx.account_id) || ''} → ${
        accName.get(tx.to_account_id || '') || ''
      }`.trim()
      if (outIn)
        lines.push({
          ...base,
          id: `${tx.id}-out`,
          accountName: accName.get(tx.account_id) || '',
          category: label,
          cents: -tx.amount_cents,
          transfer: true,
        })
      if (inIn)
        lines.push({
          ...base,
          id: `${tx.id}-in`,
          accountName: accName.get(tx.to_account_id!) || '',
          category: label,
          cents: tx.amount_cents,
          transfer: true,
        })
      continue
    }
    if (!scope.has(tx.account_id) || !counts(tx, tx.account_id)) continue
    lines.push({
      ...base,
      id: tx.id,
      accountName: accName.get(tx.account_id) || '',
      cents: tx.type === 'SAIDA' ? -tx.amount_cents : tx.amount_cents,
      transfer: false,
    })
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents)
  const days: FlowDay[] = []
  for (const l of lines) {
    let d = days[days.length - 1]
    if (!d || d.date !== l.date) {
      d = { date: l.date, lines: [], subtotal: 0, balance: 0 }
      days.push(d)
    }
    d.lines.push(l)
    d.subtotal += l.cents
  }
  // Saldo do fim de cada dia: saldo inicial de todas as contas + o movimento até ali
  const openingTotal = moves.reduce((s, m) => s + m.opening, 0)
  let running = openingTotal
  for (const d of days) {
    running += d.subtotal
    d.balance = running
  }
  return {
    opening,
    closing,
    openingTotal: opening.reduce((s, r) => s + r.cents, 0),
    closingTotal: closing.reduce((s, r) => s + r.cents, 0),
    days,
    income: lines.filter((l) => l.cents > 0).reduce((s, l) => s + l.cents, 0),
    expense: -lines.filter((l) => l.cents < 0).reduce((s, l) => s + l.cents, 0),
    records: lines.length,
  }
}
