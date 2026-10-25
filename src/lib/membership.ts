/**
 * Regras puras da Membresia: rótulos, filtros, idade e aniversários.
 * Datas de calendário seguem dateUtils (sem deslocamento de fuso).
 */
import type { AdmissionType, MaritalStatus, Person, PersonStatus } from '@/types'
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
