import { describe, expect, it } from 'vitest'
import type { Person } from '@/types'
import { boardColumns, daysInStage, effectiveStage, isStale, nextStage } from './followup'

const person = (over: Partial<Person>): Person => ({
  id: over.name || 'x',
  church_id: 'c1',
  name: 'Fulano',
  status: 'VISITANTE',
  created: '2026-10-01 12:00:00.000Z',
  updated: '',
  ...over,
})

const TODAY = '2026-10-25'

describe('etapas', () => {
  it('visitante sem etapa começa em 1ª visita; membro sem etapa fica fora', () => {
    expect(effectiveStage(person({}))).toBe('PRIMEIRA_VISITA')
    expect(effectiveStage(person({ status: 'MEMBRO' }))).toBeNull()
    expect(effectiveStage(person({ status: 'CONGREGADO', followup_stage: 'RETORNO' }))).toBe(
      'RETORNO',
    )
  })

  it('conta os dias desde a mudança de etapa, ou desde o cadastro', () => {
    expect(daysInStage(person({}), TODAY)).toBe(24)
    expect(daysInStage(person({ followup_since: '2026-10-22 00:00:00.000Z' }), TODAY)).toBe(3)
  })

  it('avisa quem está parado há 7 dias ou mais, menos integrados e encerrados', () => {
    expect(isStale(person({ followup_since: '2026-10-18' }), TODAY)).toBe(true)
    expect(isStale(person({ followup_since: '2026-10-19' }), TODAY)).toBe(false)
    expect(isStale(person({ followup_stage: 'INTEGRADO' }), TODAY)).toBe(false)
  })

  it('avança uma etapa por vez e para em integrado', () => {
    expect(nextStage('PRIMEIRA_VISITA')).toBe('CONTATO')
    expect(nextStage('INTEGRADO')).toBeNull()
  })
})

describe('quadro', () => {
  const people = [
    person({
      id: 'a',
      followup_since: '2026-10-24',
      congregation: 'Aldeia',
      followup_owner: 'rute',
    }),
    person({ id: 'b', congregation: 'Diamante' }),
    person({
      id: 'c',
      followup_stage: 'CONTATO',
      followup_since: '2026-10-10',
      congregation: 'Aldeia',
    }),
    person({ id: 'd', status: 'MEMBRO' }),
    person({ id: 'e', status: 'TRANSFERIDO', followup_stage: 'RETORNO' }),
    person({ id: 'f', status: 'CONGREGADO', followup_stage: 'ENCERRADO' }),
  ]

  it('separa por etapa, o mais parado primeiro, sem quem saiu da igreja', () => {
    const cols = boardColumns(people, TODAY)
    expect(cols.PRIMEIRA_VISITA.map((p) => p.id)).toEqual(['b', 'a'])
    expect(cols.CONTATO.map((p) => p.id)).toEqual(['c'])
    expect(cols.RETORNO).toEqual([])
    expect(cols.ENCERRADO.map((p) => p.id)).toEqual(['f'])
  })

  it('filtra por congregação, responsável e parados', () => {
    const ids = (f: Parameters<typeof boardColumns>[2]) =>
      Object.values(boardColumns(people, TODAY, f))
        .flat()
        .map((p) => p.id)
    expect(ids({ congregation: 'Aldeia' })).toEqual(['a', 'c'])
    expect(ids({ ownerId: 'rute' })).toEqual(['a'])
    expect(ids({ ownerId: 'NINGUEM', onlyStale: true })).toEqual(['b', 'c'])
  })
})
