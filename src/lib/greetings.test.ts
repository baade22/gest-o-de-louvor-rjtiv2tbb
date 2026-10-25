import { describe, expect, it } from 'vitest'
import type { PersonEvent } from '@/types'
import { DEFAULT_GREETINGS, GREETING_SENT_TITLE, greetedToday, greetingTemplate, renderGreeting } from './greetings'

describe('renderGreeting', () => {
  it('troca os campos pelo primeiro nome, nome completo, anos e igreja', () => {
    const out = renderGreeting(
      'Parabéns, {nome} ({nome_completo}), pelos {anos} anos! Abraço da {igreja}.',
      { person: { name: 'Ana Carolina Duarte' }, years: 36 },
      'IB Aldeia',
    )
    expect(out).toBe('Parabéns, Ana (Ana Carolina Duarte), pelos 36 anos! Abraço da IB Aldeia.')
  })

  it('sem o ano conhecido, tira o número sem deixar espaço sobrando', () => {
    expect(renderGreeting('Feliz {anos} aniversário, {nome} !', { person: { name: 'Bruno' }, years: null }, 'X')).toBe(
      'Feliz aniversário, Bruno!',
    )
  })
})

describe('greetingTemplate', () => {
  it('usa o texto da igreja e cai no padrão quando está vazio', () => {
    expect(greetingTemplate('NASCIMENTO', { greeting_birthday: 'Oi {nome}' })).toBe('Oi {nome}')
    expect(greetingTemplate('CASAMENTO', { greeting_birthday: 'Oi', greeting_wedding: '  ' })).toBe(DEFAULT_GREETINGS.CASAMENTO)
    expect(greetingTemplate('NASCIMENTO', null)).toBe(DEFAULT_GREETINGS.NASCIMENTO)
  })
})

describe('greetedToday', () => {
  const ev = (over: Partial<PersonEvent>): PersonEvent =>
    ({ id: 'e', church_id: 'c', person_id: 'p1', kind: 'CONTATO', date: '2026-10-25 00:00:00.000Z', title: GREETING_SENT_TITLE.NASCIMENTO, created: '', updated: '', ...over }) as PersonEvent

  it('só conta os parabéns registrados hoje', () => {
    const out = greetedToday(
      [
        ev({}),
        ev({ person_id: 'p2', title: GREETING_SENT_TITLE.CASAMENTO }),
        ev({ person_id: 'p3', date: '2026-10-24 00:00:00.000Z' }),
        ev({ person_id: 'p4', title: 'Ligação' }),
      ],
      '2026-10-25',
    )
    expect([...out].sort()).toEqual(['p1-NASCIMENTO', 'p2-CASAMENTO'])
  })
})
