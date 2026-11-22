import { describe, expect, it } from 'vitest'
import type { Person } from '@/types'
import {
  ageOn,
  ataParagraphs,
  countBallots,
  newVoteKey,
  onlineResultPatches,
  mandateLabel,
  ataProblems,
  buildSnapshot,
  dateInWords,
  editalParagraphs,
  electedList,
  formatCPF,
  genderize,
  isEligibleVoter,
  isValidCPF,
  missingQualification,
  numberToWords,
  posseParagraphs,
  qualificationText,
  quorumStatus,
  requiredPresent,
  tallyItem,
  type Assembly,
  type AssemblyCandidate,
  type AssemblyItem,
} from './assemblies'

const person = (over: Partial<Person>): Person => ({
  id: 'p',
  church_id: 'c',
  name: 'Maria da Silva',
  status: 'MEMBRO',
  created: '',
  updated: '',
  ...over,
})

const full = person({
  id: 'p1',
  gender: 'F',
  nationality: 'brasileiro(a)',
  marital_status: 'CASADO',
  profession: 'Professora',
  rg: '1234567',
  rg_issuer: 'SDS/PE',
  document: '52998224725',
  address: 'Rua das Flores, 10',
  neighborhood: 'Aldeia',
  city: 'Camaragibe',
  state: 'pe',
  zip_code: '54789-000',
})

describe('números e datas por extenso', () => {
  it('escreve números como na ata', () => {
    expect(numberToWords(1)).toBe('um')
    expect(numberToWords(22)).toBe('vinte e dois')
    expect(numberToWords(100)).toBe('cem')
    expect(numberToWords(115)).toBe('cento e quinze')
    expect(numberToWords(2026)).toBe('dois mil e vinte e seis')
    expect(numberToWords(2000)).toBe('dois mil')
    expect(numberToWords(1999)).toBe('mil novecentos e noventa e nove')
  })

  it('data por extenso', () => {
    expect(dateInWords('2026-11-22 00:00:00.000Z')).toBe(
      'Aos vinte e dois dias do mês de novembro do ano de dois mil e vinte e seis',
    )
    expect(dateInWords('2027-03-01')).toBe(
      'Ao primeiro dia do mês de março do ano de dois mil e vinte e sete',
    )
  })
})

describe('qualificação', () => {
  it('confere CPF', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true)
    expect(isValidCPF('111.111.111-11')).toBe(false)
    expect(isValidCPF('123')).toBe(false)
    expect(formatCPF('52998224725')).toBe('529.982.247-25')
  })

  it('ajusta nacionalidade ao sexo', () => {
    expect(genderize('brasileiro(a)', { gender: 'F' })).toBe('brasileira')
    expect(genderize('Brasileira', { gender: 'M' })).toBe('brasileiro')
    expect(genderize('brasileiro(a)', {})).toBe('brasileiro(a)')
  })

  it('monta a qualificação completa', () => {
    expect(qualificationText(full)).toBe(
      'MARIA DA SILVA, brasileira, casada, professora, residente e domiciliada em Rua das Flores, 10, ' +
        'bairro Aldeia, Camaragibe/PE, CEP 54789-000, portadora do RG nº 1234567 SDS/PE, ' +
        'inscrita no CPF sob o nº 529.982.247-25',
    )
    expect(missingQualification(full)).toEqual([])
  })

  it('aponta o que falta e marca [a completar]', () => {
    const p = person({ name: 'João', gender: 'M' })
    expect(missingQualification(p)).toEqual([
      'nome',
      'nacionalidade',
      'estado civil',
      'profissão',
      'RG',
      'CPF',
      'endereço',
    ])
    expect(qualificationText(p)).toContain('portador do RG nº [a completar]')
  })
})

