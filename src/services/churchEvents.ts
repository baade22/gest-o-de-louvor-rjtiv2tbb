import pb from '@/lib/pocketbase/client'
import type { ChurchEvent, EventQuestion, EventRegistration } from '@/types'
import type { PixKeyType } from '@/lib/pix'
import type { ClosedReason } from '@/lib/eventPage'
import { newSignupKey } from '@/lib/signups'

export type ChurchEventPayload = Pick<
  ChurchEvent,
  | 'title'
  | 'description'
  | 'starts_on'
  | 'ends_on'
  | 'start_time'
  | 'location'
  | 'congregation'
  | 'price'
  | 'capacity'
  | 'payment_info'
  | 'registration_open'
  | 'color'
  | 'registration_deadline'
  | 'contact_name'
  | 'contact_phone'
  | 'address_cep'
  | 'address_street'
  | 'address_number'
  | 'address_complement'
  | 'address_district'
  | 'address_city'
  | 'address_state'
  | 'publish_only'
  | 'hide_price'
  | 'hide_header'
  | 'couple_only'
  | 'confirm_message'
  | 'payment_message'
  | 'send_confirm_email'
  | 'send_payment_email'
  | 'coupons'
  | 'skip_finance'
  | 'fin_account_id'
  | 'closed_at'
  | 'questions'
  | 'staff'
>

export type CoverField = 'cover' | 'cover_side'

export async function listChurchEvents(churchId: string): Promise<ChurchEvent[]> {
  return pb.collection('church_events').getFullList<ChurchEvent>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
    sort: '-starts_on',
  })
}

export async function getChurchEvent(id: string): Promise<ChurchEvent> {
  return pb.collection('church_events').getOne<ChurchEvent>(id)
}

export async function createChurchEvent(
  churchId: string,
  payload: ChurchEventPayload,
): Promise<ChurchEvent> {
  return pb.collection('church_events').create<ChurchEvent>({
    ...payload,
    church_id: churchId,
    public_key: newSignupKey(),
    created_by: pb.authStore.record?.id,
  })
}

export async function updateChurchEvent(
  id: string,
  payload: Partial<ChurchEventPayload>,
): Promise<ChurchEvent> {
  return pb.collection('church_events').update<ChurchEvent>(id, payload)
}

/** Troca (ou tira, com null) a capa do evento. */
export async function setEventCover(
  id: string,
  field: CoverField,
  file: File | null,
): Promise<ChurchEvent> {
  if (!file) return pb.collection('church_events').update<ChurchEvent>(id, { [field]: null })
  const form = new FormData()
  form.append(field, file)
  return pb.collection('church_events').update<ChurchEvent>(id, form)
}

export function eventCoverUrl(event: ChurchEvent, field: CoverField, thumb = ''): string {
  const file = event[field]
  return file ? pb.files.getURL(event, file, thumb ? { thumb } : undefined) : ''
}

/** Endereço público de um arquivo devolvido pela rota de inscrição (/api/files/...). */
export function publicFileUrl(path?: string): string {
  if (!path) return ''
  return `${pb.baseURL.replace(/\/$/, '')}${path}`
}

export async function deleteChurchEvent(id: string): Promise<void> {
  await pb.collection('church_events').delete(id)
}

/** Inscrições de todos os eventos da igreja (para os totais da lista). */
export async function listAllRegistrations(churchId: string): Promise<EventRegistration[]> {
  return pb.collection('church_event_registrations').getFullList<EventRegistration>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
    fields: 'id,event_id,paid,paid_amount,payment_method,attended,amount_due',
  })
}

export async function listRegistrations(eventId: string): Promise<EventRegistration[]> {
  return pb.collection('church_event_registrations').getFullList<EventRegistration>({
    filter: pb.filter('event_id = {:eventId}', { eventId }),
    sort: 'name',
  })
}

export async function getRegistration(id: string): Promise<EventRegistration> {
  return pb.collection('church_event_registrations').getOne<EventRegistration>(id)
}

/** Inscrição pelo código do comprovante (QR de check-in), com o evento. */
export async function getRegistrationByCode(
  code: string,
): Promise<EventRegistration & { expand?: { event_id?: ChurchEvent } }> {
  return pb
    .collection('church_event_registrations')
    .getFirstListItem(pb.filter('checkin_code = {:code}', { code }), { expand: 'event_id' })
}

