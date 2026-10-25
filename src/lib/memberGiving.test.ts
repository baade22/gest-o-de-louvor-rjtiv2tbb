import { describe, expect, it } from 'vitest'
import { amountInWords, annualStatements, givingSummary } from './memberGiving'

const cats = [
  { id: 'diz', name: 'Dízimo', is_contribution: true },
  { id: 'ofe', name: 'Oferta', is_contribution: true },
  { id: 'alu', name: 'Aluguel do salão', is_contribution: false },
]

const tx = (date: string, cents: number, extra: Record<string, unknown> = {}) =>
  ({
    type: 'ENTRADA',
    status: 'CONFIRMADO',
    date: `${date} 12:00:00.000Z`,
    amount_cents: cents,
    person_id: 'ana',
    category_id: 'diz',
    is_anonymous: false,
    ...extra,
  }) as any

describe('annualStatements', () => {
  const txs = [
    tx('2025-01-05', 45000),
    tx('2025-01-12', 5000, { category_id: 'ofe' }),
    tx('2025-03-02', 45000),
    tx('2025-04-06', 30000, { status: 'ESTORNADO' }),
    tx('2025-05-04', 10000, { is_anonymous: true }),
    tx('2025-06-01', 20000, { category_id: 'alu' }),
    tx('2025-07-06', 8000, { person_id: 'bia' }),
    tx('2024-12-29', 45000),
    tx('2025-08-03', 1000, { type: 'SAIDA' }),
  ]

  it('soma só contribuições com nome, válidas, do ano', () => {
    const map = annualStatements(txs, cats, 2025)
    const ana = map.get('ana')!
    expect(ana.total).toBe(95000)
    expect(ana.count).toBe(3)
    expect(ana.byMonth[0]).toBe(50000)
    expect(ana.byMonth[2]).toBe(45000)
    expect(ana.byCategory.map((r) => [r.label, r.cents])).toEqual([
      ['Dízimo', 90000],
      ['Oferta', 5000],
    ])
    expect(map.get('bia')!.total).toBe(8000)
    expect(map.size).toBe(2)
  })

  it('não cria informe para quem não contribuiu no ano', () => {
    expect(annualStatements(txs, cats, 2023).size).toBe(0)
  })
})

describe('givingSummary', () => {
  it('resume o ano, o anterior e a última contribuição', () => {
    const s = givingSummary(
      [
        tx('2026-02-01', 40000),
        tx('2026-02-15', 2000, { category_id: 'ofe' }),
        tx('2026-10-19', 45000, { payment_method: 'PIX' }),
        tx('2025-11-02', 30000),
        tx('2026-10-20', 9999, { is_anonymous: true }),
        tx('2026-10-21', 7000, { person_id: 'bia' }),
      ],
      cats,
      'ana',
      2026,
    )
    expect(s.total).toBe(87000)
    expect(s.monthsWithGift).toBe(2)
    expect(s.byMonth[1]).toBe(42000)
    expect(s.previousTotal).toBe(30000)
    expect(s.last?.date.slice(0, 10)).toBe('2026-10-19')
    expect(s.years).toEqual([2026, 2025])
  })

  it('pessoa sem contribuição', () => {
    const s = givingSummary([], cats, 'ana', 2026)
    expect(s.total).toBe(0)
    expect(s.last).toBeNull()
    expect(s.years).toEqual([])
  })
})

describe('amountInWords', () => {
  it.each([
    [0, 'zero reais'],
    [1, 'um centavo'],
    [100, 'um real'],
    [101, 'um real e um centavo'],
    [10000, 'cem reais'],
    [10100, 'cento e um reais'],
    [45000, 'quatrocentos e cinquenta reais'],
    [100000, 'mil reais'],
    [110000, 'mil e cem reais'],
    [105000, 'mil e cinquenta reais'],
    [123456, 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [486000, 'quatro mil oitocentos e sessenta reais'],
    [1500000, 'quinze mil reais'],
    [21700099, 'duzentos e dezessete mil reais e noventa e nove centavos'],
    [100000000, 'um milhão de reais'],
    [120000000, 'um milhão e duzentos mil reais'],
    [250000000, 'dois milhões e quinhentos mil reais'],
    [1914, 'dezenove reais e quatorze centavos'],
  ])('%i → %s', (cents, words) => {
    expect(amountInWords(cents)).toBe(words)
  })
})
