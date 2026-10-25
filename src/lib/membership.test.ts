import { describe, expect, it } from 'vitest'
import type { Person, PersonEvent, PersonRelation } from '@/types'
import {
  ageBuckets,
  areRelated,
  buildTimeline,
  familyOf,
  membershipMovements,
  missingEssentials,
  profileCompleteness,
  reasonGroupFor,
  recentlyAdded,
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

const event = (over: Partial<PersonEvent>): PersonEvent => ({
  id: over.id || 'e1',
  church_id: 'c1',
  person_id: 'p1',
  kind: 'SITUACAO',
  date: '2026-01-10 00:00:00.000Z',
  title: 'Admissão por batismo',
  created: '',
  updated: '',
  ...over,
})

const relation = (over: Partial<PersonRelation>): PersonRelation => ({
  id: over.id || 'r1',
  church_id: 'c1',
  person_id: 'ana',
  relative_id: 'bruno',
  kind: 'CONJUGE',
  lives_together: true,
  created: '',
  updated: '',
  ...over,
})

describe('família', () => {
  const people = new Map(
    [
      person({ id: 'ana', name: 'Ana', gender: 'F' }),
      person({ id: 'bruno', name: 'Bruno', gender: 'M' }),
      person({ id: 'lia', name: 'Lia', gender: 'F' }),
      person({ id: 'davi', name: 'Davi', gender: 'M' }),
    ].map((p) => [p.id, p]),
  )
  const relations = [
    relation({ id: 'r1', person_id: 'ana', relative_id: 'bruno', kind: 'CONJUGE' }),
    relation({ id: 'r2', person_id: 'ana', relative_id: 'lia', kind: 'FILHO' }),
    relation({ id: 'r3', person_id: 'davi', relative_id: 'lia', kind: 'IRMAO' }),
  ]

  it('mostra os vínculos dos dois lados, com o tipo invertido e o rótulo pelo sexo', () => {
    expect(familyOf('ana', relations, people).map((f) => [f.relative.name, f.label])).toEqual([
      ['Bruno', 'Marido'],
      ['Lia', 'Filha'],
    ])
    expect(familyOf('lia', relations, people).map((f) => [f.relative.name, f.label])).toEqual([
      ['Ana', 'Mãe'],
      ['Davi', 'Irmão'],
    ])
  })

  it('sabe quando duas fichas já estão ligadas em qualquer sentido', () => {
    expect(areRelated('bruno', 'ana', relations)).toBe(true)
    expect(areRelated('bruno', 'lia', relations)).toBe(false)
  })
})

describe('ficha', () => {
  it('aponta o que falta e calcula o preenchimento', () => {
    const p = person({ status: 'MEMBRO', phone: '81 9999', congregation: 'Aldeia' })
    expect(missingEssentials(p)).toEqual(['nascimento', 'batismo'])
    expect(
      missingEssentials(person({ status: 'VISITANTE', phone: '1', birth_date: '2000-01-01' })),
    ).toEqual([])
    expect(profileCompleteness(p)).toBe(18) // 2 de 11
  })
})

describe('linha do tempo', () => {
  it('junta registros, datas da ficha e escalas, da mais recente para a mais antiga', () => {
    const p = person({
      baptism_date: '2008-03-09 00:00:00.000Z',
      admission_date: '2008-03-09 00:00:00.000Z',
      admission_type: 'BATISMO',
      wedding_date: '2016-06-17 00:00:00.000Z',
    })
    const list = buildTimeline(
      p,
      [
        event({
          id: 'a',
          date: '2008-03-09 00:00:00.000Z',
          from_status: 'VISITANTE',
          to_status: 'MEMBRO',
        }),
        event({
          id: 'b',
          kind: 'CONTATO',
          date: '2025-02-01',
          title: 'Ligação',
          description: 'Pediu oração',
        }),
      ],
      [
        {
          id: 's1',
          date: '2026-10-12 00:00:00.000Z',
          eventTitle: 'Culto de Celebração',
          role: 'Vocal',
        },
      ],
    )
    expect(list.map((e) => [e.date, e.kind])).toEqual([
      ['2026-10-12', 'ESCALA'],
      ['2025-02-01', 'CONTATO'],
      ['2016-06-17', 'CASAMENTO'],
      ['2008-03-09', 'BATISMO'],
      ['2008-03-09', 'SITUACAO'],
    ])
    // a admissão derivada some quando já há uma mudança para Membro no mesmo dia
    expect(list.find((e) => e.kind === 'SITUACAO')?.description).toBe('Visitante → Membro')
  })
})

describe('painel', () => {
  it('classifica entradas e saídas do rol pelo motivo, só no ano pedido', () => {
    expect(reasonGroupFor('VISITANTE', 'MEMBRO')).toBe('entrada')
    expect(reasonGroupFor('MEMBRO', 'TRANSFERIDO')).toBe('saida')
    expect(reasonGroupFor('VISITANTE', 'CONGREGADO')).toBe('outro')
    const m = membershipMovements(
      [
        event({ id: '1', from_status: 'CONGREGADO', to_status: 'MEMBRO' }),
        event({ id: '2', from_status: 'VISITANTE', to_status: 'MEMBRO' }),
        event({ id: '3', from_status: 'MEMBRO', to_status: 'FALECIDO', title: 'Falecimento' }),
        event({
          id: '4',
          from_status: 'MEMBRO',
          to_status: 'AFASTADO',
          title: 'Afastamento',
          date: '2025-05-01',
        }),
        event({ id: '5', kind: 'NOTA', title: 'x' }),
      ],
      2026,
    )
    expect(m.entradas).toEqual([{ reason: 'Admissão por batismo', count: 2 }])
    expect(m.saidas).toEqual([{ reason: 'Falecimento', count: 1 }])
  })

  it('agrupa por idade, com quem não tem nascimento à parte', () => {
    const b = ageBuckets(
      [
        person({ id: 'a', birth_date: '2020-01-01' }),
        person({ id: 'b', birth_date: '1950-01-01' }),
        person({ id: 'c' }),
      ],
      '2026-10-25',
    )
    expect(b.map((x) => [x.label, x.count])).toEqual([
      ['Crianças (0–11)', 1],
      ['Adolescentes (12–17)', 0],
      ['Jovens (18–29)', 0],
      ['Adultos (30–59)', 0],
      ['Idosos (60+)', 1],
      ['Sem nascimento', 1],
    ])
  })

  it('conta cadastros recentes pela data de criação', () => {
    const list = recentlyAdded(
      [
        person({ id: 'a', created: '2026-10-20 12:00:00.000Z' }),
        person({ id: 'b', created: '2026-08-01 12:00:00.000Z' }),
      ],
      '2026-10-25',
      30,
    )
    expect(list.map((p) => p.id)).toEqual(['a'])
  })
})
