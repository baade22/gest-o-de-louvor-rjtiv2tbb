import pb from '@/lib/pocketbase/client'
import type { WhatsAppAutoKind } from '@/lib/whatsapp'

export type WhatsAppState = 'unconfigured' | 'open' | 'connecting' | 'close' | 'error'
export type WhatsAppMessageStatus = 'FILA' | 'PAUSADO' | 'ENVIADO' | 'ERRO' | 'CANCELADO'

export interface WhatsAppStatus {
  configured: boolean
  state: WhatsAppState
  phone: string
  profile_name: string
  last_error: string
  auto: Record<WhatsAppAutoKind, boolean>
  queue: { fila: number; erro: number }
}

export interface WhatsAppMessage {
  id: string
  kind: WhatsAppAutoKind | 'TESTE' | 'AVISO'
  phone: string
  name: string
  text: string
  status: WhatsAppMessageStatus
  error: string
  attempts: number
  send_after: string
  sent_at: string
  created: string
}

/** Tudo do WhatsApp passa por uma rota só, que exige MASTER da igreja. */
function call<T>(churchId: string, action: string, extra: Record<string, unknown> = {}) {
  return pb.send<T>('/backend/v1/whatsapp', {
    method: 'POST',
    body: { church_id: churchId, action, ...extra },
  })
}

export const getWhatsAppStatus = (churchId: string) => call<WhatsAppStatus>(churchId, 'status')

export const connectWhatsApp = (churchId: string) =>
  call<{ state: WhatsAppState; qr?: string; phone?: string }>(churchId, 'connect')

export const disconnectWhatsApp = (churchId: string) =>
  call<{ state: WhatsAppState }>(churchId, 'disconnect')

export const saveWhatsAppAuto = (churchId: string, auto: Record<WhatsAppAutoKind, boolean>) =>
  call<{ auto: Record<WhatsAppAutoKind, boolean> }>(churchId, 'save', { auto })

export const sendWhatsAppTest = (churchId: string, phone: string) =>
  call<{ id: string }>(churchId, 'test', { phone })

export const listWhatsAppMessages = (
  churchId: string,
  opts: { page?: number; status?: WhatsAppMessageStatus | '' } = {},
) =>
  call<{
    items: WhatsAppMessage[]
    has_more: boolean
    queue: WhatsAppStatus['queue']
  }>(churchId, 'list', opts)

export const retryWhatsAppMessage = (churchId: string, id: string) =>
  call<{ id: string; status: WhatsAppMessageStatus }>(churchId, 'retry', {
    id,
  })

export const cancelWhatsAppMessage = (churchId: string, id: string) =>
  call<{ id: string; status: WhatsAppMessageStatus }>(churchId, 'cancel', {
    id,
  })
