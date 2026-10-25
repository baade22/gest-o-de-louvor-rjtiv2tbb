/**
 * Regras puras do autocadastro (QR code): rótulos, possíveis duplicados e como a
 * ficha enviada vira (ou completa) uma ficha de membro.
 */
import type { Person, PersonSignup, PersonStatus, SignupRelationship } from '@/types'

export const RELATIONSHIP_LABELS: Record<SignupRelationship, string> = {
  VISITANTE: 'Estou visitando',
  FREQUENTA: 'Frequento a igreja',
  MEMBRO: 'Já sou membro',
}

/** Situação sugerida na aprovação; a secretaria pode trocar. */
export const SUGGESTED_STATUS: Record<SignupRelationship, PersonStatus> = {
  VISITANTE: 'VISITANTE',
  FREQUENTA: 'CONGREGADO',
  MEMBRO: 'MEMBRO',
}

/** Campos que passam da ficha enviada para a ficha de membro. */
const COPIED_FIELDS = [
  'name',
  'birth_date',
  'gender',
  'marital_status',
  'phone',
  'email',
  'address',
  'neighborhood',
  'city',
  'state',
  'zip_code',
  'congregation',
] as const

type CopiedField = (typeof COPIED_FIELDS)[number]

function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Últimos 8 dígitos: ignora DDD, +55 e o 9 extra escrito ou não. */
function phoneKey(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(-8) : ''
}

export type DuplicateReason = 'nome' | 'telefone' | 'e-mail'

export interface DuplicateMatch {
  person: Person
  reasons: DuplicateReason[]
}

/** Fichas que parecem ser a mesma pessoa (mesmo nome, telefone ou e-mail). */
export function findDuplicates(signup: PersonSignup, people: Person[]): DuplicateMatch[] {
  const name = normalizeName(signup.name)
  const phone = phoneKey(signup.phone)
  const email = (signup.email || '').trim().toLowerCase()
  const out: DuplicateMatch[] = []
  for (const p of people) {
    const reasons: DuplicateReason[] = []
    if (name && normalizeName(p.name) === name) reasons.push('nome')
    if (phone && phoneKey(p.phone) === phone) reasons.push('telefone')
    if (email && (p.email || '').trim().toLowerCase() === email) reasons.push('e-mail')
    if (reasons.length) out.push({ person: p, reasons })
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length)
}

/** Dados da nova ficha criada a partir do cadastro aprovado. */
export function signupToPerson(signup: PersonSignup, status: PersonStatus) {
  const data: Partial<Record<CopiedField, string>> = {}
  for (const f of COPIED_FIELDS) data[f] = (signup[f] as string | undefined) || ''
  const lines = [
    signup.how_found && `Como conheceu a igreja: ${signup.how_found}`,
    signup.baptized && 'Disse que já é batizado(a).',
  ].filter(Boolean)
  return {
    ...data,
    church_id: signup.church_id,
    name: signup.name,
    status,
    notes: lines.join('\n'),
  }
}

/**
 * Completa uma ficha existente com o que veio no cadastro, sem apagar nada:
 * só entram os campos que estão vazios na ficha.
 */
export function mergeSignupInto(person: Person, signup: PersonSignup): Partial<Person> {
  const patch: Partial<Record<CopiedField, string>> = {}
  for (const f of COPIED_FIELDS) {
    if (f === 'name') continue
    const incoming = signup[f] as string | undefined
    if (incoming && !person[f]) patch[f] = incoming
  }
  return patch as Partial<Person>
}

/** Chave aleatória para o link do QR code (24 letras e números). */
export function newSignupKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export function signupUrl(key: string, origin = window.location.origin): string {
  return `${origin}/cadastro/${key}`
}
