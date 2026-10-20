import { describe, expect, it } from 'vitest'
import type { Person } from '@/types'
import {
  ageOn,
  celebrationsInMonth,
  filterPeople,
  summarizePeople,
  upcomingCelebrations,
} from './membership'

const person = (over: Partial<Person>): Person => ({
  id: over.name || 'x',
  church_id: 'c1',
  name: 'Fulano',
  status: 'MEMBRO',
  created: '',
  updated: '',
  ...over,
})

describe('ageOn', () => {
  it('conta a idade só depois do dia do aniversário', () => {
    expect(ageOn('1990-10-20 00:00:00.000Z', '2026-10-19')).toBe(35)
    expect(ageOn('1990-10-20 00:00:00.000Z', '2026-10-20')).toBe(36)
  })

  it('sem data de nascimento não há idade', () => {
    expect(ageOn(undefined, '2026-10-20')).toBeNull()
    expect(ageOn('', '2026-10-20')).toBeNull()
  })
})

describe('filterPeople', () => {
  const people = [
    person({ name: 'João Araújo', phone: '(81) 99999-1234', congregation: 'Aldeia' }),
    person({ name: 'Maria Lima', email: 'maria@igreja.com', congregation: 'Diamante' }),
    person({ name: 'Ana Souza', status: 'VISITANTE', congregation: 'Aldeia' }),
  ]

  it('busca sem acento, por e-mail e por dígitos do telefone', () => {
    expect(filterPeople(people, { search: 'araujo' }).map((p) => p.name)).toEqual(['João Araújo'])
    expect(filterPeople(people, { search: 'maria@' }).map((p) => p.name)).toEqual(['Maria Lima'])
    expect(filterPeople(people, { search: '99999 1234' }).map((p) => p.name)).toEqual([
      'João Araújo',
    ])
  })

  it('filtra por situação e congregação', () => {
    expect(
      filterPeople(people, { status: 'MEMBRO', congregation: 'Aldeia' }).map((p) => p.name),
    ).toEqual(['João Araújo'])
    expect(filterPeople(people, { status: 'TODOS', congregation: 'TODAS' })).toHaveLength(3)
  })
})

describe('aniversários', () => {
  const people = [
    person({ name: 'Bruno', birth_date: '1985-10-25 00:00:00.000Z' }),
    person({
      name: 'Carla',
      birth_date: '2000-10-02 00:00:00.000Z',
      wedding_date: '2020-10-21 00:00:00.000Z',
    }),
    person({ name: 'Davi', birth_date: '1950-10-05', status: 'FALECIDO' }),
    person({ name: 'Eva', birth_date: '1992-01-03' }),
    person({ name: 'Bia', birth_date: '2004-02-29' }),
  ]

  it('lista nascimento e casamento do mês, sem falecidos, em ordem de dia', () => {
    const list = celebrationsInMonth(people, 10, 2026)
    expect(list.map((c) => [c.person.name, c.kind, c.day, c.years])).toEqual([
      ['Carla', 'NASCIMENTO', 2, 26],
      ['Carla', 'CASAMENTO', 21, 6],
      ['Bruno', 'NASCIMENTO', 25, 41],
    ])
  })

  it('próximos dias incluem hoje e atravessam a virada do ano', () => {
    const soon = upcomingCelebrations(people, '2026-10-21', 7)
    expect(soon.map((c) => [c.person.name, c.kind, c.inDays])).toEqual([
      ['Carla', 'CASAMENTO', 0],
      ['Bruno', 'NASCIMENTO', 4],
    ])

    const newYear = upcomingCelebrations(people, '2026-12-30', 7)
    expect(newYear.map((c) => [c.person.name, c.date, c.years])).toEqual([
      ['Eva', '2027-01-03', 35],
    ])
  })

  it('29 de fevereiro vira 28 em ano não bissexto', () => {
    const soon = upcomingCelebrations(people, '2027-02-27', 3)
    expect(soon.map((c) => [c.person.name, c.date])).toEqual([['Bia', '2027-02-28']])
  })
})

describe('summarizePeople', () => {
  it('conta por situação e só pessoas ativas por congregação', () => {
    const s = summarizePeople([
      person({ congregation: 'Aldeia' }),
      person({ congregation: 'Aldeia', status: 'CONGREGADO' }),
      person({ congregation: 'Diamante', status: 'TRANSFERIDO' }),
      person({}),
    ])
    expect(s.total).toBe(4)
    expect(s.byStatus.MEMBRO).toBe(2)
    expect(s.byStatus.TRANSFERIDO).toBe(1)
    expect(s.byCongregation).toEqual({ Aldeia: 2, 'Sem congregação': 1 })
  })
})