describe('quem vota e quórum', () => {
  const a = { voter_statuses: null, voter_min_age: 18, date: '2026-11-22' }
  it('só membros e com idade mínima', () => {
    expect(isEligibleVoter(person({ status: 'MEMBRO', birth_date: '2000-01-01' }), a)).toBe(true)
    expect(isEligibleVoter(person({ status: 'CONGREGADO' }), a)).toBe(false)
    expect(isEligibleVoter(person({ status: 'MEMBRO', birth_date: '2010-01-01' }), a)).toBe(false)
    // sem data de nascimento a mesa confere
    expect(isEligibleVoter(person({ status: 'MEMBRO' }), a)).toBe(true)
    expect(ageOn('2008-11-23', '2026-11-22')).toBe(17)
    expect(ageOn('2008-11-22', '2026-11-22')).toBe(18)
  })

  it('calcula o mínimo de presentes', () => {
    expect(requiredPresent('MAIORIA_ABSOLUTA', 100)).toBe(51)
    expect(requiredPresent('MAIORIA_ABSOLUTA', 101)).toBe(51)
    expect(requiredPresent('UM_TERCO', 100)).toBe(34)
    expect(requiredPresent('DOIS_TERCOS', 90)).toBe(60)
    expect(requiredPresent('NUMERO', 90, 20)).toBe(20)
    expect(requiredPresent('QUALQUER', 90)).toBeNull()
  })

  it('diz em qual chamada a assembleia pode abrir', () => {
    const rule = { quorum_first: 'MAIORIA_ABSOLUTA' as const, quorum_second: 'QUALQUER' as const }
    expect(quorumStatus(rule, 100, 60).reachedOn).toBe('PRIMEIRA')
    expect(quorumStatus(rule, 100, 30).reachedOn).toBe('SEGUNDA')
    expect(quorumStatus(rule, 100, 0).reachedOn).toBeNull()
    const strict = { quorum_first: 'MAIORIA_ABSOLUTA' as const, quorum_second: 'UM_TERCO' as const }
    expect(quorumStatus(strict, 90, 20).reachedOn).toBeNull()
  })
})

describe('apuração', () => {
  const cands: Pick<AssemblyCandidate, 'id' | 'votes' | 'elected'>[] = [
    { id: 'a', votes: 40 },
    { id: 'b', votes: 25 },
    { id: 'c', votes: 10 },
  ]

  it('eleição por maioria simples elege os mais votados', () => {
    const r = tallyItem({ kind: 'ELEICAO', seats: 2, majority: 'SIMPLES' }, cands, 80)
    expect(r.electedIds).toEqual(['a', 'b'])
    expect(r.approved).toBe(true)
  })

  it('maioria absoluta é sobre os votos válidos', () => {
    const r = tallyItem({ kind: 'ELEICAO', seats: 1, majority: 'ABSOLUTA', votes_blank: 5 }, cands, 80)
    expect(r.valid).toBe(75)
    expect(r.needed).toBe(38)
    expect(r.electedIds).toEqual(['a'])
    const r2 = tallyItem(
      { kind: 'ELEICAO', seats: 1, majority: 'ABSOLUTA' },
      [
        { id: 'a', votes: 30 },
        { id: 'b', votes: 30 },
        { id: 'c', votes: 15 },
      ],
      80,
    )
    expect(r2.electedIds).toEqual([])
  })

  it('empate na última vaga fica para a mesa', () => {
    const r = tallyItem(
      { kind: 'ELEICAO', seats: 1 },
      [
        { id: 'a', votes: 20 },
        { id: 'b', votes: 20 },
      ],
      40,
    )
    expect(r.tie).toBe(true)
    expect(r.electedIds).toEqual([])
  })

  it('avisa quando há mais votos que votantes', () => {
    const r = tallyItem({ kind: 'ELEICAO', seats: 1, votes_null: 10 }, cands, 50)
    expect(r.problems[0]).toMatch(/passam do número de votantes/)
  })

  it('recondução: sim contra não, ou maioria qualificada', () => {
    expect(tallyItem({ kind: 'REFERENDO', votes_yes: 50, votes_no: 20 }, [], 80).approved).toBe(true)
    expect(tallyItem({ kind: 'REFERENDO', votes_yes: 20, votes_no: 20 }, [], 80).tie).toBe(true)
    const two = tallyItem(
      { kind: 'REFERENDO', majority: 'DOIS_TERCOS', votes_yes: 50, votes_no: 25, votes_abstain: 5 },
      [],
      80,
    )
    expect(two.needed).toBe(54)
    expect(two.approved).toBe(false)
  })

  it('aclamação usa o que a mesa marcou', () => {
    const r = tallyItem({ kind: 'ELEICAO', method: 'ACLAMACAO' }, [{ id: 'a', elected: true }], 10)
    expect(r.electedIds).toEqual(['a'])
  })
})

