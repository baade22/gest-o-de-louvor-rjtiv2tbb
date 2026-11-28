// Área do membro no app da igreja: regras puras (sem rede), usadas pelas telas de /igreja/eu.

import type { RelationKind } from '@/types'
import { relativeLabel } from '@/lib/membership'

/** Conta criada pelo código do WhatsApp (sem senha, sem acesso ao LouvorFlow). */
export const MEMBER_EMAIL_DOMAIN = '@membros.invalid'

export function isMemberOnlyAccount(email?: string | null): boolean {
  return !!email && email.toLowerCase().endsWith(MEMBER_EMAIL_DOMAIN)
}

/** Só os números, sem o 55 e sem zero na frente. */
function phoneDigits(v: string): string {
  let d = (v || '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  return d
}

/** Celular com DDD (10 ou 11 números, com ou sem +55)? */
export function isValidPhone(v: string): boolean {
  const d = phoneDigits(v)
  return d.length === 10 || d.length === 11
}

/** Máscara enquanto digita: (81) 99876-5432. */
export function formatPhoneInput(v: string): string {
  const d = phoneDigits(v).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  const cut = rest.length === 9 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`
}

export function isValidCpf(v: string): boolean {
  const c = (v || '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  for (const n of [9, 10]) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += Number(c[i]) * (n + 1 - i)
    if (((sum * 10) % 11) % 10 !== Number(c[n])) return false
  }
  return true
}

export function formatCpfInput(v: string): string {
  const d = (v || '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Primeiro nome, para o "Olá, Pedro". */
export function firstName(name?: string): string {
  return (name || '').trim().split(/\s+/)[0] || ''
}

/** Iniciais para o avatar (primeiro e último nome). */
export function initials(name?: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const a = parts[0][0]
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (a + b).toUpperCase()
}

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  MEMBRO: 'Membro',
  CONGREGADO: 'Congregado',
  VISITANTE: 'Visitante',
  AFASTADO: 'Afastado',
  TRANSFERIDO: 'Transferido',
  FALECIDO: 'Falecido',
}

/** "Esposa · Membro · 9 anos" para a lista da família. */
export function familyLine(m: {
  kind: string
  gender?: string
  status?: string
  age?: number | null
}): string {
  const parts = [relativeLabel(m.kind as RelationKind, m.gender)]
  if (m.status && MEMBER_STATUS_LABEL[m.status]) parts.push(MEMBER_STATUS_LABEL[m.status])
  if (typeof m.age === 'number' && m.age >= 0 && m.age < 18)
    parts.push(`${m.age} ano${m.age === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/** Quantos dias faltam (data AAAA-MM-DD, horário de Brasília). */
export function daysUntil(date: string, today: string): number {
  const a = Date.parse(`${today}T12:00:00Z`)
  const b = Date.parse(`${date.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN
  return Math.round((b - a) / 86400000)
}

export function untilLabel(days: number): string {
  if (Number.isNaN(days)) return ''
  if (days <= 0) return 'hoje'
  if (days === 1) return 'amanhã'
  return `faltam ${days} dias`
}

/** "Faltam CPF, endereço e cidade". */
export function missingLabel(missing: string[]): string {
  if (missing.length === 0) return ''
  const list = missing.slice(0, 3)
  const rest = missing.length - list.length
  const head =
    list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`
  const text = rest > 0 ? `${list.join(', ')} e mais ${rest}` : head
  return `Falta${missing.length > 1 ? 'm' : ''} ${text}`
}

/** Caminho do QR da carteirinha (o servidor só confirma se ela vale). */
export function cardCheckPath(code: string): string {
  return `/igreja/carteirinha/${encodeURIComponent(code)}`
}
