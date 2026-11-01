import { describe, expect, it } from 'vitest'
import { explainBalanceDiff } from './balanceDiff'

const acc = { id: 'A', opening_balance_cents: 1000 }
const tx = (id: string, date: string, type: string, amount: number, extra = {}) =>
  ({
    id,
    date: `${date} 12:00:00.000Z`,
    type,
    amount_cents: amount,
    account_id: 'A',
    status: 'CONFIRMADO',
    description: id,
    ...extra,
  }) as never
const line = (id: string, date: string, amount: number, status: string, txId = '') =>
  ({
    id,
    date: `${date} 12:00:00.000Z`,
    amount_cents: amount,
    status,
    description: id,
    transaction_id: txId,
  }) as never

describe('explainBalanceDiff', () => {
  it('as partes somam a diferença e cada uma vai para o grupo certo', () => {
    const txs = [
      tx('antigo', '2026-09-01', 'ENTRADA', 500),
      tx('conc', '2026-10-02', 'SAIDA', 300, { bank_line_id: 'l1' }),
      tx('solto', '2026-10-05', 'ENTRADA', 700),
      tx('valor', '2026-10-06', 'SAIDA', 100, { bank_line_id: 'l4' }),
      tx('transf', '2026-10-07', 'TRANSFERENCIA', 250, {
        account_id: 'B',
        to_account_id: 'A',
        to_bank_line_id: 'l5',
      }),
      tx('estornado', '2026-10-08', 'ENTRADA', 999, { status: 'ESTORNADO' }),
    ]
    const lines = [
      line('l1', '2026-10-02', -300, 'CONCILIADO', 'conc'),
      line('l2', '2026-10-03', -40, 'IGNORADO'),
      line('l3', '2026-10-04', 60, 'PENDENTE'),
      line('l4', '2026-10-06', -120, 'CONCILIADO', 'valor'),
      line('l5', '2026-10-07', 250, 'CONCILIADO', 'transf'),
      line('depois', '2026-11-02', 5, 'PENDENTE'),
    ]
    const r = explainBalanceDiff(acc, txs, lines, 2000, '2026-10-31')
    expect(r.system_cents).toBe(1000 + 500 - 300 + 700 - 100 + 250)
    expect(r.diff_cents).toBe(2000 - 2050)
    const sum = r.groups.reduce((s, g) => s + g.cents, 0)
    expect(sum).toBe(r.diff_cents)
    const g = Object.fromEntries(r.groups.map((x) => [x.kind, x.cents]))
    expect(g.IGNORADO).toBe(-40)
    expect(g.PENDENTE).toBe(60)
    expect(g.SEM_EXTRATO).toBe(-700)
    expect(g.CONCILIADO).toBe(-20)
    expect(r.first_day).toBe('2026-10-02')
    expect(r.bank_before_cents).toBe(2000 - (-300 - 40 + 60 - 120 + 250))
    expect(g.ANTES).toBe(r.bank_before_cents - 1500)
  })

  it('lançamento antes do extrato conciliado com movimento do período é diferença de data', () => {
    const r = explainBalanceDiff(
      acc,
      [tx('cedo', '2026-09-30', 'ENTRADA', 100, { bank_line_id: 'l1' })],
      [line('l1', '2026-10-01', 100, 'CONCILIADO', 'cedo')],
      1100,
      '2026-10-31',
    )
    expect(r.diff_cents).toBe(0)
    expect(r.groups.reduce((s, g) => s + g.cents, 0)).toBe(0)
    expect(r.groups.find((x) => x.kind === 'CONCILIADO')?.cents).toBe(100)
    expect(r.groups.find((x) => x.kind === 'ANTES')?.cents).toBe(-100)
  })

  it('sem extrato: toda a diferença fica em antes do extrato', () => {
    const r = explainBalanceDiff(acc, [], [], 1500, '2026-10-31')
    expect(r.groups).toEqual([expect.objectContaining({ kind: 'ANTES', cents: 500 })])
  })
})
