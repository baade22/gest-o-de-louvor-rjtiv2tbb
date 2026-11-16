import pb from '@/lib/pocketbase/client'
import type { PersonStatus } from '@/types'

export interface ImportGroup {
  id: string
  name: string
  size: number
}

export interface ImportCan {
  novo: boolean
  alterar: boolean
}

export interface GroupParticipants {
  total: number
  /** Participantes cujo número o WhatsApp esconde (aparecem só como código) */
  hidden: number
  registered: {
    phone: string
    wa_name: string
    person_id: string
    name: string
    status: PersonStatus
  }[]
  unregistered: { phone: string; wa_name: string; admin: boolean }[]
  no_phone_people: { id: string; name: string; status: PersonStatus }[]
  can: ImportCan
}

export interface ImportItem {
  phone: string
  name?: string
  status?: 'VISITANTE' | 'CONGREGADO'
  congregation?: string
  person_id?: string
}

export interface ImportResult {
  created: number
  linked: number
  skipped: { name: string; reason: string }[]
}

function call<T>(churchId: string, action: string, extra: Record<string, unknown> = {}) {
  return pb.send<T>('/backend/v1/whatsapp/grupo-contatos', {
    method: 'POST',
    body: { church_id: churchId, action, ...extra },
  })
}

export const listImportGroups = (churchId: string) =>
  call<{ items: ImportGroup[]; can: ImportCan }>(churchId, 'groups')
export const getGroupParticipants = (churchId: string, groupId: string) =>
  call<GroupParticipants>(churchId, 'participants', { group_id: groupId })
export const importGroupParticipants = (
  churchId: string,
  groupId: string,
  groupName: string,
  items: ImportItem[],
) => call<ImportResult>(churchId, 'import', { group_id: groupId, group_name: groupName, items })