describe('ata', () => {
  const assembly: Assembly = {
    id: 'as',
    church_id: 'c',
    title: 'Eleição 2027',
    kind: 'ORDINARIA',
    status: 'REALIZADA',
    date: '2026-11-22 00:00:00.000Z',
    place: 'templo sede',
    first_call: '19:00',
    second_call: '19:30',
    call_date: '2026-11-01 00:00:00.000Z',
    call_means: 'afixado no mural',
    quorum_first: 'MAIORIA_ABSOLUTA',
    quorum_second: 'QUALQUER',
    president_id: 'p1',
    secretary_id: 'p2',
    opened_on: 'PRIMEIRA',
    ended_at: '21:15',
    created: '',
    updated: '',
  }
  const sec = person({ id: 'p2', name: 'José Souza', gender: 'M' })
  const items: AssemblyItem[] = [
    {
      id: 'i1',
      church_id: 'c',
      assembly_id: 'as',
      order: 1,
      kind: 'REFERENDO',
      title: 'Pastor Presidente',
      term_start: '2027-01-01',
      term_end: '2028-12-31',
      method: 'ESCRUTINIO_SECRETO',
      votes_yes: 3,
      votes_no: 0,
      approved: true,
      office_date: '2026-11-22',
    },
  ]
  const candidates: AssemblyCandidate[] = [
    { id: 'c1', church_id: 'c', assembly_id: 'as', item_id: 'i1', person_id: 'p1', votes: 0 },
  ]
  const attendees = ['p1', 'p2', 'p3'].map((pid) => ({
    id: pid,
    church_id: 'c',
    assembly_id: 'as',
    person_id: pid,
    voter: true,
  }))
  const people = [full, sec, person({ id: 'p3', name: 'Ana Lima' }), person({ id: 'p4', name: 'Rui Alves' })]
  const snap = buildSnapshot({
    church: {
      name: 'Igreja Batista Missionária em Aldeia',
      doc_cnpj: '00.000.000/0001-00',
      doc_address: 'Estrada de Aldeia',
      doc_city: 'Camaragibe/PE',
      doc_statute_registry: 'registrado no Cartório de Pessoas Jurídicas sob o nº 100, fls. 1.',
    },
    assembly,
    items,
    candidates,
    attendees,
    people,
    now: '2026-11-22T22:00:00Z',
  })

  it('congela os números da presença', () => {
    expect(snap.eligible).toBe(4)
    expect(snap.presentVoters).toBe(3)
    expect(snap.attendees.map((a) => a.name)).toEqual(['Ana Lima', 'José Souza', 'Maria da Silva'])
  })

  it('lista os reconduzidos com mandato', () => {
    const e = electedList(snap)
    expect(e).toHaveLength(1)
    expect(e[0].office).toBe('Pastor Presidente')
    expect(e[0].term_end).toBe('2028-12-31')
  })

  it('monta a ata com abertura, quórum, resultado, qualificação e encerramento', () => {
    const text = ataParagraphs(snap).join('\n')
    expect(text).toContain('Aos vinte e dois dias do mês de novembro do ano de dois mil e vinte e seis, às 19h, em templo sede')
    expect(text).toContain('em primeira convocação')
    expect(text).toContain('Estavam presentes 3 pessoas, das quais 3 membros com direito a voto, de um total de 4 membros votantes')
    expect(text).toContain('nos termos do estatuto social, registrado no Cartório de Pessoas Jurídicas sob o nº 100, fls. 1.')
    expect(text).toContain(
      'A senhora presidente, Maria da Silva, iniciou os trabalhos fazendo uma oração, convidou José Souza para secretariar',
    )
    expect(text).toContain('o motivo de sua convocação: PASTOR PRESIDENTE.')
    expect(text).toContain('Maria da Silva colocou o cargo de Pastor Presidente à disposição da assembleia')
    expect(text).toContain('3 votos favoráveis, 0 votos contrários')
    expect(text).toContain('para o mandato de 01/01/2027 a 31/12/2028')
    expect(text).toContain('Qualificação da eleita para o cargo de Pastor Presidente: MARIA DA SILVA, brasileira, casada')
    expect(text).toContain('a eleita foi empossada')
    expect(text).toContain('deu por encerrada a assembleia às 21h15')
    expect(text).toContain('lavrada por mim, José Souza, secretário, e, lida e aprovada, vai assinada por mim, pela senhora presidente.')
  })

  it('monta o bloco da nova diretoria como na ata de 2022', () => {
    const term = { term_start: '2022-12-18', term_end: '2026-11-30', office_date: '2026-11-22' }
    const board = buildSnapshot({
      church: { name: 'Igreja Batista Missionária em Aldeia' },
      assembly,
      items: [
        { id: 'b1', church_id: 'c', assembly_id: 'as', order: 1, kind: 'ELEICAO', title: 'Presidente', seats: 1, method: 'ACLAMACAO', ...term },
        { id: 'b2', church_id: 'c', assembly_id: 'as', order: 2, kind: 'ELEICAO', title: 'Conselho Fiscal', seats: 2, method: 'ACLAMACAO', ...term },
      ],
      candidates: [
        { id: 'x1', church_id: 'c', assembly_id: 'as', item_id: 'b1', person_id: 'p1', elected: true },
        { id: 'x2', church_id: 'c', assembly_id: 'as', item_id: 'b2', person_id: 'p3', elected: true },
        { id: 'x3', church_id: 'c', assembly_id: 'as', item_id: 'b2', person_id: 'p4', elected: true },
      ],
      attendees,
      people,
    })
    const text = ataParagraphs(board).join('\n')
    expect(text).toContain(
      'neste ato assumem a NOVA DIRETORIA DA IGREJA BATISTA MISSIONÁRIA EM ALDEIA PARA O EXERCÍCIO DO SEU MANDATO QUADRIÊNIO 2022-2026 (de 18/12/2022 a 30/11/2026): Presidente: MARIA DA SILVA',
    )
    expect(text).toContain('CONSELHO FISCAL: ANA LIMA')
    expect(text).toContain('e por toda a diretoria eleita e empossada.')
    expect(mandateLabel('2027-01-01', '2028-12-31')).toBe('BIÊNIO 2027-2028 (de 01/01/2027 a 31/12/2028)')
  })

  it('edital e termo de posse', () => {
    const ed = editalParagraphs(snap, 'Maria da Silva')
    expect(ed[0]).toContain('em primeira convocação às 19h e em segunda convocação às 19h30')
    expect(ed[1]).toBe('1) Pastor Presidente')
    expect(posseParagraphs(snap)[0]).toContain('eleita para o cargo de Pastor Presidente')
  })

  it('aponta o que falta antes de finalizar', () => {
    expect(ataProblems(snap)).toEqual([])
    const bad = buildSnapshot({
      church: { name: 'Igreja' },
      assembly: { ...assembly, secretary_id: '', opened_on: '' },
      items: [{ ...items[0], term_end: '' }],
      candidates: [{ ...candidates[0], person_id: 'p3' }],
      attendees: [],
      people,
    })
    const probs = ataProblems(bad)
    expect(probs).toContain('Escolha quem secretariou a assembleia.')
    expect(probs).toContain('A lista de presença está vazia.')
    expect(probs).toContain('Pastor Presidente: falta o início e o fim do mandato.')
    expect(probs.some((p) => p.startsWith('Ana Lima: falta'))).toBe(true)
  })
})

