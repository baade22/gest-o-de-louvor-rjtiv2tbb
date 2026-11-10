import { describe, expect, it } from 'vitest'
import { formatDoc, payersReport } from './financeReports'

const e = (p: Record<string, unknown>) => ({
  type: 'ENTRADA' as const,
  date: '2026-11-05 12:00:00.000Z',
  amount_cents: 100,
  account_id: 'A',
  status: 'CONFIRMADO' as const,
  ...p,
})

describe('payersReport', () => {
  const people = [{ id: 'p1', name: 'Maria Silva', document: '123.456.789-09' }]
  const txs = [
    e({ payer_doc: '12345678909', payer_name: 'MARIA S', amount_cents: 1000 }),
    e({ person_id: 'p1', amount_cents: 500, date: '2026-11-09 12:00:00.000Z' }),
    e({ payer_doc: '11222333000181', payer_name: 'Empresa X', amount_cents: 300 }),
    e({ payer_doc: '11222333000181', payer_name: 'Empresa X', amount_cents: 200 }),
    e({ payer_name: 'JOAO REM', amount_cents: 50 }),
    e({ amount_cents: 70 }),
    e({ type: 'SAIDA', payer_doc: '12345678909', amount_cents: 9999 }),
    e({ payer_doc: '12345678909', amount_cents: 9999, status: 'ESTORNADO' }),
    e({ payer_doc: '12345678909', amount_cents: 9999, date: '2026-12-01 12:00:00.000Z' }),
  ]

  it('soma por pessoa cadastrada ou por CPF/CNPJ do banco', () => {
    const r = payersReport(txs, people, '2026-11-01', '2026-11-30')
    expect(r.rows.map((x) => [x.label, x.doc, x.personId, x.cents, x.count])).toEqual([
      ['Maria Silva', '12345678909', 'p1', 1500, 2],
      ['Empresa X', '11222333000181', '', 500, 2],
      ['JOAO REM', '', '', 50, 1],
      ['Não identificado', '', '', 70, 1],
    ])
    expect(r.rows[0].last).toBe('2026-11-09')
    expect(r.total).toBe(2120)
    expect(r.registered).toBe(1)
    expect(r.unknown).toBe(70)
    expect(r.records).toBe(6)
  })

  it('filtra por conta e por categoria', () => {
    const r = payersReport(txs, people, '2026-11-01', '2026-11-30', new Set(['B']))
    expect(r.rows).toEqual([])
    const c = payersReport(
      [...txs, e({ payer_doc: '12345678909', category_id: 'diz', amount_cents: 40 })],
      people,
      '2026-11-01',
      '2026-11-30',
      null,
      new Set(['diz']),
    )
    expect(c.total).toBe(40)
  })

  it('formata CPF e CNPJ', () => {
    expect(formatDoc('12345678909')).toBe('123.456.789-09')
    expect(formatDoc('11222333000181')).toBe('11.222.333/0001-81')
  })
})
