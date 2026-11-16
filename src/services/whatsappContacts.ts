import pb from '@/lib/pocketbase/client'

export interface WaContact {
  id: string
  /** Só dígitos, com o código do país */
  phone: string
  display: string
  name: string
  note: string
  origin: string
  lists: string[]
}

export interface WaList {
  id: string
  name: string
  description: string
  count: number
}

export interface ContactsOverview {
  lists: WaList[]
  contacts: WaContact[]
  can: { novo: boolean; alterar: boolean; excluir: boolean }
}

export interface GroupPreviewItem {
  phone: string
  display: string
  wa_name: string
  admin: boolean
  /** Preenchido quando o número já está na base */
  contact_id: string
  name: string
  lists: string[]
}

export interface GroupPreview {
  total: number
  /** Participantes que escondem o número no grupo */
  hidden: number
  items: GroupPreviewItem[]
}

function call<T>(churchId: string, action: string, extra: Record<string, unknown> = {}) {
  return pb.send<T>('/backend/v1/whatsapp/contatos', {
    method: 'POST',
    body: { church_id: churchId, action, ...extra },
  })
}

export const getContactsOverview = (churchId: string) =>
  call<ContactsOverview>(churchId, 'overview')
export const previewGroup = (churchId: string, groupId: string) =>
  call<GroupPreview>(churchId, 'group_preview', { group_id: groupId })
export const importFromGroup = (
  churchId: string,
  input: {
    group_id: string
    group_name: string
    items: Array<{ phone: string; name: string }>
    list_ids: string[]
    new_list?: string
  },
) => call<{ created: number; updated: number; skipped: number }>(churchId, 'import', input)
export const saveContact = (
  churchId: string,
  input: { id?: string; phone: string; name: string; note: string; lists: string[] },
) => call<WaContact>(churchId, 'save_contact', input)
export const deleteContacts = (churchId: string, ids: string[]) =>
  call<{ deleted: number }>(churchId, 'delete_contacts', { ids })
export const saveList = (
  churchId: string,
  input: { id?: string; name: string; description: string },
) => call<WaList>(churchId, 'save_list', input)
export const deleteList = (churchId: string, id: string) =>
  call<{ id: string }>(churchId, 'delete_list', { id })
export const setContactsList = (
  churchId: string,
  listId: string,
  contactIds: string[],
  on: boolean,
) =>
  call<{ changed: number }>(churchId, 'set_list', { list_id: listId, contact_ids: contactIds, on })
