import { describe, expect, it } from 'vitest'
import { defaultCategoryName, isBankItemCategory, itemDirection, lineCandidates } from './bankItems'

describe('isBankItemCategory', () => {
  it('separa rendimentos e despesas bancárias pelo nome da categoria', () => {
    const c = (name: string, direction: 'ENTRADA' | 'SAIDA' = 'SAIDA') => ({ name, direction })
    expect(isBankItemCategory(c('Rendimentos', 'ENTRADA'), 'RENDIMENTO')).toBe(true)
    expect(isBankItemCategory(c('Rendimento negativo'), 'RENDIMENTO')).toBe(true)
    expect(isBankItemCategory(c('Tarifas bancárias'), 'DESPESA')).toBe(true)
    expect(isBankItemCategory(c('IOF'), 'DESPESA')).toBe(true)
    expect(isBankItemCategory(c('Rendimento negativo'), 'DESPESA')).toBe(false)
    expect(isBankItemCategory(c('Energia'), 'DESPESA')).toBe(false)
    expect(
      isBankItemCategory({ ...c('Rendimentos', 'ENTRADA'), is_group: true }, 'RENDIMENTO'),
    ).toBe(false)
  })

  it('cria a categoria certa para cada lado', () => {
    expect(defaultCategoryName('RENDIMENTO', itemDirection('RENDIMENTO', false))).toBe(
      'Rendimentos',
    )
    expect(defaultCategoryName('RENDIMENTO', itemDirection('RENDIMENTO', true))).toBe(
      'Rendimento negativo',
    )
    expect(defaultCategoryName('DESPESA', itemDirection('DESPESA', false))).toBe(
      'Tarifas bancárias',
    )
  })
})

describe('lineCandidates', () => {
  const lines = [
    {
      id: 'a',
      date: '2026-11-03',
      amount_cents: 5200,
      description: 'PIX RECEBIDO',
      status: 'PENDENTE' as const,
    },
    {
      id: 'b',
      date: '2026-11-10',
      amount_cents: 5200,
      description: 'RENTAB.INVEST FACILCRED',
      status: 'PENDENTE' as const,
    },
    {
      id: 'c',
      date: '2026-11-10',
      amount_cents: -1590,
      description: 'TARIFA BANCARIA',
      status: 'PENDENTE' as const,
    },
    {
      id: 'd',
      date: '2026-11-09',
      amount_cents: 900,
      description: 'RENTAB.INVEST FACILCRED',
      status: 'CONCILIADO' as const,
    },
  ]

  it('mostra só os pendentes do lado certo, o de mesmo valor e descrição primeiro', () => {
    const r = lineCandidates(lines, {
      kind: 'RENDIMENTO',
      direction: 'ENTRADA',
      amountCents: 5200,
      date: '2026-11-10',
    })
    expect(r.map((x) => x.line.id)).toEqual(['b', 'a'])
    expect(r[0].exact).toBe(true)
  })

  it('despesa procura débitos', () => {
    const r = lineCandidates(lines, { kind: 'DESPESA', direction: 'SAIDA', amountCents: 1590 })
    expect(r.map((x) => x.line.id)).toEqual(['c'])
  })
})
