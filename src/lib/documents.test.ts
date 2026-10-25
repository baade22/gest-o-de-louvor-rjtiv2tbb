import { describe, expect, it } from 'vitest'
import type { Person } from '@/types'
import {
  baptismCertificateText,
  brother,
  longDate,
  placeAndDate,
  recommendationLetterBody,
  transferLetterBody,
} from './documents'

const person = (over: Partial<Person>): Person => ({
  id: 'p',
  church_id: 'c1',
  name: 'Ana Carolina Duarte',
  status: 'MEMBRO',
  created: '',
  updated: '',
  ...over,
})
const church = { name: 'IB Missionária em Aldeia' }

describe('documentos', () => {
  it('escreve a data por extenso e o local', () => {
    expect(longDate('2008-03-09 00:00:00.000Z')).toBe('9 de março de 2008')
    expect(longDate('')).toBe('')
    expect(placeAndDate('Camaragibe', '2026-10-25')).toBe('Camaragibe, 25 de outubro de 2026')
    expect(placeAndDate('', '2026-10-25')).toBe('25 de outubro de 2026')
  })

  it('faz a concordância pelo sexo da ficha', () => {
    expect(brother(person({ gender: 'F' }))).toBe('a irmã')
    expect(brother(person({ gender: 'M' }))).toBe('o irmão')
    expect(brother(person({}))).toBe('o(a) irmão(ã)')
  })

  it('carta de transferência traz datas da ficha, destino e frase extra', () => {
    const body = transferLetterBody({
      person: person({ gender: 'F', admission_date: '2008-03-09', baptism_date: '2008-03-09' }),
      church,
      destination: 'Igreja Batista Central do Recife',
      extra: 'Muda-se por motivo de trabalho.',
    })
    expect(body[0]).toBe(
      'A IB Missionária em Aldeia vem, por meio desta, apresentar a irmã Ana Carolina Duarte, membro desta igreja desde 9 de março de 2008, batizada em 9 de março de 2008, que solicitou transferência para a comunhão da Igreja Batista Central do Recife.',
    )
    expect(body[1]).toContain('Declaramos que ela se encontra')
    expect(body[1]).toContain('a recomendamos para ser recebida')
    expect(body[2]).toBe('Muda-se por motivo de trabalho.')
    expect(body[3]).toMatch(/^Ao recebê-la,/)
  })

  it('sem destino deixa um espaço para preencher; recomendação tem destinatário padrão', () => {
    expect(transferLetterBody({ person: person({}), church, destination: '' })[0]).toContain('[igreja de destino]')
    expect(recommendationLetterBody({ person: person({ gender: 'M' }), church, destination: '' })[0]).toBe(
      'A IB Missionária em Aldeia recomenda a quem possa interessar o irmão Ana Carolina Duarte, membro desta igreja.',
    )
  })

  it('certificado sem data de batismo deixa linha em branco', () => {
    expect(baptismCertificateText(person({ gender: 'M' }), church)).toContain('foi batizado por imersão')
    expect(baptismCertificateText(person({}), church)).toContain('em ____ de')
  })
})
