import { describe, it, expect } from 'vitest'
import { formatCents, parseMoneyToCents, centsToInput } from './money'
import {
  accountBalances,
  monthRange,
  monthlySeries,
  periodTotals,
  shiftMonth,
} from './financeSummary'

describe('dinheiro em centavos', () => {
  it('formata em reais', () => {
    expect(formatCents(123456)).toBe('R$ 1.234,56')
    expect(formatCents(5)).toBe('R$ 0,05')
    expect(centsToInput(108650)).toBe('1.086,50')
  })

  it('entende o que a pessoa digita', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123456)
    expect(parseMoneyToCents('1234,5')).toBe(123450)
    expect(parseMoneyToCents('1234.56')).toBe(123456)
    expect(parseMoneyToCents('R$ 10')).toBe(1000)
    expect(parseMoneyToCents('1.234')).toBe(123400)
    expect(parseMoneyToCents('1,234.50')).toBe(123450)
    expect(parseMoneyToCents('0,1')).toBe(10)
  })

  it('recusa valores que não são número', () => {
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('abc')).toBeNull()
    expect(parseMoneyToCents('1,2,3')).toBeNull()
  })
})

const tx = (over: Record<string, unknown>) => ({
  type: 'ENTRADA' as const,
  amount_cents: 1000,
  account_id: 'caixa',
  status: 'CONFIRMADO' as const,
  date: '2026-10-12 12:00:00.000Z',
  ...over,
})

describe('saldos e totais', () => {
  it('soma saldo inicial, entradas e saídas e ignora estornos', () => {
    const balances = accountBalances(
      [
        { id: 'caixa', opening_balance_cents: 5000 },
        { id: 'banco', opening_balance_cents: 0 },
      ],
      [
        tx({ amount_cents: 2000 }),
        tx({ type: 'SAIDA', amount_cents: 700 }),
        tx({ amount_cents: 99999, status: 'ESTORNADO' }),
        tx({ account_id: 'banco', amount_cents: 300 }),
        tx({ account_id: 'outra-igreja', amount_cents: 300 }),
      ],
    )
    expect(balances).toEqual({ caixa: 6300, banco: 300 })
  })

  it('separa contribuições e anônimos', () => {
    const totals = periodTotals(
      [
        tx({ amount_cents: 1000, category_id: 'dizimo' }),
        tx({ amount_cents: 500, category_id: 'dizimo', is_anonymous: true }),
        tx({ amount_cents: 200, category_id: 'aluguel-sala' }),
        tx({ type: 'SAIDA', amount_cents: 300, category_id: 'energia' }),
        tx({ amount_cents: 700, category_id: 'dizimo', status: 'ESTORNADO' }),
      ],
      [
        { id: 'dizimo', is_contribution: true },
        { id: 'aluguel-sala', is_contribution: false },
      ],
    )
    expect(totals).toEqual({
      income: 1700,
      expense: 300,
      result: 1400,
      contributions: 1500,
      anonymous: 500,
    })
  })

  it('anda pelos meses e monta o período', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })

  it('agrupa entradas e saídas por mês', () => {
    const series = monthlySeries(
      [
        tx({ date: '2026-09-30 12:00:00.000Z', amount_cents: 100 }),
        tx({ date: '2026-10-01 12:00:00.000Z', type: 'SAIDA', amount_cents: 40 }),
        tx({ date: '2026-03-01 12:00:00.000Z', amount_cents: 999 }),
      ],
      '2026-10',
      2,
    )
    expect(series).toEqual([
      { month: '2026-09', income: 100, expense: 0 },
      { month: '2026-10', income: 0, expense: 40 },
    ])
  })
})
