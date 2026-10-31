import pb from '@/lib/pocketbase/client'
import type { AvisoAudience, AvisoMediaType, AvisoStatus, AvisoType } from '@/lib/whatsappAvisos'

export interface AvisoStats {
  fila: number
  pausado: number
  enviado: number
  erro: number
  cancelado: number
}

export interface Aviso {
  id: string
  type: AvisoType
  title: string
  media_type: AvisoMediaType
  media_name: string
  media_path: string
  use_event_cover: boolean
  text: string
  audience: AvisoAudience
  status: AvisoStatus
  starts_at: string
  window_start: string
  window_end: string
  pace_min: number
  pace_max: number
  total: number
  eta: string
  note: string
  weekday: number
  title_match: string
  days_before: number
  send_time: string
  missing_media: 'SO_TEXTO' | 'ESPERAR'
  rule_id: string
  event_id: string
  church_event_id: string
  created_by: string
  started_at: string
  finished_at: string
  created: string
  updated: string
  stats?: AvisoStats
}

export type AvisoInput = Partial<
  Pick<
    Aviso,
    | 'title'
    | 'media_type'
    | 'text'
    | 'audience'
    | 'window_start'
    | 'window_end'
    | 'pace_min'
    | 'pace_max'
    | 'church_event_id'
    | 'use_event_cover'
    | 'weekday'
    | 'title_match'
    | 'days_before'
    | 'send_time'
    | 'missing_media'
  >
> & { id?: string; type?: 'AVULSO' | 'REGRA_CULTO'; active?: boolean }

export interface AvisosOverview {
  items: Aviso[]
  whatsapp: { configured: boolean; state: string; phone: string }
  can: { novo: boolean; alterar: boolean; excluir: boolean; enviar: boolean }
}

export interface AvisoRecipient {
  id: string
  name: string
  phone_end: string
  group?: boolean
  status: 'FILA' | 'PAUSADO' | 'ENVIADO' | 'ERRO' | 'CANCELADO'
  error: string
  send_after: string
  sent_at: string
}

export interface WeekItem {
  event: { id: string; title: string; date: string; start_time: string }
  rule: Aviso | null
  occurrence: Aviso | null
  send_at?: string
  has_media?: boolean
}

export interface AvisoOptions {
  groups: Array<{ id: string; name: string; kind: string }>
  events: Array<{
    id: string
    title: string
    starts_on: string
    location: string
    congregation: string
    has_cover: boolean
  }>
  people: Array<{ id: string; name: string; has_phone: boolean }>
}

/** Tudo dos avisos passa por uma rota só, que confere as chaves culto.avisos.* */
function call<T>(churchId: string, action: string, extra: Record<string, unknown> = {}) {
  return pb.send<T>('/backend/v1/whatsapp/avisos', {
    method: 'POST',
    body: { church_id: churchId, action, ...extra },
  })
}

export const getAvisosOverview = (churchId: string) => call<AvisosOverview>(churchId, 'overview')
export const getAviso = (churchId: string, id: string) => call<Aviso>(churchId, 'get', { id })
export const saveAviso = (churchId: string, input: AvisoInput) =>
  call<Aviso>(churchId, 'save', input as Record<string, unknown>)
export const deleteAviso = (churchId: string, id: string) =>
  call<{ id: string }>(churchId, 'delete', { id })
export const countAudience = (churchId: string, audience: AvisoAudience) =>
  call<{ total: number; no_phone: number }>(churchId, 'audience_count', { audience })
export interface WaGroup {
  id: string
  name: string
  size: number
  only_admins: boolean
}
/** Grupos de que o número da igreja participa, lidos na hora do WhatsApp */
export const listWaGroups = (churchId: string) => call<{ items: WaGroup[] }>(churchId, 'wa_groups')
export const getAvisoOptions = (
  churchId: string,
  extra: { q?: string; person_ids?: string[] } = {},
) => call<AvisoOptions>(churchId, 'options', extra)
export const scheduleAviso = (
  churchId: string,
  id: string,
  mode: 'AGORA' | 'DATA',
  startsAt?: string,
) => call<Aviso>(churchId, 'schedule', { id, mode, starts_at: startsAt })
export const pauseAviso = (churchId: string, id: string) => call<Aviso>(churchId, 'pause', { id })
export const resumeAviso = (churchId: string, id: string) => call<Aviso>(churchId, 'resume', { id })
export const cancelAviso = (churchId: string, id: string) => call<Aviso>(churchId, 'cancel', { id })
export const skipAviso = (churchId: string, id: string) => call<Aviso>(churchId, 'skip', { id })
export const testAviso = (churchId: string, id: string, phone?: string) =>
  call<{ id: string; phone_end: string }>(churchId, 'test', { id, phone })
export const listRecipients = (
  churchId: string,
  id: string,
  opts: { page?: number; status?: string; q?: string } = {},
) =>
  call<{ items: AvisoRecipient[]; has_more: boolean; stats: AvisoStats }>(churchId, 'recipients', {
    id,
    ...opts,
  })
export const removeRecipient = (churchId: string, messageId: string) =>
  call<{ id: string }>(churchId, 'remove', { message_id: messageId })
export const getWeek = (churchId: string, start: string) =>
  call<{ start: string; items: WeekItem[] }>(churchId, 'week', { start })
export const openOccurrence = (churchId: string, ruleId: string, eventId: string) =>
  call<Aviso>(churchId, 'occurrence', { rule_id: ruleId, event_id: eventId })

export function uploadAvisoMedia(churchId: string, id: string, file: File) {
  const form = new FormData()
  form.append('church_id', churchId)
  form.append('id', id)
  form.append('file', file)
  return pb.send<{ id: string; media_name: string; media_path: string }>(
    '/backend/v1/whatsapp/avisos/upload',
    { method: 'POST', body: form },
  )
}

export function removeAvisoMedia(churchId: string, id: string) {
  const form = new FormData()
  form.append('church_id', churchId)
  form.append('id', id)
  form.append('remove', 'true')
  return pb.send<{ id: string }>('/backend/v1/whatsapp/avisos/upload', {
    method: 'POST',
    body: form,
  })
}

/** Endereço do arquivo do aviso (para a prévia). */
export const avisoMediaUrl = (path: string) => (path ? pb.buildURL(path) : '')
