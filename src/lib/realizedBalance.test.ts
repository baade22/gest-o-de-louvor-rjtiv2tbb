import { describe, expect, it } from 'vitest'
import { accountBalances } from './financeSummary'
import { isRealized, realizedFilter } from './realizedBalance'

const tx = (o: Record<string, unknown>) =>
  ({ status: 'CONFIRMADO', amount_cents: 100, ...o }) as never

describe('saldo realizado', () => {
  const starts = { B: '2026-10-01' }
  it('conta sem extrato ou caixa: vale tudo', () => {
    expect(
      isRealized(tx({ type: 'ENTRADA', account_id: 'C', date: '2026-10-05' }), 'C', starts),
    ).toBe(true)
  })
  it('conta bancária: só conciliado, a partir do início da conciliação', () => {
    expect(
      isRealized(tx({ type: 'ENTRADA', account_id: 'B', date: '2026-09-30' }), 'B', starts),
    ).toBe(true)
    expect(
      isRealized(tx({ type: 'ENTRADA', account_id: 'B', date: '2026-10-02' }), 'B', starts),
    ).toBe(false)
    expect(
      isRealized(
        tx({ type: 'ENTRADA', account_id: 'B', date: '2026-10-02', bank_line_id: 'l' }),
        'B',
        starts,
      ),
    ).toBe(true)
  })
  it('transferência: cada lado conta pelo seu próprio extrato', () => {
    const t = tx({
      type: 'TRANSFERENCIA',
      account_id: 'C',
      to_account_id: 'B',
      date: '2026-10-03',
      amount_cents: 500,
    })
    const bal = accountBalances(
      [
        { id: 'B', opening_balance_cents: 0 },
        { id: 'C', opening_balance_cents: 1000 },
      ],
      [
        t,
        tx({
          type: 'SAIDA',
          account_id: 'B',
          date: '2026-10-04',
          bank_line_id: 'x',
          amount_cents: 50,
        }),
      ],
      realizedFilter(starts),
    )
    expect(bal).toEqual({ B: -50, C: 500 })
    const linked = { ...(t as object), to_bank_line_id: 'y' } as never
    expect(
      accountBalances([{ id: 'B', opening_balance_cents: 0 }], [linked], realizedFilter(starts)),
    ).toEqual({ B: 500 })
  })
})
