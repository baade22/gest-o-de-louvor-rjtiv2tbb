// Área do membro no app da igreja (hook pocketbase/hooks/member_area.js).

import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import type { FinPaymentMethod } from '@/types/finance'

export interface MemberCodeResult {
  sent: boolean
  channel: 'WHATSAPP' | 'EMAIL'
  sent_to?: string
}

export interface MemberProfile {
  id: string
  name: string
  status: string
  congregation: string
  roll_number: string
  birth_date: string
  gender: string
  marital_status: string
  wedding_date: string
  phone: string
  email: string
  zip_code: string
  address: string
  neighborhood: string
  city: string
  state: string
  profession: string
  document_masked: string
  has_document: boolean
  baptism_date: string
  admission_date: string
}

export interface MemberFamily {
  id: string
  name: string
  kind: string
  gender: string
  status: string
  age: number | null
  has_app: boolean
}

export interface MemberRegistration {
  id: string
  event: string
  date: string
  time: string
  location: string
  paid: boolean
  amount_due: number
  checkin_code: string
}

export interface MemberMe {
  church_name: string
  team: boolean
  next_scale: {
    id: string
    event: string
    date: string
    time: string
    role: string
    status: 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO'
  } | null
  profile: MemberProfile
  completeness: { percent: number; missing: string[] }
  family: MemberFamily[]
  pending_family: { name: string; kind: string }[]
  card: { code: string; church_name: string; roll_number: string; member_since: string } | null
  registrations: MemberRegistration[]
}

export interface MemberApiError {
  status: number
  message: string
  team?: boolean
  found?: boolean
  no_profile?: boolean
}

export function memberError(err: unknown): MemberApiError {
  const e = err as { status?: number; response?: Partial<MemberApiError> & { message?: string } }
  return {
    status: e?.status || 0,
    message: e?.response?.message || 'Não foi possível concluir agora. Tente de novo.',
    team: e?.response?.team,
    found: e?.response?.found,
    no_profile: e?.response?.no_profile,
  }
}

type Contact = { phone?: string; email?: string }

export function requestMemberCode(slug: string, contact: Contact): Promise<MemberCodeResult> {
  return pb.send<MemberCodeResult>('/backend/v1/public/member/code', {
    method: 'POST',
    body: { slug, ...contact },
  })
}

export async function verifyMemberCode(
  slug: string,
  contact: Contact,
  code: string,
  personId?: string,
): Promise<{ choose?: { id: string; name: string }[] }> {
  const res = await pb.send<{
    token?: string
    record?: RecordModel
    choose?: { id: string; name: string }[]
  }>('/backend/v1/public/member/verify', {
    method: 'POST',
    body: { slug, ...contact, code, person_id: personId || '' },
  })
  if (res.choose) return { choose: res.choose }
  if (res.token && res.record) pb.authStore.save(res.token, res.record)
  return {}
}

export function getMemberMe(slug: string): Promise<MemberMe> {
  const q = slug ? `?slug=${encodeURIComponent(slug)}` : ''
  return pb.send<MemberMe>(`/backend/v1/member/me${q}`, { method: 'GET' })
}

export type MemberProfileInput = Pick<
  MemberProfile,
  | 'phone'
  | 'email'
  | 'birth_date'
  | 'gender'
  | 'marital_status'
  | 'wedding_date'
  | 'zip_code'
  | 'address'
  | 'neighborhood'
  | 'city'
  | 'state'
  | 'profession'
> & { document?: string }

export function saveMemberProfile(
  slug: string,
  data: MemberProfileInput,
): Promise<{ ok: boolean }> {
  return pb.send('/backend/v1/member/me', { method: 'POST', body: { slug, ...data } })
}

export function requestFamilyMember(
  slug: string,
  data: { name: string; kind: string; birth_date?: string; gender?: string; phone?: string },
): Promise<{ ok: boolean }> {
  return pb.send('/backend/v1/member/family', { method: 'POST', body: { slug, ...data } })
}

export interface MemberCardCheck {
  valid: boolean
  name?: string
  status?: string
  church_name?: string
  congregation?: string
}

export async function checkMemberCard(code: string): Promise<MemberCardCheck> {
  try {
    return await pb.send<MemberCardCheck>(
      `/backend/v1/public/member/card?c=${encodeURIComponent(code)}`,
      { method: 'GET' },
    )
  } catch (_) {
    return { valid: false }
  }
}

/** Renova a sessão de quem usa o app (o token dura 5 dias; cada uso estende). */
export async function refreshMemberSession(): Promise<boolean> {
  if (!pb.authStore.isValid) return false
  try {
    await pb.collection('users').authRefresh()
    return true
  } catch (err) {
    if ((err as { status?: number }).status === 401) pb.authStore.clear()
    return pb.authStore.isValid
  }
}

export interface MemberGivingItem {
  id: string
  type: 'ENTRADA'
  status: 'CONFIRMADO'
  is_anonymous: false
  person_id: string
  date: string
  amount_cents: number
  category_id: string
  campaign: string
  payment_method: FinPaymentMethod | ''
  from_count: boolean
}

export interface MemberGiving {
  church_name: string
  today: string
  person: { id: string; name: string; document: string }
  categories: { id: string; name: string; is_contribution: true }[]
  /** Só o que já vale no saldo (conciliado), do mais recente ao mais antigo. */
  items: MemberGivingItem[]
  settings: {
    legal_name: string
    cnpj: string
    address: string
    city: string
    statement_note: string
  } | null
  signers: { id: string; name: string; title: string; document: string; is_active: true }[]
}

export function getMemberGiving(slug: string): Promise<MemberGiving> {
  const q = slug ? `?slug=${encodeURIComponent(slug)}` : ''
  return pb.send<MemberGiving>(`/backend/v1/member/giving${q}`, { method: 'GET' })
}
