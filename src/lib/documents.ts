/**
 * Textos dos documentos da membresia: carta de transferência, carta de
 * recomendação e certificado de batismo. Ficam aqui (e não nas telas) para
 * poder testar a concordância e as datas.
 */
import type { Church, Person } from '@/types'
import { toCalendarYMD } from '@/lib/dateUtils'
import { MONTH_NAMES } from '@/lib/membership'

export type DocumentKind = 'carteirinha' | 'transferencia' | 'recomendacao' | 'batismo'

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  carteirinha: 'Carteirinha de membro',
  transferencia: 'Carta de transferência',
  recomendacao: 'Carta de recomendação',
  batismo: 'Certificado de batismo',
}

/** "25 de outubro de 2026" (vazio se não houver data). */
export function longDate(date?: string): string {
  const ymd = toCalendarYMD(date)
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} de ${MONTH_NAMES[m - 1].toLowerCase()} de ${y}`
}

/** "o irmão" / "a irmã"; sem sexo informado, "o(a) irmão(ã)". */
export function brother(p: Pick<Person, 'gender'>): string {
  if (p.gender === 'F') return 'a irmã'
  if (p.gender === 'M') return 'o irmão'
  return 'o(a) irmão(ã)'
}

/** Escolhe a palavra pelo sexo da ficha; sem sexo informado usa a forma neutra. */
function g(p: Pick<Person, 'gender'>, m: string, f: string, n: string): string {
  return p.gender === 'F' ? f : p.gender === 'M' ? m : n
}

function sinceClause(p: Person): string {
  const admission = longDate(p.admission_date)
  const baptism = longDate(p.baptism_date)
  const parts = [admission ? `membro desta igreja desde ${admission}` : 'membro desta igreja']
  if (baptism) parts.push(`${g(p, 'batizado', 'batizada', 'batizado(a)')} em ${baptism}`)
  return parts.join(', ')
}

export interface LetterInput {
  person: Person
  church: Pick<Church, 'name'>
  /** Igreja de destino da transferência (ou a quem se recomenda). */
  destination: string
  /** Motivo ou observação opcional, entra como frase final antes da saudação. */
  extra?: string
}

export function transferLetterBody({ person, church, destination, extra }: LetterInput): string[] {
  const dest = destination.trim() || '[igreja de destino]'
  return [
    `A ${church.name} vem, por meio desta, apresentar ${brother(person)} ${person.name}, ${sinceClause(person)}, que solicitou transferência para a comunhão da ${dest}.`,
    `Declaramos que ${g(person, 'ele', 'ela', 'ele(a)')} se encontra em plena comunhão com esta igreja, nada havendo que desabone sua conduta cristã, e por isso ${g(person, 'o', 'a', 'o(a)')} recomendamos para ser ${g(person, 'recebido', 'recebida', 'recebido(a)')} como membro dessa amada igreja.`,
    ...(extra?.trim() ? [extra.trim()] : []),
    `Ao ${g(person, 'recebê-lo', 'recebê-la', 'recebê-lo(a)')}, pedimos a gentileza de nos comunicar, para que possamos atualizar nosso rol de membros.`,
    'Fraternalmente, em Cristo.',
  ]
}

export function recommendationLetterBody({ person, church, destination, extra }: LetterInput): string[] {
  const to = destination.trim() ? `à ${destination.trim()}` : 'a quem possa interessar'
  return [
    `A ${church.name} recomenda ${to} ${brother(person)} ${person.name}, ${sinceClause(person)}.`,
    'Trata-se de pessoa em plena comunhão com esta igreja, de bom testemunho cristão, a quem pedimos que seja recebida com o amor e a hospitalidade próprios dos irmãos em Cristo.',
    ...(extra?.trim() ? [extra.trim()] : []),
    'Fraternalmente, em Cristo.',
  ]
}

export function baptismCertificateText(person: Person, church: Pick<Church, 'name'>): string {
  const date = longDate(person.baptism_date) || '____ de ______________ de ______'
  const done = g(person, 'batizado', 'batizada', 'batizado(a)')
  return `Certificamos que ${person.name} foi ${done} por imersão, em nome do Pai, do Filho e do Espírito Santo, na ${church.name}, em ${date}, após pública profissão de fé em Jesus Cristo como Senhor e Salvador.`
}

/** "Recife, 25 de outubro de 2026". */
export function placeAndDate(city: string | undefined, todayYMD: string): string {
  const d = longDate(todayYMD)
  return city?.trim() ? `${city.trim()}, ${d}` : d
}
