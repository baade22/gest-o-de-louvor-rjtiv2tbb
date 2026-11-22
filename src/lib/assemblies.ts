/**
 * Assembleias e votações (migração 0105): quórum, apuração, qualificação dos eleitos e os
 * textos que vão ao cartório (edital, ata, termo de posse, requerimento).
 *
 * O que o cartório pede (Código de Normas do TJPE, arts. 892 a 907; Código Civil, art. 44):
 * convocação no prazo do estatuto, lista de presença, ata com a qualificação completa dos
 * eleitos (nome, nacionalidade, estado civil, profissão, RG, CPF e endereço) e o mandato,
 * assinada pelo presidente e pelo secretário, e o termo de posse.
 */
import type { MaritalStatus, Person, PersonStatus } from '@/types'
import { toCalendarYMD } from '@/lib/dateUtils'
import { MONTH_NAMES } from '@/lib/membership'

export type AssemblyKind = 'ORDINARIA' | 'EXTRAORDINARIA'
export type AssemblyStatus = 'RASCUNHO' | 'CONVOCADA' | 'REALIZADA' | 'FINALIZADA'
export type AssemblyItemKind = 'ELEICAO' | 'REFERENDO' | 'DELIBERACAO'
export type VoteMethod = 'ACLAMACAO' | 'ESCRUTINIO_SECRETO' | 'NOMINAL'
export type Majority = 'SIMPLES' | 'ABSOLUTA' | 'DOIS_TERCOS'
export type QuorumRule = 'MAIORIA_ABSOLUTA' | 'UM_TERCO' | 'DOIS_TERCOS' | 'NUMERO' | 'QUALQUER'
export type CallOpened = 'PRIMEIRA' | 'SEGUNDA'

export interface Assembly {
  id: string
  church_id: string
  title: string
  kind: AssemblyKind | ''
  status: AssemblyStatus | ''
  date?: string
  place?: string
  first_call?: string
  second_call?: string
  call_date?: string
  call_means?: string
  agenda?: string
  voter_statuses?: PersonStatus[] | null
  voter_min_age?: number
  quorum_first?: QuorumRule | ''
  quorum_second?: QuorumRule | ''
  quorum_min?: number
  statute_note?: string
  president_id?: string
  secretary_id?: string
  opened_on?: CallOpened | ''
  started_at?: string
  ended_at?: string
  notes?: string
  minutes?: AtaSnapshot | null
  finalized_at?: string
  created: string
  updated: string
}

export interface AssemblyItem {
  id: string
  church_id: string
  assembly_id: string
  order: number
  kind: AssemblyItemKind
  title: string
  description?: string
  seats?: number
  term_start?: string
  term_end?: string
  method?: VoteMethod | ''
  majority?: Majority | ''
  voters?: number
  votes_yes?: number
  votes_no?: number
  votes_abstain?: number
  votes_blank?: number
  votes_null?: number
  decided?: boolean
  approved?: boolean
  result_note?: string
  office_date?: string
}

export interface AssemblyCandidate {
  id: string
  church_id: string
  assembly_id: string
  item_id: string
  person_id: string
  order?: number
  votes?: number
  elected?: boolean
}

export interface AssemblyAttendee {
  id: string
  church_id: string
  assembly_id: string
  person_id: string
  voter: boolean
  arrived?: string
}

export const ASSEMBLY_KIND_LABELS: Record<AssemblyKind, string> = {
  ORDINARIA: 'Ordinária',
  EXTRAORDINARIA: 'Extraordinária',
}

export const ASSEMBLY_STATUS_LABELS: Record<AssemblyStatus, string> = {
  RASCUNHO: 'Rascunho',
  CONVOCADA: 'Convocada',
  REALIZADA: 'Realizada',
  FINALIZADA: 'Ata finalizada',
}

export const ITEM_KIND_LABELS: Record<AssemblyItemKind, string> = {
  ELEICAO: 'Eleição para cargo',
  REFERENDO: 'Recondução (sim ou não)',
  DELIBERACAO: 'Deliberação',
}

export const METHOD_LABELS: Record<VoteMethod, string> = {
  ACLAMACAO: 'Aclamação',
  ESCRUTINIO_SECRETO: 'Voto secreto (cédula)',
  NOMINAL: 'Votação nominal (mão levantada)',
}

export const MAJORITY_LABELS: Record<Majority, string> = {
  SIMPLES: 'Maioria simples',
  ABSOLUTA: 'Maioria absoluta',
  DOIS_TERCOS: 'Dois terços',
}

