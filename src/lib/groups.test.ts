import { describe, expect, it } from 'vitest'
import type { ChurchGroup, GroupMember, Person } from '@/types'
import { filterGroups, groupsOfPerson, memberRows, phoneList, suggestVolunteers } from './groups'

const person = (over: Partial<Person>): Person =>
  ({
    id: over.name || 'p',
    church_id: 'c1',
    name: 'Fulano',
    status: 'MEMBRO',
    created: '',
    updated: '',
    ...over,
  }) as Person

const member = (over: Partial<GroupMember>): GroupMember => ({
  id: `${over.group_id}-${over.person_id}`,
  church_id: 'c1',
  group_id: 'g1',
  person_id: 'p',
  created: '',
  updated: '',
  ...over,
})

const group = (over: Partial<ChurchGroup>): ChurchGroup => ({
  id: over.name || 'g',
  church_id: 'c1',
  name: 'Grupo',
  kind: 'MINISTERIO',
  active: true,
  created: '',
  updated: '',
  ...over,
})

describe('memberRows', () => {
  it('põe líderes e auxiliares primeiro e ignora fichas apagadas', () => {
    const people = [person({ name: 'Bruno' }), person({ name: 'Ana' }), person({ name: 'Caio' })]
    const byId = new Map(people.map((p) => [p.id, p]))
    const rows = memberRows(
      [
        member({ person_id: 'Ana' }),
        member({ person_id: 'Caio', role: 'LIDER' }),
        member({ person_id: 'Bruno', role: 'AUXILIAR' }),
        member({ person_id: 'apagada' }),
      ],
      byId,
    )
    expect(rows.map((r) => r.person.name)).toEqual(['Caio', 'Bruno', 'Ana'])
  })
})

describe('suggestVolunteers', () => {
  const people = [
    person({ name: 'Ana', skills: ['SOM', 'PROJECAO'] }),
    person({ name: 'Bruno', skills: ['SOM'] }),
    person({ name: 'Caio', skills: ['SOM'], status: 'VISITANTE' }),
    person({ name: 'Davi', skills: ['COZINHA'] }),
    person({ name: 'Eva', skills: ['SOM'], congregation: 'Diamante' }),
    person({ name: 'Fábio', skills: ['PROJECAO'] }),
  ]

  it('sugere quem tem habilidade em comum, ativos, fora do grupo, mais afinidades primeiro', () => {
    const out = suggestVolunteers({ skills: ['SOM', 'PROJECAO'] }, people, new Set(['Fábio']))
    expect(out.map((s) => s.person.name)).toEqual(['Ana', 'Bruno', 'Eva'])
    expect(out[0].matched).toEqual(['SOM', 'PROJECAO'])
  })

  it('respeita a congregação do grupo e não sugere nada sem habilidades', () => {
    const out = suggestVolunteers({ skills: ['SOM'], congregation: 'Aldeia' }, people, new Set())
    expect(out.map((s) => s.person.name)).toEqual(['Ana', 'Bruno'])
    expect(suggestVolunteers({ skills: [] }, people, new Set())).toEqual([])
  })
})

describe('groupsOfPerson e filterGroups', () => {
  const groups = [
    group({ name: 'Recepção' }),
    group({ name: 'Jovens', kind: 'DEPARTAMENTO', congregation: 'Diamante' }),
    group({ name: 'Antigo', active: false }),
  ]

  it('lista os grupos da pessoa com o papel', () => {
    const out = groupsOfPerson('p1', groups, [
      member({ group_id: 'Recepção', person_id: 'p1', role: 'LIDER' }),
      member({ group_id: 'Jovens', person_id: 'p1' }),
      member({ group_id: 'Jovens', person_id: 'p2' }),
    ])
    expect(out.map((g) => [g.group.name, g.role])).toEqual([
      ['Jovens', 'PARTICIPANTE'],
      ['Recepção', 'LIDER'],
    ])
  })

  it('filtra por tipo, congregação, busca sem acento e esconde inativos', () => {
    expect(filterGroups(groups, {}).map((g) => g.name)).toEqual(['Jovens', 'Recepção'])
    expect(filterGroups(groups, { kind: 'DEPARTAMENTO' }).map((g) => g.name)).toEqual(['Jovens'])
    expect(filterGroups(groups, { congregation: 'Aldeia' }).map((g) => g.name)).toEqual([
      'Recepção',
    ])
    expect(filterGroups(groups, { search: 'recepcao' }).map((g) => g.name)).toEqual(['Recepção'])
    expect(filterGroups(groups, { showInactive: true })).toHaveLength(3)
  })
})

describe('phoneList', () => {
  it('uma linha por participante com telefone', () => {
    const rows = [
      { member: member({}), person: person({ name: 'Ana', phone: '(81) 99999-0000' }) },
      { member: member({}), person: person({ name: 'Bruno' }) },
    ]
    expect(phoneList(rows)).toBe('Ana: (81) 99999-0000')
  })
})
