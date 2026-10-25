import { describe, expect, it } from 'vitest'
import { addDays, cashFlow, weekStart, WHOLE_CHURCH } from './cashFlow'

const d = (ymd: string) => `${ymd} 12:00:00.000Z`
const accounts = [
  { id: 'cx', name: 'Caixa', opening_balance_cents: 1000, kind: 'CAIXA' as const },
  {
    id: 'al',
    name: 'Banco Aldeia',
    opening_balance_cents: 5000,
    kind: 'BANCO' as const,
    congregation: 'Aldeia',
    min_balance_cents: 3000,
  },
  { id: 'ap', name: 'Aplicação', opening_balance_cents: 100000, kind: 'APLICACAO' as const },
]
const categories = [
  { id: 'diz', name: 'Dízimo', is_contribution: true },
  { id: 'alu', name: 'Aluguel', is_contribution: false },
]
const tx = (
  date: string,
  type: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA',
  cents: number,
  extra = {},
) => ({
  date: d(date),
  type,
  amount_cents: cents,
  status: 'CONFIRMADO' as const,
  account_id: 'al',
  ...extra,
})
const txs = [
  tx('2026-10-01', 'ENTRADA', 1200, { category_id: 'diz' }),
  tx('2026-10-12', 'ENTRADA', 600, { category_id: 'diz' }),
  tx('2026-10-20', 'SAIDA', 500, { category_id: 'alu' }),
  tx('2026-10-15', 'TRANSFERENCIA', 1000, { account_id: 'cx', to_account_id: 'ap' }),
  tx('2026-10-30', 'SAIDA', 200, { account_id: 'cx', description: 'Gás' }),
  tx('2026-10-14', 'SAIDA', 9999, { status: 'ESTORNADO' }),
]
const bill = (kind: 'PAGAR' | 'RECEBER', cents: number, due: string, extra = {}) => ({
  kind,
  amount_cents: cents,
  due_date: d(due),
  status: 'ABERTO' as const,
  account_id: 'al',
  ...extra,
})
const bills = [
  bill('PAGAR', 5000, '2026-11-02', { description: 'Parcela do som' }),
  bill('PAGAR', 100, '2026-10-01', { account_id: undefined, description: 'Energia' }),
  bill('RECEBER', 300, '2026-11-10'),
  bill('PAGAR', 700, '2026-10-25', { status: 'PAGO' as const }),
  bill('PAGAR', 700, '2027-01-25'),
]
const opts = { today: '2026-10-21', days: 30, pastDays: 30, congregation: null, useAverage: true }

describe('datas', () => {
  it('semana começa na segunda', () => {
    expect(weekStart('2026-10-21')).toBe('2026-10-19')
    expect(weekStart('2026-10-25')).toBe('2026-10-19')
    expect(weekStart('2026-10-26')).toBe('2026-10-26')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('cashFlow', () => {
  const f = cashFlow(accounts, txs, bills, categories, opts)

  it('saldo de hoje sem aplicação e sem estornado', () => {
    expect(f.balanceToday).toBe(6300)
  })

  it('média semanal de contribuições desde a primeira semana com dízimo', () => {
    expect(f.averageWeeks).toBe(3)
    expect(f.averageWeekly).toBe(600)
  })

  it('projeção com agendados, contas e média', () => {
    expect(f.projectedIn).toBe(2400 + 300)
    expect(f.projectedOut).toBe(100 + 200 + 5000)
    expect(f.billsIn).toBe(300)
    expect(f.billsOutCount).toBe(2)
    expect(f.endBalance).toBe(3700)
    expect(f.worst).toEqual({ date: '2026-11-02', balance: 2200 })
  })

  it('conta vencida entra amanhã', () => {
    const week = f.weeks.find((w) => w.start === '2026-10-19')!
    expect(week.kind).toBe('ATUAL')
    const overdue = week.items.find((i) => i.source === 'VENCIDA')!
    expect(overdue).toMatchObject({ date: '2026-10-22', cents: -100, group: WHOLE_CHURCH })
  })

  it('avisa o primeiro dia abaixo do mínimo da congregação', () => {
    expect(f.min).toBe(3000)
    expect(f.alerts).toEqual([{ group: 'Aldeia', date: '2026-11-02', balance: 2500, min: 3000 }])
    expect(f.weeks.find((w) => w.start === '2026-11-02')!.below).toEqual(['Aldeia'])
    expect(f.weeks.find((w) => w.start === '2026-10-26')!.below).toEqual([])
  })

  it('linha realizada até hoje e projetada a partir de hoje', () => {
    const today = f.points.find((p) => p.date === '2026-10-21')!
    expect(today.realized).toBe(6300)
    expect(today.projected).toBe(6300)
    expect(f.points[0].projected).toBeNull()
    expect(f.points[f.points.length - 1].realized).toBeNull()
    expect(f.points.length).toBe(61)
  })

  it('filtro por congregação deixa de fora o caixa e a conta sem conta bancária', () => {
    const a = cashFlow(accounts, txs, bills, categories, { ...opts, congregation: 'Aldeia' })
    expect(a.balanceToday).toBe(6300)
    expect(a.projectedOut).toBe(5000)
  })

  it('sem a média, só o que está lançado', () => {
    const s = cashFlow(accounts, txs, bills, categories, { ...opts, useAverage: false })
    expect(s.projectedIn).toBe(300)
    expect(s.averageWeekly).toBe(0)
  })

  it('transferência dentro da mesma congregação não muda o saldo', () => {
    const extra = [
      ...txs,
      tx('2026-10-16', 'TRANSFERENCIA', 400, { account_id: 'al', to_account_id: 'al2' }),
    ]
    const acc = [
      ...accounts,
      { id: 'al2', name: 'Caixa Aldeia', opening_balance_cents: 0, congregation: 'Aldeia' },
    ]
    expect(cashFlow(acc, extra, bills, categories, opts).balanceToday).toBe(6300)
  })
})