export const QUORUM_LABELS: Record<QuorumRule, string> = {
  MAIORIA_ABSOLUTA: 'Maioria absoluta dos membros votantes, metade mais um',
  UM_TERCO: 'Um terço dos membros votantes',
  DOIS_TERCOS: 'Dois terços dos membros votantes',
  NUMERO: 'Número mínimo de presentes',
  QUALQUER: 'Qualquer número de presentes',
}

/** Sugestões de cargos (o estatuto de cada igreja manda; o nome é livre). */
export const OFFICE_SUGGESTIONS = [
  'Pastor Presidente',
  'Vice-Presidente',
  '1º Secretário',
  '2º Secretário',
  '1º Tesoureiro',
  '2º Tesoureiro',
  'Conselho Fiscal',
  'Diácono',
  'Presbítero',
]

/* ---------------- quem vota e quórum ---------------- */

/** Idade completa numa data (AAAA-MM-DD); null sem data de nascimento. */
export function ageOn(birth: string | undefined, onYmd: string): number | null {
  const b = toCalendarYMD(birth)
  if (!b || !onYmd) return null
  const [by, bm, bd] = b.split('-').map(Number)
  const [y, m, d] = onYmd.split('-').map(Number)
  let age = y - by
  if (m < bm || (m === bm && d < bd)) age--
  return age
}

/**
 * Pode votar: situação marcada na assembleia (padrão: só Membro) e idade mínima (quando o
 * estatuto pede). Sem data de nascimento não barra: a mesa confere na hora.
 */
export function isEligibleVoter(
  person: Pick<Person, 'status' | 'birth_date'>,
  assembly: Pick<Assembly, 'voter_statuses' | 'voter_min_age' | 'date'>,
): boolean {
  const statuses = assembly.voter_statuses?.length ? assembly.voter_statuses : ['MEMBRO']
  if (!statuses.includes(person.status)) return false
  const min = assembly.voter_min_age || 0
  if (min > 0) {
    const age = ageOn(person.birth_date, toCalendarYMD(assembly.date))
    if (age != null && age < min) return false
  }
  return true
}

/** Quantos presentes votantes a regra pede (null = não há mínimo). */
export function requiredPresent(
  rule: QuorumRule | '' | undefined,
  eligible: number,
  min = 0,
): number | null {
  switch (rule) {
    case 'MAIORIA_ABSOLUTA':
      return Math.floor(eligible / 2) + 1
    case 'UM_TERCO':
      return Math.ceil(eligible / 3)
    case 'DOIS_TERCOS':
      return Math.ceil((eligible * 2) / 3)
    case 'NUMERO':
      return Math.max(0, min)
    default:
      return null
  }
}

export interface QuorumStatus {
  eligible: number
  present: number
  first: number | null
  second: number | null
  /** Em qual chamada o quórum foi atingido; null = ainda não atingiu. */
  reachedOn: CallOpened | null
}

export function quorumStatus(
  assembly: Pick<Assembly, 'quorum_first' | 'quorum_second' | 'quorum_min'>,
  eligible: number,
  presentVoters: number,
): QuorumStatus {
  const first = requiredPresent(assembly.quorum_first || 'MAIORIA_ABSOLUTA', eligible, assembly.quorum_min)
  const second = requiredPresent(assembly.quorum_second || 'QUALQUER', eligible, assembly.quorum_min)
  let reachedOn: CallOpened | null = null
  if (first == null || presentVoters >= first) reachedOn = 'PRIMEIRA'
  else if ((second == null && presentVoters > 0) || (second != null && presentVoters >= second))
    reachedOn = 'SEGUNDA'
  return { eligible, present: presentVoters, first, second, reachedOn }
}

/* ---------------- apuração ---------------- */

export interface TallyResult {
  /** Votos que entram na conta da maioria. */
  valid: number
  /** Soma de tudo o que foi registrado (válidos + brancos + nulos [+ abstenções]). */
  total: number
  /** Quantos votos a maioria escolhida pede. */
  needed: number
  /** Eleição: ids dos candidatos que a conta elege. Referendo/deliberação: vazio. */
  electedIds: string[]
  /** Referendo/deliberação: aprovado? Eleição: true se preencheu todas as vagas. */
  approved: boolean
  /** Empate na última vaga: a mesa decide (critério do estatuto) e marca à mão. */
  tie: boolean
  problems: string[]
}

export function neededVotes(majority: Majority | '' | undefined, base: number): number {
  if (majority === 'ABSOLUTA') return Math.floor(base / 2) + 1
  if (majority === 'DOIS_TERCOS') return Math.ceil((base * 2) / 3)
  return 1
}

