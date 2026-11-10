import { describe, expect, it } from 'vitest'
import { billRemaining, billTotals } from './financeSummary'
import { splitInstallments } from '@/services/finance'
import { methodsForAccount } from '@/pages/finance/FinanceBills'

describe('título no padrão Eklesia', () => {
  it('parcelada divide o total e põe os centavos que sobram na primeira', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
    expect(splitInstallments(900, 3)).toEqual([300, 300, 300])
    expect(splitInstallments(500, 1)).toEqual([500])
  })

  it('título com baixa parcial conta só o que falta', () => {
    expect(billRemaining({ amount_cents: 1000, settled_cents: 300 })).toBe(700)
    expect(billRemaining({ amount_cents: 1000 })).toBe(1000)
    const t = billTotals(
      [{ amount_cents: 1000, settled_cents: 400, due_date: '2026-10-10', status: 'ABERTO' }],
      '2026-10-18',
    )
    expect(t.overdue).toEqual({ count: 1, cents: 600 })
  })

  it('tipo de acerto depende da conta', () => {
    expect(methodsForAccount('CAIXA')).toEqual(['DINHEIRO', 'CHEQUE'])
    expect(methodsForAccount('BANCO')).toContain('PIX')
    expect(methodsForAccount('BANCO')).not.toContain('DINHEIRO')
    expect(methodsForAccount(undefined)).toEqual([])
  })
})