export async function createRegistration(
  event: ChurchEvent,
  data: Pick<EventRegistration, 'name'> &
    Partial<
      Pick<
        EventRegistration,
        'person_id' | 'phone' | 'email' | 'notes' | 'partner_name' | 'partner_phone' | 'answers'
      >
    >,
): Promise<EventRegistration> {
  const free = !event.price || event.price <= 0
  return pb.collection('church_event_registrations').create<EventRegistration>({
    ...data,
    church_id: event.church_id,
    event_id: event.id,
    source: 'SECRETARIA',
    amount_due: free ? 0 : event.price,
    paid: free,
    payment_method: free ? 'ISENTO' : '',
  })
}

export async function updateRegistration(
  id: string,
  data: Partial<
    Pick<
      EventRegistration,
      | 'paid'
      | 'paid_amount'
      | 'payment_method'
      | 'attended'
      | 'notes'
      | 'person_id'
      | 'partner_name'
      | 'amount_due'
      | 'answers'
      | 'attended_at'
      | 'checked_out_at'
    >
  >,
): Promise<EventRegistration> {
  return pb.collection('church_event_registrations').update<EventRegistration>(id, data)
}

export async function deleteRegistration(id: string): Promise<void> {
  await pb.collection('church_event_registrations').delete(id)
}

// ---------- Inscrição pública (sem login) ----------

export interface EventPix {
  key: string
  key_type?: PixKeyType
  name: string
  city: string
}

export interface EventSignupInfo {
  valid: boolean
  open?: boolean
  closed_reason?: ClosedReason
  church_name?: string
  title?: string
  description?: string
  starts_on?: string
  ends_on?: string
  start_time?: string
  location?: string
  address_cep?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_district?: string
  address_city?: string
  address_state?: string
  contact_name?: string
  contact_phone?: string
  registration_deadline?: string
  cover_url?: string
  cover_side_url?: string
  color?: string
  hide_header?: boolean
  couple_only?: boolean
  paid_event?: boolean
  /** null quando o evento esconde o valor até a inscrição. */
  price?: number | null
  payment_info?: string
  has_coupons?: boolean
  questions?: EventQuestion[]
  pix?: EventPix | null
  spots_left?: number | null
  message?: string
}

export interface EventSignupResult {
  ok: boolean
  id?: string
  /** Valor a pagar, já com o cupom. */
  amount?: number
  price?: number
  coupon_code?: string
  payment_info?: string
  /** Mensagem de confirmação do evento, com os campos preenchidos. */
  message?: string
  /** Código do comprovante: vira o QR que a equipe lê na entrada. */
  checkin_code?: string
}

export async function getEventSignupInfo(key: string): Promise<EventSignupInfo> {
  try {
    return await pb.send<EventSignupInfo>(
      `/backend/v1/event-signup/info?key=${encodeURIComponent(key)}`,
      { method: 'GET' },
    )
  } catch (err) {
    const data = (err as { response?: EventSignupInfo }).response
    return { valid: false, message: data?.message || 'Não foi possível abrir a inscrição.' }
  }
}

export async function submitEventSignup(payload: {
  key: string
  name: string
  phone: string
  email?: string
  notes?: string
  partner_name?: string
  partner_phone?: string
  coupon?: string
  answers?: Record<string, string>
  consent: boolean
  website?: string
}): Promise<EventSignupResult> {
  return pb.send('/backend/v1/event-signup', { method: 'POST', body: payload })
}

export async function checkEventCoupon(
  key: string,
  code: string,
): Promise<{ valid: boolean; code?: string; amount?: number; message?: string }> {
  try {
    return await pb.send(
      `/backend/v1/event-signup/coupon?key=${encodeURIComponent(key)}&code=${encodeURIComponent(code)}`,
      { method: 'GET' },
    )
  } catch (err) {
    const data = (err as { response?: { message?: string } }).response
    return { valid: false, message: data?.message || 'Cupom inválido.' }
  }
}

/** Busca o endereço pelo CEP no ViaCEP. */
export async function lookupCep(cep: string): Promise<unknown> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
  return res.ok ? res.json() : null
}

export function eventSignupUrl(key: string, origin = window.location.origin): string {
  return `${origin}/inscricao/${key}`
}