describe('votação on-line da chapa', () => {
  const item = (id: string, kind: AssemblyItem['kind']): AssemblyItem => ({
    id,
    church_id: 'c',
    assembly_id: 'as',
    order: 1,
    kind,
    title: id,
  })
  const cand = (id: string, item_id: string): AssemblyCandidate => ({
    id,
    church_id: 'c',
    assembly_id: 'as',
    item_id,
    person_id: 'p' + id,
  })

  it('conta os votos e ignora escolha desconhecida', () => {
    expect(
      countBallots([{ choice: 'SIM' }, { choice: 'SIM' }, { choice: 'NAO' }, { choice: 'X' }]),
    ).toEqual({ SIM: 2, NAO: 1, ABSTENCAO: 0 })
  })

  it('lança o mesmo resultado em cada cargo da chapa', () => {
    const items = [item('Presidente', 'REFERENDO'), item('Conselho', 'ELEICAO'), item('Pauta', 'DELIBERACAO')]
    const cands = [cand('a', 'Presidente'), cand('b', 'Conselho'), cand('c', 'Conselho')]
    const out = onlineResultPatches(items, cands, { SIM: 30, NAO: 2, ABSTENCAO: 1 })
    expect(out.map((o) => o.item.id)).toEqual(['Presidente', 'Conselho'])
    expect(out[0].patch).toMatchObject({
      method: 'ESCRUTINIO_SECRETO',
      voters: 33,
      votes_yes: 30,
      votes_no: 2,
      votes_abstain: 1,
      approved: true,
    })
    expect(out[0].patch.result_note).toBe(
      'Votação on-line da chapa: 30 votos SIM, 2 NÃO e 1 abstenção, de 33 votantes.',
    )
    expect(out[1].candidates).toEqual([
      { id: 'b', votes: 30, elected: true },
      { id: 'c', votes: 30, elected: true },
    ])
  })

  it('chapa rejeitada não elege ninguém', () => {
    const out = onlineResultPatches([item('X', 'ELEICAO')], [cand('a', 'X')], { SIM: 2, NAO: 5, ABSTENCAO: 0 })
    expect(out[0].patch.approved).toBe(false)
    expect(out[0].candidates[0].elected).toBe(false)
  })

  it('gera chave de link no formato aceito pela rota', () => {
    expect(newVoteKey()).toMatch(/^[A-Za-z0-9]{32}$/)
  })
})
