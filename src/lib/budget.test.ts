import { describe, expect, it } from 'vitest'
import { budgetReport, withAdjustment, yearFraction } from './budget'

const cats = [
  { id: 'diz', name: 'Dízimo', direction: 'ENTRADA' as const },
  { id: 'alu', name: 'Aluguel', direction: 'SAIDA' as const },
  { id: 'ene', name: 'Energia', direction: 'SAIDA' as const },
  { id: 'man', name: 'Manutenção', direction: 'SAIDA' as const },
  { id: 'mis', name: 'Missões', direction: 'SAIDA' as const },
  { id: 'gra', name: 'Gráfica', direction: 'SAIDA' as const },
]
const accounts = [
  { id: 'a1', congregation: 'Aldeia' },
  { id: 'd1', congregation: 'Diamante' },
  { id: 'g', congregation: '' },
]
const tx = (type: string, cat: string, cents: number, extra: Record<string, unknown> = {}) =>
  ({
    type,
    category_id: cat,
    amount_cents: cents,
    account_id: 'a1',
    status: 'CONFIRMADO',
    date: '2026-05-10 12:00:00.000Z',
    ...extra,
  }) as any
const line = (category_id: string, amount_cents: number, congregation = '', year = 2026) => ({
  category_id,
  amount_cents,
  congregation,
  year,
})

describe('yearFraction', () => {
  it('parte do ano', () => {
    expect(yearFraction(2026, '2026-12-31')).toBe(1)
    expect(yearFraction(2026, '2026-01-01')).toBeCloseTo(1 / 365)
    expect(yearFraction(2025, '2026-03-01')).toBe(1)
    expect(yearFraction(2027, '2026-03-01')).toBe(0)
  })
})

describe('budgetReport', () => {
  // 01/07/2026: 182 dias de 365 ≈ 49,9%
  const today = '2026-07-01'
  const lines = [
    line('diz', 20000000),
    line('alu', 3000000),
    line('ene', 720000),
    line('man', 600000),
    line('mis', 1680000, 'Aldeia'),
  ]
  const txs = [
    tx('ENTRADA', 'diz', 8000000),
    tx('SAIDA', 'alu', 1500000),
    tx('SAIDA', 'ene', 450000),
    tx('SAIDA', 'man', 648000),
    tx('SAIDA', 'mis', 300000),
    tx('SAIDA', 'gra', 20000),
    tx('SAIDA', 'alu', 999999, { status: 'ESTORNADO' }),
    tx('SAIDA', 'alu', 50000, { date: '2025-05-10 12:00:00.000Z' }),
    tx('SAIDA', 'mis', 70000, { account_id: 'd1' }),
  ]
  const r = budgetReport(lines, cats, txs, accounts, { year: 2026, today, congregation: null })
  const row = (id: string) =>
    [...r.income.rows, ...r.expense.rows].find((x) => x.categoryId === id)!

  it('classifica cada categoria pelo ritmo do ano', () => {
    expect(row('alu').status).toBe('NO_RITMO')
    expect(row('ene').status).toBe('ACIMA')
    expect(Math.round(row('ene').pacePct)).toBe(25)
    expect(row('man').status).toBe('ESTOUROU')
    expect(row('mis').status).toBe('ABAIXO')
    expect(row('mis').realized).toBe(370000)
    expect(row('gra').status).toBe('SEM_PREVISAO')
    expect(row('diz').status).toBe('ABAIXO')
    expect(r.over.map((x) => x.categoryId).sort()).toEqual(['ene', 'man'])
  })

  it('soma previsto, realizado e resultado', () => {
    expect(r.income.planned).toBe(20000000)
    expect(r.expense.planned).toBe(6000000)
    expect(r.expense.realized).toBe(1500000 + 450000 + 648000 + 370000 + 20000)
    expect(r.resultPlanned).toBe(14000000)
    expect(r.resultRealized).toBe(8000000 - r.expense.realized)
    expect(r.hasPlan).toBe(true)
  })

  it('na congregação, só as linhas e as contas dela', () => {
    const a = budgetReport(lines, cats, txs, accounts, {
      year: 2026,
      today,
      congregation: 'Aldeia',
    })
    expect(a.expense.planned).toBe(1680000)
    expect(a.expense.rows.find((x) => x.categoryId === 'mis')!.realized).toBe(300000)
    const d = budgetReport(lines, cats, txs, accounts, {
      year: 2026,
      today,
      congregation: 'Diamante',
    })
    expect(d.hasPlan).toBe(false)
    expect(d.expense.realized).toBe(70000)
  })

  it('meta de entrada batida', () => {
    const x = budgetReport([line('diz', 100)], cats, [tx('ENTRADA', 'diz', 100)], accounts, {
      year: 2026,
      today,
      congregation: null,
    })
    expect(x.income.rows[0].status).toBe('META_BATIDA')
  })
})

describe('withAdjustment', () => {
  it('aplica o reajuste e arredonda para reais', () => {
    expect(withAdjustment(100000, 5)).toBe(105000)
    expect(withAdjustment(12345, 10)).toBe(13600)
    expect(withAdjustment(5000, -100)).toBe(0)
  })
})
