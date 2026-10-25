import { describe, expect, it } from 'vitest'
import {
  accountMovements,
  accountingExport,
  availabilityReport,
  billsReport,
  categoryLedger,
  contributionsReport,
  dreReport,
} from './financeReports'
import type { FinBill } from '@/types/finance'

const d = (ymd: string) => `${ymd} 12:00:00.000Z`
const accounts = [
  {
    id: 'cx',
    name: 'Caixa',
    opening_balance_cents: 1000,
    kind: 'CAIXA' as const,
    accounting_code: '1.1.1',
  },
  {
    id: 'bb',
    name: 'Banco',
    opening_balance_cents: 0,
    kind: 'BANCO' as const,
    congregation: 'Aldeia',
  },
]
const categories = [
  {
    id: 'diz',
    name: 'Dízimo',
    direction: 'ENTRADA' as const,
    is_contribution: true,
    accounting_code: '3.1',
  },
  { id: 'ofe', name: 'Oferta', direction: 'ENTRADA' as const, is_contribution: true },
  { id: 'ene', name: 'Energia', direction: 'SAIDA' as const, accounting_code: '4.2' },
]
const people = [{ id: 'p1', name: 'Maria' }]
const base = { status: 'CONFIRMADO' as const }
const txs = [
  {
    ...base,
    type: 'ENTRADA' as const,
    date: d('2026-08-30'),
    amount_cents: 500,
    account_id: 'cx',
    category_id: 'diz',
  },
  {
    ...base,
    type: 'ENTRADA' as const,
    date: d('2026-09-02'),
    amount_cents: 3000,
    account_id: 'bb',
    category_id: 'diz',
    person_id: 'p1',
    payment_method: 'PIX' as const,
  },
  {
    ...base,
    type: 'ENTRADA' as const,
    date: d('2026-09-05'),
    amount_cents: 1000,
    account_id: 'cx',
    category_id: 'ofe',
    is_anonymous: true,
    payment_method: 'DINHEIRO' as const,
  },
  {
    ...base,
    type: 'SAIDA' as const,
    date: d('2026-09-10'),
    amount_cents: 700,
    account_id: 'bb',
    category_id: 'ene',
    description: 'Enel',
  },
  {
    ...base,
    type: 'TRANSFERENCIA' as const,
    date: d('2026-09-15'),
    amount_cents: 800,
    account_id: 'cx',
    to_account_id: 'bb',
  },
  {
    status: 'ESTORNADO' as const,
    type: 'SAIDA' as const,
    date: d('2026-09-20'),
    amount_cents: 9999,
    account_id: 'bb',
    category_id: 'ene',
  },
  {
    ...base,
    type: 'SAIDA' as const,
    date: d('2026-10-01'),
    amount_cents: 100,
    account_id: 'cx',
    category_id: 'ene',
  },
]

describe('dreReport', () => {
  it('soma por categoria no período, sem transferência nem estorno', () => {
    const r = dreReport(txs, categories, '2026-09-01', '2026-09-30')
    expect(r.totalIncome).toBe(4000)
    expect(r.totalExpense).toBe(700)
    expect(r.result).toBe(3300)
    expect(r.income.map((x) => [x.label, x.cents, Math.round(x.pct)])).toEqual([
      ['Dízimo', 3000, 75],
      ['Oferta', 1000, 25],
    ])
  })
  it('filtra pelas contas da congregação', () => {
    const r = dreReport(txs, categories, '2026-09-01', '2026-09-30', new Set(['bb']))
    expect(r.totalIncome).toBe(3000)
  })
})

describe('contributionsReport', () => {
  it('separa nominal e anônimo, por pessoa e por forma', () => {
    const r = contributionsReport(txs, categories, people, '2026-09-01', '2026-09-30')
    expect(r).toMatchObject({ total: 4000, nominal: 3000, anonymous: 1000, contributors: 1 })
    expect(r.byPerson[0]).toMatchObject({ label: 'Maria', cents: 3000, count: 1 })
    expect(r.byMethod.map((m) => m.label)).toEqual(['PIX', 'Dinheiro'])
  })
})

describe('accountMovements', () => {
  it('saldo inicial do período inclui o que veio antes', () => {
    const rows = accountMovements(accounts, txs, '2026-09-01', '2026-09-30')
    expect(rows.find((r) => r.id === 'cx')).toMatchObject({
      opening: 1500,
      income: 1000,
      expense: 0,
      transfersOut: 800,
      closing: 1700,
    })
    expect(rows.find((r) => r.id === 'bb')).toMatchObject({
      opening: 0,
      income: 3000,
      expense: 700,
      transfersIn: 800,
      closing: 3100,
    })
  })
})

describe('availabilityReport', () => {
  it('agrupa por congregação, igreja toda primeiro', () => {
    const r = availabilityReport(accounts, txs, '2026-09-30')
    expect(r.groups.map((g) => [g.label, g.total])).toEqual([
      ['Igreja toda', 1700],
      ['Aldeia', 3100],
    ])
    expect(r.total).toBe(4800)
  })
})

describe('categoryLedger', () => {
  it('lista com acumulado', () => {
    const r = categoryLedger(txs, 'diz', '2026-08-01', '2026-09-30')
    expect(r.rows.map((x) => x.running)).toEqual([500, 3500])
    expect(r.total).toBe(3500)
  })
})

describe('billsReport', () => {
  it('pagas no período e em aberto vencidas até o fim', () => {
    const bills = [
      {
        id: 'a',
        kind: 'PAGAR',
        status: 'PAGO',
        amount_cents: 100,
        paid_amount_cents: 110,
        paid_at: d('2026-09-03'),
        due_date: d('2026-09-01'),
      },
      { id: 'b', kind: 'PAGAR', status: 'ABERTO', amount_cents: 50, due_date: d('2026-09-20') },
      { id: 'c', kind: 'RECEBER', status: 'ABERTO', amount_cents: 70, due_date: d('2026-11-20') },
    ] as FinBill[]
    const r = billsReport(bills, '2026-09-01', '2026-09-30')
    expect(r.paidOut).toBe(110)
    expect(r.open.map((b) => b.id)).toEqual(['b'])
  })
})

describe('accountingExport', () => {
  it('débito e crédito com códigos, avisa os que faltam', () => {
    const r = accountingExport(txs, accounts, categories, '2026-09-01', '2026-09-30', {
      separator: ';',
      dateFormat: 'DD/MM/AAAA',
      decimal: ',',
      header: true,
    })
    const lines = r.csv.replace('﻿', '').split('\n')
    expect(lines[0]).toBe('Data;Débito;Crédito;Valor;Histórico')
    expect(lines[1]).toBe('02/09/2026;Banco;3.1;30,00;Dízimo')
    expect(lines[3]).toBe('10/09/2026;4.2;Banco;7,00;Enel')
    expect(lines[4]).toBe('15/09/2026;Banco;1.1.1;8,00;Transferência entre contas')
    expect(r.lines).toBe(4)
    expect(r.missing).toEqual(['Categoria: Oferta', 'Conta: Banco'])
  })
})