/**
 * Confere e conta o resultado de um ponto da pauta.
 * - Eleição: maioria simples = os mais votados ocupam as vagas; absoluta / dois terços são
 *   sobre os votos válidos (sem brancos e nulos).
 * - Referendo e deliberação: simples = mais "sim" que "não"; absoluta / dois terços são
 *   sobre os votantes do item (sim + não + abstenções + brancos + nulos).
 * - Aclamação não tem números: o resultado é o que a mesa marcar.
 */
export function tallyItem(
  item: Pick<
    AssemblyItem,
    | 'kind'
    | 'seats'
    | 'method'
    | 'majority'
    | 'voters'
    | 'votes_yes'
    | 'votes_no'
    | 'votes_abstain'
    | 'votes_blank'
    | 'votes_null'
    | 'approved'
  >,
  candidates: Pick<AssemblyCandidate, 'id' | 'votes' | 'elected'>[],
  presentVoters: number,
): TallyResult {
  const n = (v?: number) => Math.max(0, Number(v) || 0)
  const problems: string[] = []
  const blank = n(item.votes_blank)
  const nul = n(item.votes_null)
  if (item.method === 'ACLAMACAO') {
    const electedIds = candidates.filter((c) => c.elected).map((c) => c.id)
    return {
      valid: 0,
      total: 0,
      needed: 0,
      electedIds,
      approved: item.kind === 'ELEICAO' ? electedIds.length > 0 : !!item.approved,
      tie: false,
      problems,
    }
  }
  if (item.kind === 'ELEICAO') {
    const seats = Math.max(1, n(item.seats) || 1)
    const valid = candidates.reduce((s, c) => s + n(c.votes), 0)
    const total = valid + blank + nul
    const needed = neededVotes(item.majority, valid)
    const voters = n(item.voters) || presentVoters
    // Com mais de uma vaga cada pessoa pode marcar até `seats` nomes
    if (seats > 1 && voters > 0 && valid > voters * seats)
      problems.push(`Há mais votos (${valid}) do que votantes (${voters}) permitem.`)
    if (seats === 1 && voters > 0 && total > voters)
      problems.push(`Votos registrados (${total}) passam do número de votantes (${voters}).`)
    const sorted = [...candidates].sort((a, b) => n(b.votes) - n(a.votes))
    const winners = sorted.filter((c) => n(c.votes) >= needed && n(c.votes) > 0).slice(0, seats)
    let tie = false
    if (winners.length === seats && sorted.length > seats) {
      const last = n(winners[seats - 1].votes)
      if (n(sorted[seats].votes) === last) tie = true
    }
    if (valid === 0) problems.push('Nenhum voto registrado.')
    return {
      valid,
      total,
      needed,
      electedIds: tie ? [] : winners.map((c) => c.id),
      approved: !tie && winners.length === seats,
      tie,
      problems,
    }
  }
  const yes = n(item.votes_yes)
  const no = n(item.votes_no)
  const abst = n(item.votes_abstain)
  const total = yes + no + abst + blank + nul
  const voters = n(item.voters) || presentVoters
  if (voters > 0 && total > voters)
    problems.push(`Votos registrados (${total}) passam do número de votantes (${voters}).`)
  if (total === 0) problems.push('Nenhum voto registrado.')
  const simple = !item.majority || item.majority === 'SIMPLES'
  const needed = simple ? no + 1 : neededVotes(item.majority, total)
  const approved = total > 0 && yes >= needed && yes > no
  return {
    valid: yes + no,
    total,
    needed,
    electedIds: [],
    approved,
    tie: simple && yes === no && total > 0,
    problems,
  }
}

/* ---------------- qualificação ---------------- */

export type QualificationField =
  | 'nome'
  | 'nacionalidade'
  | 'estado civil'
  | 'profissão'
  | 'RG'
  | 'CPF'
  | 'endereço'

/** O que falta na ficha para a qualificação completa que o cartório pede. */
export function missingQualification(p: Partial<Person>): QualificationField[] {
  const out: QualificationField[] = []
  if (!p.name?.trim() || p.name.trim().split(/\s+/).length < 2) out.push('nome')
  if (!p.nationality?.trim()) out.push('nacionalidade')
  if (!p.marital_status) out.push('estado civil')
  if (!p.profession?.trim()) out.push('profissão')
  if (!p.rg?.trim()) out.push('RG')
  if (!isValidCPF(p.document || '')) out.push('CPF')
  if (!p.address?.trim() || !p.city?.trim()) out.push('endereço')
  return out
}

export function onlyDigits(s: string): string {
  return (s || '').replace(/\D/g, '')
}

