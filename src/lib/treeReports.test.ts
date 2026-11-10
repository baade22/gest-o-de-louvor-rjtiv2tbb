import { describe, expect, it } from 'vitest'
import { cashFlowReport, monthsBetween, treeTotals, type TreeTx } from './treeReports'

const cats = [
  { id: 'R', name: 'Receitas', direction: 'ENTRADA' as const, is_group: true },
  { id: 'C', name: 'Contribuições', direction: 'ENTRADA' as const, is_group: true, parent_id: 'R' },
  { id: 'd', name: 'Dízimos', direction: 'ENTRADA' as const, parent_id: 'C', short_code: '11' },
  { id: 'o', name: 'Ofertas', direction: 'ENTRADA' as const, parent_id: 'C' },
  { id: 'D', name: 'Despesas', direction: 'SAIDA' as const, is_group: true },
  { id: 'e', name: 'Energia', direction: 'SAIDA' as const, parent_id: 'D' },
]

const tx = (p: Partial<TreeTx>): TreeTx => ({
  id: Math.random().toString(36).slice(2),
  type: 'ENTRADA',
  date: '2026-01-10 12:00:00.000Z',
  amount_cents: 100,
  account_id: 'A',
  status: 'CONFIRMADO',
  ...p,
})

describe('monthsBetween', () => {
  it('lista os meses do período, virando o ano', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })
})

describe('treeTotals', () => {
  const txs = [
    tx({ category_id: 'd', amount_cents: 1000 }),
    tx({ category_id: 'o', amount_cents: 300, date: '2026-02-03' }),
    tx({ category_id: 'e', type: 'SAIDA', amount_cents: 400 }),
    tx({ type: 'SAIDA', amount_cents: 50 }),
    tx({ category_id: 'd', amount_cents: 999, status: 'ESTORNADO' }),
    tx({ type: 'TRANSFERENCIA', amount_cents: 777, to_account_id: 'B' }),
  ]
  const months = monthsBetween('2026-01-01', '2026-02-28')
  const run = (levels?: number) =>
    treeTotals(cats, txs, {
      from: '2026-01-01',
      to: '2026-02-28',
      columns: months.length,
      column: (t) => months.indexOf(t.date.slice(0, 7)),
      levels,
    })

  it('soma subindo pela árvore, mês a mês', () => {
    const r = run()
    expect(r.income.map((l) => [l.name, l.depth, l.values])).toEqual([
      ['Receitas', 0, [1000, 300]],
      ['Contribuições', 1, [1000, 300]],
      ['Dízimos', 2, [1000, 0]],
      ['Ofertas', 2, [0, 300]],
    ])
    expect(r.expense.map((l) => [l.name, l.total])).toEqual([
      ['Despesas', 400],
      ['Energia', 400],
      ['Sem categoria', 50],
    ])
    expect(r.incomeValues).toEqual([1000, 300])
    expect(r.expenseValues).toEqual([450, 0])
    expect(r.records).toBe(4)
  })

  it('agrupa no nível pedido e leva os lançamentos para a linha de cima', () => {
    const r = run(2)
    expect(r.income.map((l) => l.name)).toEqual(['Receitas', 'Contribuições'])
    expect(r.income[1].items).toHaveLength(2)
    expect(r.income[0].items).toHaveLength(0)
  })
})

describe('cashFlowReport', () => {
  const accounts = [
    { id: 'A', name: 'Banco', opening_balance_cents: 1000 },
    { id: 'B', name: 'Caixa', opening_balance_cents: 0, short_code: '7' },
  ]
  const names = {
    categories: new Map([['d', 'Dízimos']]),
    people: new Map([['p', 'Maria']]),
    suppliers: new Map<string, string>(),
  }
  const txs = [
    tx({ date: '2025-12-31', amount_cents: 500 }),
    tx({ category_id: 'd', person_id: 'p', amount_cents: 200 }),
    tx({ type: 'SAIDA', amount_cents: 80, date: '2026-01-12' }),
    tx({ type: 'TRANSFERENCIA', amount_cents: 300, to_account_id: 'B' }),
  ]

  it('mostra saldo inicial, movimento por dia e saldo final', () => {
    const r = cashFlowReport(accounts, txs, '2026-01-01', '2026-01-31', names)
    expect(r.opening.map((o) => [o.code, o.cents])).toEqual([
      ['0001', 1500],
      ['7', 0],
    ])
    expect(r.days.map((d) => [d.date, d.lines.length, d.subtotal])).toEqual([
      ['2026-01-10', 1, 200],
      ['2026-01-12', 1, -80],
    ])
    expect(r.days[0].lines[0].who).toBe('Maria')
    expect(r.closingTotal).toBe(r.openingTotal + 120)
  })

  it('transferência entre contas do relatório só aparece se pedir', () => {
    const r = cashFlowReport(accounts, txs, '2026-01-01', '2026-01-31', names, true)
    expect(r.days[0].lines.map((l) => l.cents)).toEqual([300, 200, -300])
    const one = cashFlowReport([accounts[0]], txs, '2026-01-01', '2026-01-31', names)
    expect(one.days[0].lines.map((l) => l.cents)).toEqual([200, -300])
  })
})

describe('saldos só com o conciliado', () => {
  const accounts = [{ id: 'A', name: 'Banco', opening_balance_cents: 1000 }]
  const names = {
    categories: new Map<string, string>(),
    people: new Map<string, string>(),
    suppliers: new Map<string, string>(),
  }
  const txs = [
    tx({ amount_cents: 500, bank_line_id: 'l1' }),
    tx({ type: 'SAIDA', amount_cents: 9000 }),
  ]
  const onlyLinked = (t: TreeTx) => !!t.bank_line_id

  it('deixa de fora o que não foi conciliado, no saldo e no movimento', () => {
    const all = cashFlowReport(accounts, txs, '2026-01-01', '2026-01-31', names)
    expect(all.closingTotal).toBe(1000 + 500 - 9000)
    const r = cashFlowReport(accounts, txs, '2026-01-01', '2026-01-31', names, false, onlyLinked)
    expect(r.closingTotal).toBe(1500)
    expect(r.records).toBe(1)
  })
})
