import pb from '@/lib/pocketbase/client'
import type { ChurchEvent, EventRegistration } from '@/types'
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
>

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

export async function deleteChurchEvent(id: string): Promise<void> {
  await pb.collection('church_events').delete(id)
}

/** Inscrições de todos os eventos da igreja (para os totais da lista). */
export async function listAllRegistrations(churchId: string): Promise<EventRegistration[]> {
  return pb.collection('church_event_registrations').getFullList<EventRegistration>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
    fields: 'id,event_id,paid,paid_amount,payment_method,attended',
  })
}

export async function listRegistrations(eventId: string): Promise<EventRegistration[]> {
  return pb.collection('church_event_registrations').getFullList<EventRegistration>({
    filter: pb.filter('event_id = {:eventId}', { eventId }),
    sort: 'name',
  })
}

export async function createRegistration(
  event: ChurchEvent,
  data: Pick<EventRegistration, 'name'> &
    Partial<Pick<EventRegistration, 'person_id' | 'phone' | 'email' | 'notes'>>,
): Promise<EventRegistration> {
  const free = !event.price || event.price <= 0
  return pb.collection('church_event_registrations').create<EventRegistration>({
    ...data,
    church_id: event.church_id,
    event_id: event.id,
    source: 'SECRETARIA',
    paid: free,
    payment_method: free ? 'ISENTO' : '',
  })
}

export async function updateRegistration(
  id: string,
  data: Partial<
    Pick<EventRegistration, 'paid' | 'paid_amount' | 'payment_method' | 'attended' | 'notes' | 'person_id'>
  >,
): Promise<EventRegistration> {
  return pb.collection('church_event_registrations').update<EventRegistration>(id, data)
}

export async function deleteRegistration(id: string): Promise<void> {
  await pb.collection('church_event_registrations').delete(id)
}

// ---------- Inscrição pública (sem login) ----------

export interface EventSignupInfo {
  valid: boolean
  open?: boolean
  closed_reason?: 'closed' | 'full' | ''
  church_name?: string
  title?: string
  description?: string
  starts_on?: string
  ends_on?: string
  start_time?: string
  location?: string
  price?: number
  payment_info?: string
  spots_left?: number | null
  message?: string
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
  consent: boolean
  website?: string
}): Promise<{ ok: boolean; price?: number; payment_info?: string }> {
  return pb.send('/backend/v1/event-signup', { method: 'POST', body: payload })
}

export function eventSignupUrl(key: string, origin = window.location.origin): string {
  return `${origin}/inscricao/${key}`
}