export function isValidCPF(input: string): boolean {
  const d = onlyDigits(input)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export function formatCPF(input: string): string {
  const d = onlyDigits(input)
  if (d.length !== 11) return (input || '').trim()
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

type G = Pick<Person, 'gender'>
function gw(p: G, m: string, f: string): string {
  if (p.gender === 'F') return f
  if (p.gender === 'M') return m
  // sem sexo informado: "brasileiro(a)"
  let i = 0
  while (i < m.length && i < f.length && m[i] === f[i]) i++
  return `${m}(${f.slice(i)})`
}

/** Ajusta "brasileiro(a)" / "Brasileira" ao sexo da ficha, em minúsculas. */
export function genderize(text: string, p: G): string {
  let t = (text || '').trim().toLowerCase()
  if (!t) return ''
  t = t.replace(/o\(a\)$/, p.gender === 'F' ? 'a' : p.gender === 'M' ? 'o' : 'o(a)')
  if (p.gender === 'M' && /eira$/.test(t)) t = t.replace(/eira$/, 'eiro')
  if (p.gender === 'F' && /eiro$/.test(t)) t = t.replace(/eiro$/, 'eira')
  return t
}

const MARITAL_TEXT: Record<MaritalStatus, [string, string]> = {
  SOLTEIRO: ['solteiro', 'solteira'],
  CASADO: ['casado', 'casada'],
  DIVORCIADO: ['divorciado', 'divorciada'],
  VIUVO: ['viúvo', 'viúva'],
  UNIAO_ESTAVEL: ['em união estável', 'em união estável'],
}

export function addressLine(p: Partial<Person>): string {
  const cityUf = [p.city?.trim(), p.state?.trim().toUpperCase()].filter(Boolean).join('/')
  return [
    p.address?.trim(),
    p.neighborhood?.trim() && `bairro ${p.neighborhood.trim()}`,
    cityUf,
    p.zip_code?.trim() && `CEP ${p.zip_code.trim()}`,
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * "MARIA DA SILVA, brasileira, casada, professora, portadora do RG nº 1234567 SDS/PE,
 * inscrita no CPF sob o nº 123.456.789-09, residente e domiciliada na Rua X, 10, ..."
 * O que faltar na ficha sai como [a completar], para ninguém levar ao cartório sem ver.
 */
export function qualificationText(p: Partial<Person> & G): string {
  const miss = '[a completar]'
  const nat = genderize(p.nationality || '', p) || miss
  const civil = p.marital_status ? gw(p, ...MARITAL_TEXT[p.marital_status]) : miss
  const prof = p.profession?.trim().toLowerCase() || miss
  const rg = p.rg?.trim() ? `${p.rg.trim()}${p.rg_issuer?.trim() ? ` ${p.rg_issuer.trim()}` : ''}` : miss
  const cpf = isValidCPF(p.document || '') ? formatCPF(p.document || '') : miss
  const addr = addressLine(p) || miss
  return (
    `${(p.name || '').trim().toUpperCase()}, ${nat}, ${civil}, ${prof}, ` +
    `${gw(p, 'portador', 'portadora')} do RG nº ${rg}, ${gw(p, 'inscrito', 'inscrita')} no CPF sob o nº ${cpf}, ` +
    `${gw(p, 'residente e domiciliado', 'residente e domiciliada')} em ${addr}`
  )
}

/* ---------------- números e datas por extenso ---------------- */

const UNITS = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
]
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
]

function below1000(n: number): string {
  if (n === 100) return 'cem'
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(HUNDREDS[h])
  if (r) {
    if (r < 20) parts.push(UNITS[r])
    else {
      const t = Math.floor(r / 10)
      const u = r % 10
      parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t])
    }
  }
  return parts.join(' e ')
}

/** Número inteiro de 0 a 999.999 por extenso ("dois mil e vinte e seis"). */
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n < 20) return UNITS[n]
  if (n < 1000) return below1000(n)
  const th = Math.floor(n / 1000)
  const r = n % 1000
  const head = th === 1 ? 'mil' : `${below1000(th)} mil`
  if (!r) return head
  // "e" antes do resto quando ele é < 100 ou centena redonda
  const joiner = r < 100 || r % 100 === 0 ? ' e ' : ' '
  return head + joiner + below1000(r)
}

/** "Aos vinte e dois dias do mês de novembro do ano de dois mil e vinte e seis". */
export function dateInWords(date?: string): string {
  const ymd = toCalendarYMD(date)
  if (!ymd) return '[data]'
  const [y, m, d] = ymd.split('-').map(Number)
  const day = d === 1 ? 'Ao primeiro dia' : `Aos ${numberToWords(d)} dias`
  return `${day} do mês de ${MONTH_NAMES[m - 1].toLowerCase()} do ano de ${numberToWords(y)}`
}

