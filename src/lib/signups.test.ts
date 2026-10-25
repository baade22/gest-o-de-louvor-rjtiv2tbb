import { describe, expect, it } from 'vitest'
import type { Person, PersonSignup } from '@/types'
import { findDuplicates, mergeSignupInto, newSignupKey, signupToPerson } from './signups'

const person = (over: Partial<Person>): Person => ({
  id: over.name || 'x',
  church_id: 'c1',
  name: 'Fulano',
  status: 'MEMBRO',
  created: '',
  updated: '',
  ...over,
})

const signup = (over: Partial<PersonSignup>): PersonSignup => ({
  id: 's1',
  church_id: 'c1',
  name: 'Carlos Mendes',
  relationship: 'VISITANTE',
  status: 'PENDENTE',
  created: '',
  updated: '',
  ...over,
})

describe('findDuplicates', () => {
  const people = [
    person({ id: 'a', name: 'Carlos Méndes' }),
    person({ id: 'b', name: 'Outra Pessoa', phone: '(81) 9 8888-7777' }),
    person({ id: 'c', name: 'Maria', email: 'Maria@Igreja.com' }),
    person({ id: 'd', name: 'Sem relação', phone: '81 3333-1111' }),
  ]

  it('acha pelo nome sem acento, pelo telefone sem DDD e pelo e-mail', () => {
    const found = findDuplicates(
      signup({ name: ' carlos  mendes ', phone: '88887777', email: 'maria@igreja.com ' }),
      people,
    )
    expect(found.map((d) => [d.person.id, d.reasons])).toEqual([
      ['a', ['nome']],
      ['b', ['telefone']],
      ['c', ['e-mail']],
    ])
  })

  it('não acusa duplicado com telefone curto ou vazio', () => {
    expect(findDuplicates(signup({ name: 'Novo', phone: '123' }), people)).toEqual([])
  })
})

describe('aprovação', () => {
  const s = signup({
    phone: '81 98888-7777',
    city: 'Recife',
    congregation: 'Aldeia',
    how_found: 'Instagram',
    baptized: true,
  })

  it('cria a ficha com a situação escolhida e anota como conheceu a igreja', () => {
    const p = signupToPerson(s, 'VISITANTE')
    expect(p).toMatchObject({
      church_id: 'c1',
      name: 'Carlos Mendes',
      status: 'VISITANTE',
      phone: '81 98888-7777',
      city: 'Recife',
      congregation: 'Aldeia',
      email: '',
    })
    expect(p.notes).toBe('Como conheceu a igreja: Instagram\nDisse que já é batizado(a).')
  })

  it('ao juntar com ficha existente, só preenche o que está vazio', () => {
    const existing = person({ name: 'Carlos M.', phone: '81 3333-0000', congregation: '' })
    expect(mergeSignupInto(existing, s)).toEqual({ city: 'Recife', congregation: 'Aldeia' })
  })
})

it('gera chaves de 24 caracteres sem repetir', () => {
  const a = newSignupKey()
  expect(a).toMatch(/^[A-Za-z0-9]{24}$/)
  expect(newSignupKey()).not.toBe(a)
})
