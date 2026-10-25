/**
 * Regras puras da Membresia: rótulos, filtros, idade e aniversários.
 * Datas de calendário seguem dateUtils (sem deslocamento de fuso).
 */
import type {
  AdmissionType,
  MaritalStatus,
  Person,
  PersonEvent,
  PersonEventKind,
  PersonRelation,
  PersonSkill,
  PersonStatus,
  RelationKind,
} from '@/types'
import { parseCalendarDate } from '@/lib/dateUtils'

/** Congregações sugeridas no cadastro (o campo aceita outros nomes). */
export const CONGREGATIONS = ['Aldeia', 'Diamante']

export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  MEMBRO: 'Membro',
  CONGREGADO: 'Congregado',
  VISITANTE: 'Visitante',
  AFASTADO: 'Afastado',
  TRANSFERIDO: 'Transferido',
  FALECIDO: 'Falecido',
}

export const PERSON_STATUS_ORDER: PersonStatus[] = [
  'MEMBRO',
  'CONGREGADO',
  'VISITANTE',
  'AFASTADO',
  'TRANSFERIDO',
  'FALECIDO',
]

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
}

export const ADMISSION_TYPE_LABELS: Record<AdmissionType, string> = {
  BATISMO: 'Batismo',
  TRANSFERENCIA: 'Transferência',
  ACLAMACAO: 'Aclamação',
  RECONCILIACAO: 'Reconciliação',
}

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/** Situações que contam como pessoas ativas na igreja (aparecem nos aniversários). */
export function isActiveStatus(status: PersonStatus): boolean {
  return status === 'MEMBRO' || status === 'CONGREGADO' || status === 'VISITANTE'
}

/** Idade completa em `todayYMD` ("YYYY-MM-DD"), ou null sem data de nascimento. */
export function ageOn(birthDate: string | undefined, todayYMD: string): number | null {
  const birth = parseCalendarDate(birthDate)
  const today = parseCalendarDate(todayYMD)
  if (!birth || !today) return null
  let age = today.year - birth.year
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) {
    age -= 1
  }
  return age >= 0 ? age : null
}