/** "19h30" a partir de "19:30". */
export function timeText(hhmm?: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim())
  if (!m) return hhmm?.trim() || '[horário]'
  return m[2] === '00' ? `${Number(m[1])}h` : `${Number(m[1])}h${m[2]}`
}

export function dateNumeric(date?: string): string {
  const ymd = toCalendarYMD(date)
  if (!ymd) return '[data]'
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

/* ---------------- a ata congelada ---------------- */

export interface AtaPerson {
  id: string
  name: string
  gender: Person['gender']
  qualification: string
  missing: QualificationField[]
}

export interface AtaItem {
  order: number
  kind: AssemblyItemKind
  title: string
  description: string
  seats: number
  term_start: string
  term_end: string
  method: VoteMethod | ''
  majority: Majority | ''
  voters: number
  votes_yes: number
  votes_no: number
  votes_abstain: number
  votes_blank: number
  votes_null: number
  approved: boolean
  result_note: string
  office_date: string
  candidates: { name: string; votes: number; elected: boolean; person: AtaPerson }[]
}

/** Tudo o que a ata e os outros papéis usam, copiado no momento de finalizar. */
export interface AtaSnapshot {
  church: { name: string; cnpj: string; address: string; city: string }
  assembly: {
    title: string
    kind: AssemblyKind | ''
    date: string
    place: string
    first_call: string
    second_call: string
    call_date: string
    call_means: string
    agenda: string
    opened_on: CallOpened | ''
    started_at: string
    ended_at: string
    notes: string
    statute_note: string
    quorum_first: QuorumRule | ''
    quorum_second: QuorumRule | ''
    quorum_min: number
  }
  president: AtaPerson | null
  secretary: AtaPerson | null
  eligible: number
  presentVoters: number
  presentTotal: number
  attendees: { name: string; voter: boolean }[]
  items: AtaItem[]
  generated_at: string
}

export interface SnapshotInput {
  church: { name: string; doc_cnpj?: string; doc_address?: string; doc_city?: string }
  assembly: Assembly
  items: AssemblyItem[]
  candidates: AssemblyCandidate[]
  attendees: AssemblyAttendee[]
  people: Person[]
  now?: string
}

function ataPerson(p: Person | undefined): AtaPerson | null {
  if (!p) return null
  return { id: p.id, name: p.name, gender: p.gender || '', qualification: qualificationText(p), missing: missingQualification(p) }
}

export function buildSnapshot(input: SnapshotInput): AtaSnapshot {
  const { church, assembly: a, items, candidates, attendees, people } = input
  const byId = new Map(people.map((p) => [p.id, p]))
  const eligible = people.filter((p) => isEligibleVoter(p, a)).length
  const present = attendees.filter((x) => byId.has(x.person_id))
  const ymd = (d?: string) => toCalendarYMD(d) || ''
  return {
    church: {
      name: church.name,
      cnpj: church.doc_cnpj || '',
      address: church.doc_address || '',
      city: church.doc_city || '',
    },
    assembly: {
      title: a.title,
      kind: a.kind || '',
      date: ymd(a.date),
      place: a.place || '',
      first_call: a.first_call || '',
      second_call: a.second_call || '',
      call_date: ymd(a.call_date),
      call_means: a.call_means || '',
      agenda: a.agenda || '',
      opened_on: a.opened_on || '',
      started_at: a.started_at || '',
      ended_at: a.ended_at || '',
      notes: a.notes || '',
      statute_note: a.statute_note || '',
      quorum_first: a.quorum_first || '',
      quorum_second: a.quorum_second || '',
      quorum_min: a.quorum_min || 0,
    },
    president: ataPerson(byId.get(a.president_id || '')),
    secretary: ataPerson(byId.get(a.secretary_id || '')),
    eligible,
    presentVoters: present.filter((x) => x.voter).length,
    presentTotal: present.length,
    attendees: present
      .map((x) => ({ name: byId.get(x.person_id)!.name, voter: x.voter }))
      .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
    items: [...items]
      .sort((x, y) => (x.order || 0) - (y.order || 0))
      .map((it, i) => ({
        order: i + 1,
        kind: it.kind,
        title: it.title,
        description: it.description || '',
        seats: it.seats || 1,
        term_start: ymd(it.term_start),
        term_end: ymd(it.term_end),
        method: it.method || '',
        majority: it.majority || '',
        voters: it.voters || 0,
        votes_yes: it.votes_yes || 0,
        votes_no: it.votes_no || 0,
        votes_abstain: it.votes_abstain || 0,
        votes_blank: it.votes_blank || 0,
        votes_null: it.votes_null || 0,
        approved: !!it.approved,
        result_note: it.result_note || '',
        office_date: ymd(it.office_date),
        candidates: candidates
          .filter((c) => c.item_id === it.id && byId.has(c.person_id))
          .sort((x, y) => (y.votes || 0) - (x.votes || 0) || (x.order || 0) - (y.order || 0))
          .map((c) => ({
            name: byId.get(c.person_id)!.name,
            votes: c.votes || 0,
            elected: !!c.elected,
            person: ataPerson(byId.get(c.person_id))!,
          })),
      })),
    generated_at: input.now || new Date().toISOString(),
  }
}

/** Quem a ata declara eleito ou reconduzido, com o cargo e o mandato. */
export function electedList(s: AtaSnapshot) {
  const out: { office: string; person: AtaPerson; term_start: string; term_end: string; office_date: string }[] = []
  for (const it of s.items) {
    if (it.kind === 'DELIBERACAO') continue
    const chosen =
      it.kind === 'REFERENDO' ? (it.approved ? it.candidates : []) : it.candidates.filter((c) => c.elected)
    for (const c of chosen)
      out.push({
        office: it.title,
        person: c.person,
        term_start: it.term_start,
        term_end: it.term_end,
        office_date: it.office_date,
      })
  }
  return out
}

/** Problemas que impedem levar a ata ao cartório (aparecem antes de finalizar). */
export function ataProblems(s: AtaSnapshot): string[] {
  const out: string[] = []
  if (!s.church.cnpj) out.push('Falta o CNPJ da igreja (Membros > Documentos > dados da igreja).')
  if (!s.church.address) out.push('Falta o endereço da sede da igreja.')
  if (!s.president) out.push('Escolha quem presidiu a assembleia.')
  if (!s.secretary) out.push('Escolha quem secretariou a assembleia.')
  if (!s.assembly.date) out.push('Falta a data da assembleia.')
  if (!s.assembly.opened_on) out.push('Marque se a assembleia abriu em 1ª ou 2ª convocação.')
  if (s.presentTotal === 0) out.push('A lista de presença está vazia.')
  for (const it of s.items) {
    if (it.kind !== 'DELIBERACAO' && (!it.term_start || !it.term_end))
      out.push(`${it.title}: falta o início e o fim do mandato.`)
    if (it.kind === 'ELEICAO' && !it.candidates.some((c) => c.elected))
      out.push(`${it.title}: ninguém marcado como eleito.`)
  }
  for (const e of electedList(s)) {
    if (e.person.missing.length)
      out.push(`${e.person.name}: falta ${e.person.missing.join(', ')} na ficha.`)
  }
  return out
}

function voteSummary(it: AtaItem): string {
  if (it.method === 'ACLAMACAO') return 'por aclamação'
  const extras = [
    it.votes_blank ? `${it.votes_blank} ${it.votes_blank === 1 ? 'voto em branco' : 'votos em branco'}` : '',
    it.votes_null ? `${it.votes_null} ${it.votes_null === 1 ? 'voto nulo' : 'votos nulos'}` : '',
  ].filter(Boolean)
  if (it.kind === 'ELEICAO') {
    const c = it.candidates
      .map((x) => `${x.name}, ${x.votes} ${x.votes === 1 ? 'voto' : 'votos'}`)
      .join('; ')
    return `com o seguinte resultado: ${[c, ...extras].filter(Boolean).join('; ')}`
  }
  const parts = [
    `${it.votes_yes} ${it.votes_yes === 1 ? 'voto favorável' : 'votos favoráveis'}`,
    `${it.votes_no} ${it.votes_no === 1 ? 'voto contrário' : 'votos contrários'}`,
    it.votes_abstain ? `${it.votes_abstain} ${it.votes_abstain === 1 ? 'abstenção' : 'abstenções'}` : '',
    ...extras,
  ].filter(Boolean)
  return `com ${parts.join(', ')}`
}

function termText(it: { term_start: string; term_end: string }): string {
  return `para o mandato de ${dateNumeric(it.term_start)} a ${dateNumeric(it.term_end)}`
}

/** Parágrafos da ata. */
export function ataParagraphs(s: AtaSnapshot): string[] {
  const a = s.assembly
  const kind = a.kind ? ASSEMBLY_KIND_LABELS[a.kind].toLowerCase() : ''
  const p: string[] = []
  const pres = s.president
  const sec = s.secretary
  const time = timeText(a.opened_on === 'SEGUNDA' ? a.second_call : a.first_call)
  const call = a.opened_on === 'SEGUNDA' ? 'em segunda convocação' : 'em primeira convocação'
  p.push(
    `${dateInWords(a.date)}, às ${time}, ${a.place ? `em ${a.place}` : 'na sede da igreja'}, reuniram-se em Assembleia Geral ${kind} os membros da ${s.church.name}${s.church.cnpj ? `, inscrita no CNPJ sob o nº ${s.church.cnpj}` : ''}${s.church.address ? `, com sede em ${s.church.address}` : ''}, ${call}, ${a.call_date ? `conforme edital de convocação de ${dateNumeric(a.call_date)}${a.call_means ? `, ${a.call_means}` : ''}` : 'conforme edital de convocação'}, nos termos do estatuto.`,
  )
  const firstRule =
    a.opened_on !== 'SEGUNDA' && a.quorum_first ? QUORUM_LABELS[a.quorum_first].toLowerCase() : ''
  const quorumNote = [firstRule, a.statute_note].filter(Boolean).join(', ')
  p.push(
    `Estavam presentes ${s.presentTotal} ${s.presentTotal === 1 ? 'pessoa' : 'pessoas'}, das quais ${s.presentVoters} ${s.presentVoters === 1 ? 'membro com direito a voto' : 'membros com direito a voto'}, de um total de ${s.eligible} ${s.eligible === 1 ? 'membro votante' : 'membros votantes'}, conforme lista de presença anexa, verificando-se o quórum exigido pelo estatuto${a.opened_on === 'SEGUNDA' ? ' para a segunda convocação' : ''}${quorumNote ? ` (${quorumNote})` : ''}.`,
  )
  p.push(
    `Assumiu a presidência dos trabalhos ${pres ? pres.name : '[presidente]'}, que convidou ${sec ? sec.name : '[secretário]'} para secretariar a assembleia e lavrar a presente ata. Declarada aberta a sessão, foi lida a ordem do dia: ${a.agenda?.trim() ? a.agenda.trim().replace(/\s*\n+\s*/g, '; ') : s.items.map((it) => it.title).join('; ')}.`,
  )
  for (const it of s.items) {
    const head = `${it.order}) ${it.title}.`
    const desc = it.description ? ` ${it.description.trim()}` : ''
    const accl = it.method === 'ACLAMACAO'
    const method = accl
      ? ' A votação se deu por aclamação'
      : it.method
        ? ` A votação se deu ${it.method === 'ESCRUTINIO_SECRETO' ? 'por escrutínio secreto' : 'nominalmente'}, ${voteSummary(it)}`
        : ` A matéria foi votada, ${voteSummary(it)}`
    if (it.kind === 'ELEICAO') {
      const cands = it.candidates.map((c) => c.name).join(', ')
      const elected = it.candidates.filter((c) => c.elected)
      p.push(
        `${head}${desc} Para ${it.seats > 1 ? `${it.seats} vagas` : 'o cargo'} ${it.seats > 1 ? `de ${it.title}` : ''} ${it.candidates.length === 1 ? 'apresentou-se a candidatura de' : 'apresentaram-se as candidaturas de'} ${cands || '[candidatos]'}.${method}. ${elected.length ? `${elected.length === 1 ? `Foi ${gw(elected[0].person, 'declarado eleito', 'declarada eleita')}` : 'Foram declarados eleitos'} ${elected.map((c) => c.name).join(', ')}, ${termText(it)}.` : 'Nenhum candidato foi declarado eleito.'}${it.result_note ? ` ${it.result_note.trim()}` : ''}`.replace(/\s+/g, ' '),
      )
    } else if (it.kind === 'REFERENDO') {
      const who = it.candidates.map((c) => c.name).join(', ') || '[nome]'
      p.push(
        `${head}${desc} Foi submetida à assembleia a recondução de ${who} ao cargo de ${it.title}.${method}. ${it.approved ? `A recondução foi aprovada, ${termText(it)}.` : 'A recondução não foi aprovada.'}${it.result_note ? ` ${it.result_note.trim()}` : ''}`.replace(/\s+/g, ' '),
      )
    } else {
      p.push(
        `${head}${desc}${method}. A proposta foi ${it.approved ? 'aprovada' : 'rejeitada'}.${it.result_note ? ` ${it.result_note.trim()}` : ''}`.replace(/\s+/g, ' '),
      )
    }
  }
  const elected = electedList(s)
  if (elected.length) {
    const postNow = elected.filter((e) => e.office_date && e.office_date === a.date)
    p.push(
      `Qualificação dos eleitos e reconduzidos: ${elected.map((e) => `${e.office}: ${e.person.qualification}`).join('; ')}.`,
    )
    if (postNow.length)
      p.push(
        `Ato contínuo, ${postNow.length === 1 ? 'o eleito foi empossado' : 'os eleitos foram empossados'} em seus cargos, conforme termo de posse anexo, ${postNow.length === 1 ? 'declarando' : 'declarando cada um'} não estar impedido de exercer a administração da entidade.`,
      )
  }
  if (a.notes?.trim()) p.push(a.notes.trim().replace(/\s*\n+\s*/g, ' '))
  p.push(
    `Nada mais havendo a tratar, o presidente agradeceu a presença de todos e encerrou a assembleia${a.ended_at ? ` às ${timeText(a.ended_at)}` : ''}, e eu, ${sec ? sec.name : '[secretário]'}, ${sec ? gw(sec, 'secretário', 'secretária') : 'secretário(a)'}, lavrei a presente ata, que, lida e aprovada, vai assinada por mim e pelo presidente.`,
  )
  return p
}

/** Texto do edital de convocação. */
export function editalParagraphs(s: AtaSnapshot, presidentName: string): string[] {
  const a = s.assembly
  const kind = a.kind ? ASSEMBLY_KIND_LABELS[a.kind].toLowerCase() : ''
  const items = s.items.length ? s.items.map((it, i) => `${i + 1}) ${it.title}`) : []
  const agenda = a.agenda?.trim() ? a.agenda.trim().split(/\n+/) : items
  return [
    `${presidentName || 'O presidente'}, no uso das atribuições que lhe confere o estatuto, convoca os membros da ${s.church.name}${s.church.cnpj ? `, CNPJ ${s.church.cnpj}` : ''}, para a Assembleia Geral ${kind} que se realizará no dia ${dateNumeric(a.date)}, ${a.place ? `em ${a.place}` : 'na sede da igreja'}, em primeira convocação às ${timeText(a.first_call)}${a.second_call ? ` e em segunda convocação às ${timeText(a.second_call)}` : ''}, para deliberar sobre a seguinte ordem do dia:`,
    ...agenda.map((l) => l.trim()).filter(Boolean),
    a.quorum_first
      ? `A assembleia será instalada em primeira convocação com ${QUORUM_LABELS[a.quorum_first].toLowerCase()}${a.quorum_second ? ` e, em segunda convocação, com ${QUORUM_LABELS[a.quorum_second].toLowerCase()}` : ''}${a.quorum_min && (a.quorum_first === 'NUMERO' || a.quorum_second === 'NUMERO') ? ` (mínimo de ${a.quorum_min})` : ''}, conforme o estatuto.`
      : 'A assembleia será instalada com o quórum previsto no estatuto.',
  ]
}

/** Termo de posse: um parágrafo por empossado. */
export function posseParagraphs(s: AtaSnapshot): string[] {
  return electedList(s).map(
    (e) =>
      `${e.person.qualification}, ${gw(e.person, 'eleito', 'eleita')} para o cargo de ${e.office} na Assembleia Geral de ${dateNumeric(s.assembly.date)}, toma posse ${e.office_date ? `em ${dateNumeric(e.office_date)}` : 'nesta data'}, ${termText(e)}, declarando, sob as penas da lei, não estar ${gw(e.person, 'impedido', 'impedida')} de exercer a administração da entidade.`,
  )
}

export function requerimentoParagraphs(s: AtaSnapshot): string[] {
  const pres = s.president
  return [
    `${pres ? pres.qualification : '[qualificação do representante legal]'}, na qualidade de representante legal da ${s.church.name}${s.church.cnpj ? `, CNPJ ${s.church.cnpj}` : ''}${s.church.address ? `, com sede em ${s.church.address}` : ''}, vem requerer a Vossa Senhoria o registro/averbação da ata da Assembleia Geral ${s.assembly.kind ? ASSEMBLY_KIND_LABELS[s.assembly.kind].toLowerCase() + ' ' : ''}realizada em ${dateNumeric(s.assembly.date)}, com a eleição e posse de sua diretoria, nos termos do art. 121 da Lei nº 6.015/1973.`,
    'Seguem, em duas vias: ata da assembleia, edital de convocação, lista de presença, termo de posse e cópia dos documentos de identificação dos eleitos. Declara que foram observados os requisitos legais e estatutários de convocação, instalação e quórum.',
    'Nestes termos, pede deferimento.',
  ]
}
