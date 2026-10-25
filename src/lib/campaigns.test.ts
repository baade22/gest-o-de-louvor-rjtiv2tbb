import { describe, expect, it } from 'vitest'
import { campaignProgress } from './campaigns'

const tx = (type: string, cents: number, extra: Record<string, unknown> = {}) =>
  ({
    type,
    amount_cents: cents,
    status: 'CONFIRMADO',
    date: '2026-10-10 12:00:00.000Z',
    campaign_id: 'ref',
    ...extra,
  }) as any

describe('campaignProgress', () => {
  const txs = [
    tx('ENTRADA', 100000, { person_id: 'ana' }),
    tx('ENTRADA', 50000, { person_id: 'ana' }),
    tx('ENTRADA', 25000, { person_id: 'bia' }),
    tx('ENTRADA', 25000, { is_anonymous: true }),
    tx('ENTRADA', 9999, { person_id: 'cid', status: 'ESTORNADO' }),
    tx('ENTRADA', 70000, { campaign_id: 'outra', person_id: 'dan' }),
    tx('SAIDA', 30000),
  ]

  it('soma arrecadado, gasto e participantes da campanha', () => {
    const p = campaignProgress(
      { id: 'ref', goal_cents: 400000, end_date: '2026-12-31 12:00:00.000Z' },
      txs,
      '2026-10-25',
    )
    expect(p.raised).toBe(200000)
    expect(p.spent).toBe(30000)
    expect(p.balance).toBe(170000)
    expect(p.participants).toBe(2)
    expect(p.anonymousCount).toBe(1)
    expect(p.entries).toBe(4)
    expect(p.pct).toBe(50)
    expect(p.daysLeft).toBe(67)
  })

  it('sem meta e sem término', () => {
    const p = campaignProgress({ id: 'ref' }, txs, '2026-10-25')
    expect(p.pct).toBeNull()
    expect(p.daysLeft).toBeNull()
  })

  it('término no passado fica negativo', () => {
    const p = campaignProgress({ id: 'ref', end_date: '2026-10-20' }, [], '2026-10-25')
    expect(p.daysLeft).toBe(-5)
    expect(p.raised).toBe(0)
  })
})
