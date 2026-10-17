// Acesso aos dados do Financeiro. As regras de quem lê e quem grava ficam no PocketBase
// (migração 0035); aqui só montamos as consultas.

import pb from '@/lib/pocketbase/client'
import { DEFAULT_CATEGORIES, monthRange } from '@/lib/financeSummary'
import type {
  FinAccount,
  FinCategory,
  FinCostCenter,
  FinSupplier,
  FinTransaction,
  Person,
} from '@/types/finance'

export type RegistryCollection =
  | 'fin_accounts'
  | 'fin_categories'
  | 'fin_cost_centers'
  | 'fin_suppliers'
  | 'people'

const byChurch = (churchId: string) => pb.filter('church_id = {:churchId}', { churchId })

export async function listRegistry<T>(collection: RegistryCollection, churchId: string) {
  return pb.collection(collection).getFullList<T>({ filter: byChurch(churchId), sort: 'name' })
}

export const listAccounts = (churchId: string) => listRegistry<FinAccount>('fin_accounts', churchId)
export const listCategories = (churchId: string) =>
  listRegistry<FinCategory>('fin_categories', churchId)
export const listCostCenters = (churchId: string) =>
  listRegistry<FinCostCenter>('fin_cost_centers', churchId)
export const listSuppliers = (churchId: string) =>
  listRegistry<FinSupplier>('fin_suppliers', churchId)
export const listPeople = (churchId: string) => listRegistry<Person>('people', churchId)

export async function saveRegistry<T>(
  collection: RegistryCollection,
  churchId: string,
  data: Record<string, unknown>,
  id?: string,
): Promise<T> {
  if (id) return pb.collection(collection).update<T>(id, data)
  return pb.collection(collection).create<T>({ is_active: true, ...data, church_id: churchId })
}

/** Cria o plano de contas sugerido (só quando a igreja ainda não tem nenhuma categoria). */
export async function seedDefaultCategories(churchId: string) {
  for (const c of DEFAULT_CATEGORIES) {
    await pb.collection('fin_categories').create({
      church_id: churchId,
      name: c.name,
      direction: c.direction,
      is_contribution: Boolean(c.is_contribution),
      is_active: true,
    })
  }
}

/** Data de calendário (YYYY-MM-DD) gravada ao meio-dia UTC, para não mudar de dia com o fuso. */
export const toPbDate = (ymd: string) => `${ymd} 12:00:00.000Z`

const EXPAND = 'account_id,category_id,cost_center_id,person_id,supplier_id,event_id'

export async function listTransactionsOfMonth(churchId: string, ym: string) {
  const { start, end } = monthRange(ym)
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: pb.filter('church_id = {:churchId} && date >= {:start} && date < {:end}', {
      churchId,
      start: `${start} 00:00:00`,
      end: `${end} 00:00:00`,
    }),
    sort: '-date,-created',
    expand: EXPAND,
  })
}

/** Todos os lançamentos, só com os campos de que os saldos precisam. */
export async function listLedger(churchId: string) {
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: byChurch(churchId),
    fields: 'id,type,amount_cents,account_id,category_id,is_anonymous,status,date',
    sort: 'date',
  })
}

export interface TransactionInput {
  type: FinTransaction['type']
  date: string // YYYY-MM-DD
  amount_cents: number
  description?: string
  account_id: string
  category_id?: string
  cost_center_id?: string
  payment_method?: string
  person_id?: string
  is_anonymous?: boolean
  supplier_id?: string
  event_id?: string
  notes?: string
  attachment?: File | null
}

function toFormData(input: TransactionInput) {
  const form = new FormData()
  const { attachment, date, ...rest } = input
  form.append('date', toPbDate(date))
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null) continue
    form.append(key, typeof value === 'boolean' ? String(value) : String(value))
  }
  if (attachment) form.append('attachment', attachment)
  return form
}

export async function createTransaction(churchId: string, input: TransactionInput) {
  const form = toFormData(input)
  form.append('church_id', churchId)
  form.append('status', 'CONFIRMADO')
  form.append('created_by', pb.authStore.record?.id || '')
  return pb.collection('fin_transactions').create<FinTransaction>(form)
}

export async function updateTransaction(id: string, input: TransactionInput) {
  return pb.collection('fin_transactions').update<FinTransaction>(id, toFormData(input))
}

/** Estorno: o lançamento continua no histórico, mas sai dos saldos e não pode mais ser editado. */
export async function voidTransaction(id: string, reason: string) {
  return pb
    .collection('fin_transactions')
    .update<FinTransaction>(id, { status: 'ESTORNADO', void_reason: reason })
}

export function attachmentUrl(tx: FinTransaction) {
  if (!tx.attachment) return ''
  return pb.files.getURL(tx, tx.attachment)
}

/** Link temporário para comprovantes (o arquivo é protegido). */
export async function openAttachment(tx: FinTransaction) {
  const token = await pb.files.getToken()
  window.open(pb.files.getURL(tx, tx.attachment || '', { token }), '_blank', 'noopener')
}

export async function listRecentEvents(churchId: string) {
  return pb.collection('events').getList<{ id: string; title: string; date: string }>(1, 30, {
    filter: byChurch(churchId),
    sort: '-date',
    fields: 'id,title,date',
  })
}