export interface PeopleFilter {
  search?: string
  status?: PersonStatus | 'TODOS'
  congregation?: string
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function filterPeople(people: Person[], filter: PeopleFilter): Person[] {
  const query = normalize(filter.search?.trim() || '')
  const digits = query.replace(/\D/g, '')
  return people.filter((p) => {
    if (filter.status && filter.status !== 'TODOS' && p.status !== filter.status) return false
    if (filter.congregation && filter.congregation !== 'TODAS') {
      if ((p.congregation || '') !== filter.congregation) return false
    }
    if (!query) return true
    if (normalize(p.name).includes(query)) return true
    if (p.email && normalize(p.email).includes(query)) return true
    if (digits && p.phone && p.phone.replace(/\D/g, '').includes(digits)) return true
    return false
  })
}

export type CelebrationKind = 'NASCIMENTO' | 'CASAMENTO'

export interface Celebration {
  person: Person
  kind: CelebrationKind
  month: number
  day: number
  /** Anos completados nesta data (idade ou anos de casados), se o ano for conhecido. */
  years: number | null
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function celebrationsOf(person: Person): Array<Omit<Celebration, 'years'> & { since: number }> {
  const out: Array<Omit<Celebration, 'years'> & { since: number }> = []
  const birth = parseCalendarDate(person.birth_date)
  if (birth) {
    out.push({ person, kind: 'NASCIMENTO', month: birth.month, day: birth.day, since: birth.year })
  }
  const wedding = parseCalendarDate(person.wedding_date)
  if (wedding) {
    out.push({
      person,
      kind: 'CASAMENTO',
      month: wedding.month,
      day: wedding.day,
      since: wedding.year,
    })
  }
  return out
}

/** Aniversários (nascimento e casamento) de um mês, em ordem de dia. */
export function celebrationsInMonth(
  people: Person[],
  month: number,
  year: number,
): Celebration[] {
  return people
    .filter((p) => isActiveStatus(p.status))
    .flatMap(celebrationsOf)
    .filter((c) => c.month === month)
    .map(({ since, ...c }) => ({ ...c, years: year - since >= 0 ? year - since : null }))
    .sort((a, b) => a.day - b.day || a.person.name.localeCompare(b.person.name, 'pt-BR'))
}

/**
 * Próximos aniversários a partir de hoje (inclusive), dentro de `days` dias.
 * Quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos.
 */
export function upcomingCelebrations(
  people: Person[],
  todayYMD: string,
  days: number,
): Array<Celebration & { inDays: number; date: string }> {
  const today = parseCalendarDate(todayYMD)
  if (!today) return []
  const start = Date.UTC(today.year, today.month - 1, today.day)
  const DAY = 86400000

  const result: Array<Celebration & { inDays: number; date: string }> = []
  for (const c of people.filter((p) => isActiveStatus(p.status)).flatMap(celebrationsOf)) {
    for (const year of [today.year, today.year + 1]) {
      const day = c.month === 2 && c.day === 29 && !isLeapYear(year) ? 28 : c.day
      const time = Date.UTC(year, c.month - 1, day)
      const inDays = Math.round((time - start) / DAY)
      if (inDays < 0 || inDays > days) continue
      const { since, ...rest } = c
      result.push({
        ...rest,
        day,
        years: year - since >= 0 ? year - since : null,
        inDays,
        date: `${year}-${String(c.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      })
      break
    }
  }
  return result.sort(
    (a, b) => a.inDays - b.inDays || a.person.name.localeCompare(b.person.name, 'pt-BR'),
  )
}

/** Contagem por situação e por congregação (para os cartões de resumo). */
export function summarizePeople(people: Person[]) {
  const byStatus = Object.fromEntries(PERSON_STATUS_ORDER.map((s) => [s, 0])) as Record<
    PersonStatus,
    number
  >
  const byCongregation: Record<string, number> = {}
  for (const p of people) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1
    if (isActiveStatus(p.status)) {
      const key = p.congregation || 'Sem congregação'
      byCongregation[key] = (byCongregation[key] || 0) + 1
    }
  }
  return { total: people.length, byStatus, byCongregation }
}

// ---------- Fase 2: perfil, família, habilidades e painel ----------

export const SKILL_LABELS: Record<PersonSkill, string> = {
  CANTA: 'Canta',
  VIOLAO: 'Violão',
  GUITARRA: 'Guitarra',
  BAIXO: 'Baixo',
  TECLADO: 'Teclado',
  BATERIA: 'Bateria',
  PERCUSSAO: 'Percussão',
  SOPRO: 'Sopro',
  SOM: 'Opera som',
  LUZ: 'Opera luz',
  PROJECAO: 'Projeção',
  VIDEO_FOTO: 'Vídeo e foto',
  RECEPCAO: 'Recepção',
  INFANTIL: 'Ministério infantil',
  ENSINO: 'Ensino / EBD',
  COZINHA: 'Cozinha',
}

export const SKILL_ORDER = Object.keys(SKILL_LABELS) as PersonSkill[]

/** Motivos sugeridos ao mudar a situação (viram o título do registro na linha do tempo). */
export const STATUS_CHANGE_REASONS = {
  entrada: ['Admissão por batismo', 'Transferência recebida', 'Aclamação', 'Reconciliação'],
  saida: [
    'Transferência enviada',
    'Desligamento a pedido',
    'Afastamento',
    'Disciplina',
    'Falecimento',
  ],
  outro: ['Começou a frequentar', 'Correção de cadastro', 'Outro motivo'],
}

/** Grupo de motivos que faz sentido para a mudança de situação. */
export function reasonGroupFor(
  from: PersonStatus | '' | undefined,
  to: PersonStatus,
): keyof typeof STATUS_CHANGE_REASONS {
  if (to === 'MEMBRO' && from !== 'MEMBRO') return 'entrada'
  if (from === 'MEMBRO' && to !== 'MEMBRO') return 'saida'
  return 'outro'
}

export const EVENT_KIND_LABELS: Record<Exclude<PersonEventKind, 'SITUACAO'>, string> = {
  CONTATO: 'Contato',
  VISITA: 'Visita',
  CARGO: 'Cargo / nomeação',
  NOTA: 'Anotação',
}

// ---------- Família ----------

const INVERSE_KIND: Record<RelationKind, RelationKind> = {
  CONJUGE: 'CONJUGE',
  FILHO: 'PAI_MAE',
  PAI_MAE: 'FILHO',
  IRMAO: 'IRMAO',
  OUTRO: 'OUTRO',
}

export const RELATION_KIND_LABELS: Record<RelationKind, string> = {
  CONJUGE: 'Cônjuge',
  FILHO: 'Filho(a)',
  PAI_MAE: 'Pai / mãe',
  IRMAO: 'Irmão(ã)',
  OUTRO: 'Outro parente',
}

/** Rótulo do parente conforme o sexo dele (ex.: FILHO + F = "Filha"). */
export function relativeLabel(kind: RelationKind, gender?: string): string {
  const f = gender === 'F'
  const m = gender === 'M'
  switch (kind) {
    case 'CONJUGE':
      return f ? 'Esposa' : m ? 'Marido' : 'Cônjuge'
    case 'FILHO':
      return f ? 'Filha' : m ? 'Filho' : 'Filho(a)'
    case 'PAI_MAE':
      return f ? 'Mãe' : m ? 'Pai' : 'Pai / mãe'
    case 'IRMAO':
      return f ? 'Irmã' : m ? 'Irmão' : 'Irmão(ã)'
    default:
      return 'Parente'
  }
}

export interface FamilyMember {
  relation: PersonRelation
  relative: Person
  /** O que o parente é da pessoa do perfil. */
  kind: RelationKind
  label: string
}

const FAMILY_ORDER: RelationKind[] = ['CONJUGE', 'PAI_MAE', 'FILHO', 'IRMAO', 'OUTRO']

/**
 * Família de uma pessoa a partir dos vínculos gravados em um só sentido:
 * "relative_id é <kind> de person_id". Do outro lado, o tipo é invertido.
 */
export function familyOf(
  personId: string,
  relations: PersonRelation[],
  peopleById: Map<string, Person>,
): FamilyMember[] {
  const out: FamilyMember[] = []
  for (const r of relations) {
    let relativeId: string
    let kind: RelationKind
    if (r.person_id === personId) {
      relativeId = r.relative_id
      kind = r.kind
    } else if (r.relative_id === personId) {
      relativeId = r.person_id
      kind = INVERSE_KIND[r.kind]
    } else continue
    const relative = peopleById.get(relativeId)
    if (!relative) continue
    out.push({ relation: r, relative, kind, label: relativeLabel(kind, relative.gender) })
  }
  return out.sort(
    (a, b) =>
      FAMILY_ORDER.indexOf(a.kind) - FAMILY_ORDER.indexOf(b.kind) ||
      a.relative.name.localeCompare(b.relative.name, 'pt-BR'),
  )
}

/** true se as duas fichas já estão ligadas (em qualquer sentido). */
export function areRelated(a: string, b: string, relations: PersonRelation[]): boolean {
  return relations.some(
    (r) => (r.person_id === a && r.relative_id === b) || (r.person_id === b && r.relative_id === a),
  )
}

// ---------- Ficha ----------

/** Anos completos entre uma data e hoje (tempo de igreja, de casados…). */
export function yearsSince(date: string | undefined, todayYMD: string): number | null {
  return ageOn(date, todayYMD)
}

/** Dados essenciais que faltam na ficha (viram a lista de "fichas incompletas"). */
export function missingEssentials(p: Person): string[] {
  const missing: string[] = []
  if (!p.birth_date) missing.push('nascimento')
  if (!p.phone) missing.push('telefone')
  if (p.status === 'MEMBRO' && !p.baptism_date) missing.push('batismo')
  return missing
}

/** Percentual de preenchimento da ficha (campos úteis para a secretaria). */
export function profileCompleteness(p: Person): number {
  const checks: boolean[] = [
    !!p.photo,
    !!p.birth_date,
    !!p.gender,
    !!p.marital_status,
    !!p.phone,
    !!p.email,
    !!p.address,
    !!(p.neighborhood || p.city),
    !!p.congregation,
  ]
  if (p.status === 'MEMBRO') checks.push(!!p.baptism_date, !!p.admission_date)
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

// ---------- Linha do tempo ----------

export type TimelineKind =
  | PersonEventKind
  | 'CONVERSAO'
  | 'BATISMO'
  | 'ADMISSAO'
  | 'CASAMENTO'
  | 'ESCALA'

export interface TimelineEntry {
  key: string
  date: string // YYYY-MM-DD
  kind: TimelineKind
  title: string
  description?: string
  /** Presente quando o registro está em people_events (pode ser apagado). */
  eventId?: string
}

export interface ScaleEntry {
  id: string
  date: string
  eventTitle: string
  role?: string
  status?: string
}

function ymd(date?: string): string {
  const d = parseCalendarDate(date)
  if (!d) return ''
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

/**
 * Junta numa só lista, da mais recente para a mais antiga: os registros gravados,
 * as datas importantes da ficha e as escalas (quando a pessoa tem login).
 */
export function buildTimeline(
  person: Person,
  events: PersonEvent[],
  scales: ScaleEntry[] = [],
): TimelineEntry[] {
  const out: TimelineEntry[] = []
  for (const e of events) {
    const date = ymd(e.date)
    if (!date) continue
    let description = e.description || ''
    if (e.kind === 'SITUACAO' && e.to_status) {
      const from = e.from_status ? PERSON_STATUS_LABELS[e.from_status] : ''
      const change = from
        ? `${from} → ${PERSON_STATUS_LABELS[e.to_status]}`
        : PERSON_STATUS_LABELS[e.to_status]
      description = description ? `${change} · ${description}` : change
    }
    out.push({ key: `e-${e.id}`, date, kind: e.kind, title: e.title, description, eventId: e.id })
  }

  const memberChangeOn = new Set(
    events.filter((e) => e.kind === 'SITUACAO' && e.to_status === 'MEMBRO').map((e) => ymd(e.date)),
  )
  const derived: Array<[string | undefined, TimelineKind, string, string?]> = [
    [person.conversion_date, 'CONVERSAO', 'Conversão'],
    [person.baptism_date, 'BATISMO', 'Batismo'],
    [
      person.admission_date,
      'ADMISSAO',
      'Admissão como membro',
      person.admission_type ? `Por ${ADMISSION_TYPE_LABELS[person.admission_type].toLowerCase()}` : undefined,
    ],
    [person.wedding_date, 'CASAMENTO', 'Casamento'],
  ]
  for (const [date, kind, title, description] of derived) {
    const d = ymd(date)
    if (!d) continue
    if (kind === 'ADMISSAO' && memberChangeOn.has(d)) continue
    out.push({ key: `d-${kind}`, date: d, kind, title, description })
  }

  for (const s of scales) {
    const d = ymd(s.date)
    if (!d) continue
    out.push({
      key: `s-${s.id}`,
      date: d,
      kind: 'ESCALA',
      title: `Escalado(a) em ${s.eventTitle}`,
      description: [s.role, s.status].filter(Boolean).join(' · ') || undefined,
    })
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key.localeCompare(b.key)))
}

// ---------- Painel ----------

export interface Bucket {
  label: string
  count: number
  ids: string[]
}

function bucketize(
  people: Person[],
  ranges: Array<[string, number, number]>,
  valueOf: (p: Person) => number | null,
  emptyLabel: string,
): Bucket[] {
  const buckets: Bucket[] = ranges.map(([label]) => ({ label, count: 0, ids: [] }))
  const empty: Bucket = { label: emptyLabel, count: 0, ids: [] }
  for (const p of people) {
    const v = valueOf(p)
    const idx = v === null ? -1 : ranges.findIndex(([, min, max]) => v >= min && v <= max)
    const b = idx >= 0 ? buckets[idx] : empty
    b.count += 1
    b.ids.push(p.id)
  }
  return empty.count ? [...buckets, empty] : buckets
}

export function ageBuckets(people: Person[], todayYMD: string): Bucket[] {
  return bucketize(
    people,
    [
      ['Crianças (0–11)', 0, 11],
      ['Adolescentes (12–17)', 12, 17],
      ['Jovens (18–29)', 18, 29],
      ['Adultos (30–59)', 30, 59],
      ['Idosos (60+)', 60, 200],
    ],
    (p) => ageOn(p.birth_date, todayYMD),
    'Sem nascimento',
  )
}

export function tenureBuckets(people: Person[], todayYMD: string): Bucket[] {
  return bucketize(
    people,
    [
      ['Menos de 1 ano', 0, 0],
      ['1 a 4 anos', 1, 4],
      ['5 a 9 anos', 5, 9],
      ['10 a 19 anos', 10, 19],
      ['20 anos ou mais', 20, 200],
    ],
    (p) => yearsSince(p.admission_date, todayYMD),
    'Sem data de admissão',
  )
}

export function genderBuckets(people: Person[]): Bucket[] {
  return bucketize(
    people,
    [
      ['Mulheres', 1, 1],
      ['Homens', 2, 2],
    ],
    (p) => (p.gender === 'F' ? 1 : p.gender === 'M' ? 2 : null),
    'Não informado',
  )
}

export interface Movement {
  reason: string
  count: number
}

/** Entradas e saídas do rol de membros no ano, agrupadas pelo motivo. */
export function membershipMovements(
  events: PersonEvent[],
  year: number,
): { entradas: Movement[]; saidas: Movement[] } {
  const entradas = new Map<string, number>()
  const saidas = new Map<string, number>()
  for (const e of events) {
    if (e.kind !== 'SITUACAO' || !e.to_status) continue
    if (parseCalendarDate(e.date)?.year !== year) continue
    const group = reasonGroupFor(e.from_status, e.to_status)
    if (group === 'outro') continue
    const map = group === 'entrada' ? entradas : saidas
    map.set(e.title, (map.get(e.title) || 0) + 1)
  }
  const toList = (m: Map<string, number>) =>
    Array.from(m, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
  return { entradas: toList(entradas), saidas: toList(saidas) }
}

/** Pessoas cadastradas nos últimos `days` dias (pela data de cadastro no sistema). */
export function recentlyAdded(people: Person[], todayYMD: string, days: number): Person[] {
  const today = parseCalendarDate(todayYMD)
  if (!today) return []
  const start = Date.UTC(today.year, today.month - 1, today.day) - days * 86400000
  return people.filter((p) => {
    const c = parseCalendarDate(p.created)
    return !!c && Date.UTC(c.year, c.month - 1, c.day) >= start
  })
}
