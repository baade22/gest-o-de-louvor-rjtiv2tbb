// Acesso aos dados do Financeiro. As regras de quem lê e quem grava ficam no PocketBase
// (migração 0051); aqui só montamos as consultas.

import pb from '@/lib/pocketbase/client'
import { DEFAULT_CATEGORIES, addMonthsToDate, monthRange } from '@/lib/financeSummary'
import type { OfxStatement } from '@/lib/ofx'
import type {
  FinAccount,
  FinBankConnection,
  BankSecretInput,
  BankSecretsInfo,
  FinBankImport,
  FinBankLine,
  FinBill,
  FinAudit,
  FinAuditComment,
  FinClosing,
  FinClosingCheck,
  FinBillKind,
  FinBudget,
  FinCampaign,
  PublicCampaign,
  FinCategory,
  FinCount,
  FinCountEnvelope,
  FinCostCenter,
  FinSettings,
  FinSigner,
  FinSupplier,
  FinTransaction,
  Person,
} from '@/types/finance'

export type RegistryCollection =
  | 'fin_accounts'
  | 'fin_categories'
  | 'fin_cost_centers'
  | 'fin_suppliers'
  | 'fin_signers'
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
export const listSigners = (churchId: string) => listRegistry<FinSigner>('fin_signers', churchId)

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

const EXPAND =
  'account_id,to_account_id,category_id,cost_center_id,person_id,supplier_id,event_id,campaign_id'

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
    fields:
      'id,type,amount_cents,account_id,to_account_id,category_id,person_id,is_anonymous,status,date',
    sort: 'date',
  })
}

export interface TransactionInput {
  type: FinTransaction['type']
  date: string // YYYY-MM-DD
  amount_cents: number
  description?: string
  account_id: string
  to_account_id?: string
  category_id?: string
  cost_center_id?: string
  campaign_id?: string
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

// ---- Contagem do culto ----

export async function listCounts(churchId: string) {
  return pb.collection('fin_counts').getList<FinCount>(1, 60, {
    filter: byChurch(churchId),
    sort: '-date,-created',
    expand: 'account_id,event_id',
  })
}

export interface CountInput {
  date: string // YYYY-MM-DD
  event_id: string
  account_id: string
  cash_cents: number
  offering_category_id: string
  envelopes: FinCountEnvelope[]
  notes: string
}

/** Quem registra a contagem fica como quem contou; a aprovação é sempre de outra pessoa. */
export async function createCount(churchId: string, input: CountInput) {
  return pb.collection('fin_counts').create<FinCount>({
    ...input,
    date: toPbDate(input.date),
    church_id: churchId,
    status: 'CONTADO',
    counted_by: pb.authStore.record?.id || '',
  })
}

/** Corrigir a contagem limpa a diferença apontada, e ela volta para conferência. */
export async function updateCount(id: string, input: CountInput) {
  return pb
    .collection('fin_counts')
    .update<FinCount>(id, { ...input, date: toPbDate(input.date), difference_note: '' })
}

export async function pointCountDifference(id: string, note: string) {
  return pb.collection('fin_counts').update<FinCount>(id, { difference_note: note })
}

export async function cancelCount(id: string) {
  return pb.collection('fin_counts').update<FinCount>(id, { status: 'CANCELADO' })
}

/** Aprova e cria os lançamentos (servidor, numa transação só). */
export async function approveCount(id: string) {
  return pb.send('/backend/v1/finance/counts/approve', {
    method: 'POST',
    body: { count_id: id },
  })
}

// ---- Contas a pagar e a receber ----

const BILL_EXPAND = 'category_id,supplier_id,person_id,account_id,paid_account_id'

/** Todas as contas de um tipo (em aberto de qualquer data e o histórico recente). */
export async function listBills(churchId: string, kind?: FinBillKind) {
  return pb.collection('fin_bills').getFullList<FinBill>({
    filter: kind
      ? pb.filter('church_id = {:churchId} && kind = {:kind}', { churchId, kind })
      : byChurch(churchId),
    sort: 'due_date,created',
    expand: BILL_EXPAND,
  })
}

/** Contas em aberto, só com o que o painel precisa. */
export async function listOpenBills(churchId: string) {
  return pb.collection('fin_bills').getFullList<FinBill>({
    filter: pb.filter("church_id = {:churchId} && status = 'ABERTO'", { churchId }),
    fields: 'id,kind,description,amount_cents,due_date,status',
    sort: 'due_date',
  })
}

export interface BillInput {
  kind: FinBillKind
  description: string
  amount_cents: number
  due_date: string // YYYY-MM-DD
  issue_date?: string // YYYY-MM-DD
  category_id?: string
  cost_center_id?: string
  campaign_id?: string
  supplier_id?: string
  person_id?: string
  account_id?: string
  document_type?: string
  document_number?: string
  notes?: string
  attachment?: File | null
}

function billForm(input: BillInput, extra: Record<string, string | number> = {}) {
  const form = new FormData()
  const { attachment, due_date, issue_date, ...rest } = input
  form.append('due_date', toPbDate(due_date))
  form.append('issue_date', issue_date ? toPbDate(issue_date) : '')
  for (const [key, value] of Object.entries({ ...rest, ...extra })) {
    if (value === undefined || value === null) continue
    form.append(key, String(value))
  }
  if (attachment) form.append('attachment', attachment)
  return form
}

/**
 * Cria a conta. Com `repeat` > 1, cria uma por mês com o mesmo dia de vencimento (1/12, 2/12...);
 * o anexo fica só na primeira.
 */
export async function createBills(churchId: string, input: BillInput, repeat = 1) {
  const times = Math.max(1, Math.min(60, Math.floor(repeat)))
  const group =
    times > 1 ? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` : ''
  const created: FinBill[] = []
  for (let i = 0; i < times; i++) {
    const form = billForm(
      {
        ...input,
        due_date: addMonthsToDate(input.due_date, i),
        attachment: i === 0 ? input.attachment : null,
      },
      {
        church_id: churchId,
        status: 'ABERTO',
        ...(group ? { recurrence_group: group, installment: i + 1, installments: times } : {}),
      },
    )
    created.push(await pb.collection('fin_bills').create<FinBill>(form))
  }
  return created
}

export async function updateBill(id: string, input: BillInput) {
  return pb.collection('fin_bills').update<FinBill>(id, billForm(input))
}

/** Cancelar não apaga: a conta sai das pendências e fica no histórico. */
export async function cancelBill(id: string) {
  return pb.collection('fin_bills').update<FinBill>(id, { status: 'CANCELADO' })
}

export interface SettleInput {
  date: string // YYYY-MM-DD
  account_id: string
  amount_cents: number
  payment_method: string
}

/** Baixa: o servidor cria o lançamento e marca a conta como paga, numa transação só. */
export async function settleBill(id: string, input: SettleInput) {
  return pb.send('/backend/v1/finance/bills/settle', {
    method: 'POST',
    body: { bill_id: id, ...input },
  })
}

export async function openBillAttachment(bill: FinBill) {
  const token = await pb.files.getToken()
  window.open(pb.files.getURL(bill, bill.attachment || '', { token }), '_blank', 'noopener')
}

// ---- Conciliação do extrato ----

export async function listBankLines(churchId: string, accountId: string) {
  return pb.collection('fin_bank_lines').getFullList<FinBankLine>({
    filter: pb.filter('church_id = {:churchId} && account_id = {:accountId}', {
      churchId,
      accountId,
    }),
    sort: '-date,-created',
    expand: 'transaction_id,transaction_id.category_id,transaction_id.person_id',
  })
}

export async function listBankImports(churchId: string, accountId: string) {
  return pb.collection('fin_bank_imports').getList<FinBankImport>(1, 10, {
    filter: pb.filter('church_id = {:churchId} && account_id = {:accountId}', {
      churchId,
      accountId,
    }),
    sort: '-end_date,-created',
  })
}

/** Lançamentos da conta ainda não conciliados, num período (para as sugestões). */
export async function listUnreconciled(
  churchId: string,
  accountId: string,
  from: string,
  to: string,
) {
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: pb.filter(
      "church_id = {:churchId} && (account_id = {:accountId} || to_account_id = {:accountId}) && status = 'CONFIRMADO' && bank_line_id = '' && date >= {:from} && date <= {:to}",
      { churchId, accountId, from: `${from} 00:00:00`, to: `${to} 23:59:59` },
    ),
    sort: 'date',
    expand: EXPAND,
  })
}

export async function importStatement(
  accountId: string,
  fileName: string,
  st: OfxStatement,
): Promise<{ created: number; skipped: number }> {
  return pb.send('/backend/v1/finance/bank/import', {
    method: 'POST',
    body: {
      account_id: accountId,
      file_name: fileName,
      start_date: st.startDate,
      end_date: st.endDate,
      balance_cents: st.balanceCents,
      balance_date: st.balanceDate,
      lines: st.lines,
    },
  })
}

export interface ReconcileCreate {
  category_id?: string
  cost_center_id?: string
  campaign_id?: string
  person_id?: string
  is_anonymous?: boolean
  supplier_id?: string
  description?: string
  payment_method?: string
  /** Outra conta, quando o movimento é uma transferência. */
  transfer_account_id?: string
}

export type ReconcileTarget =
  | { transaction_id: string }
  | { bill_id: string; payment_method?: string }
  | { create: ReconcileCreate }

export async function reconcileLine(lineId: string, target: ReconcileTarget) {
  return pb.send('/backend/v1/finance/bank/reconcile', {
    method: 'POST',
    body: { line_id: lineId, ...target },
  })
}

export async function unreconcileLine(lineId: string) {
  return pb.send('/backend/v1/finance/bank/unreconcile', {
    method: 'POST',
    body: { line_id: lineId },
  })
}

/** Movimentos ainda não conciliados, só a conta de cada um (para o painel). */
export async function listPendingLines(churchId: string) {
  return pb.collection('fin_bank_lines').getFullList<FinBankLine>({
    filter: pb.filter("church_id = {:churchId} && status = 'PENDENTE'", { churchId }),
    fields: 'id,account_id',
  })
}

/** Ignorar: o movimento sai das pendências sem gerar lançamento (e pode voltar). */
export async function setLineIgnored(lineId: string, ignored: boolean) {
  return pb
    .collection('fin_bank_lines')
    .update<FinBankLine>(lineId, { status: ignored ? 'IGNORADO' : 'PENDENTE' })
}

// ---- Saldos e extratos (API do banco) ----

export async function listBankConnections(churchId: string) {
  return pb.collection('fin_bank_connections').getFullList<FinBankConnection>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
    sort: 'created',
  })
}

export type BankConnectionInput = Pick<
  FinBankConnection,
  | 'account_id'
  | 'provider'
  | 'environment'
  | 'branch'
  | 'account_number'
  | 'account_type'
  | 'credential_key'
  | 'enabled'
  | 'auto_reconcile'
  | 'initial_days'
  | 'purpose'
  | 'reconcile_from'
  | 'history_from'
  | 'history_max'
>

export async function saveBankConnection(
  churchId: string,
  input: BankConnectionInput,
  id?: string,
) {
  const col = pb.collection('fin_bank_connections')
  return id
    ? col.update<FinBankConnection>(id, input)
    : col.create<FinBankConnection>({ ...input, church_id: churchId })
}

export async function deleteBankConnection(id: string) {
  return pb.collection('fin_bank_connections').delete(id)
}

/** "Atualizar agora": pede ao conector bancário uma busca fora do horário agendado. */
export async function requestBankSync(churchId: string): Promise<{ dispatched: boolean }> {
  return pb.send('/backend/v1/finance/bank-sync/request', {
    method: 'POST',
    body: { church_id: churchId },
  })
}

/** Movimentos do extrato de uma conta num período (YYYY-MM-DD a YYYY-MM-DD). */
export async function listStatement(churchId: string, accountId: string, from: string, to: string) {
  return pb.collection('fin_bank_lines').getFullList<FinBankLine>({
    filter: pb.filter(
      'church_id = {:churchId} && account_id = {:accountId} && date >= {:from} && date <= {:to}',
      { churchId, accountId, from: `${from} 00:00:00`, to: `${to} 23:59:59` },
    ),
    sort: 'date,created',
    expand: 'transaction_id,transaction_id.category_id',
  })
}

/** Último arquivo ou busca de cada conta que trouxe saldo do banco. */
export async function listLatestBankBalances(churchId: string) {
  const rows = await pb.collection('fin_bank_imports').getList<FinBankImport>(1, 200, {
    filter: pb.filter('church_id = {:churchId} && has_balance = true', { churchId }),
    sort: '-balance_date,-created',
  })
  const out: Record<string, FinBankImport> = {}
  for (const r of rows.items) if (!out[r.account_id]) out[r.account_id] = r
  return out
}

// ---- Fechamento do mês (hook finance_closing.js) ----

export async function listClosings(churchId: string) {
  return pb.collection('fin_closings').getFullList<FinClosing>({
    filter: byChurch(churchId),
    sort: '-month,-created',
  })
}

/** Último mês fechado (AAAA-MM) ou '' se nenhum. */
export const lockedUntil = (closings: FinClosing[]) =>
  closings
    .filter((c) => c.status === 'FECHADO')
    .map((c) => c.month)
    .sort()
    .pop() || ''

const closing = <T>(churchId: string, body: Record<string, unknown>) =>
  pb.send<T>('/backend/v1/finance/closing', {
    method: 'POST',
    body: { church_id: churchId, ...body },
  })

export const checkClosing = (churchId: string, month: string) =>
  closing<FinClosingCheck>(churchId, { action: 'check', month })

export const closeMonth = (churchId: string, month: string, notes: string) =>
  closing<FinClosingCheck>(churchId, { action: 'close', month, notes })

export const reopenMonth = (churchId: string, reason: string) =>
  closing<{ reopened: string; locked_until: string }>(churchId, { action: 'reopen', reason })

// ---- Relatórios ----

/** Lançamentos até uma data (YYYY-MM-DD), com o que os relatórios mostram. */
export async function listReportTransactions(churchId: string, to: string) {
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: pb.filter('church_id = {:churchId} && date <= {:to}', {
      churchId,
      to: `${to} 23:59:59`,
    }),
    fields:
      'id,type,amount_cents,account_id,to_account_id,category_id,person_id,is_anonymous,status,date,description,payment_method,event_id,supplier_id',
    sort: 'date',
  })
}

/** Contagens aprovadas num período, para o relatório de fechamento do culto. */
export async function listApprovedCounts(churchId: string, from: string, to: string) {
  return pb.collection('fin_counts').getFullList<FinCount>({
    filter: pb.filter(
      "church_id = {:churchId} && status = 'APROVADO' && date >= {:from} && date <= {:to}",
      { churchId, from: `${from} 00:00:00`, to: `${to} 23:59:59` },
    ),
    sort: '-date',
    expand: 'account_id,event_id',
  })
}

// ---- Auditoria do conselho fiscal (hook finance_audit.js) ----

export async function listAudits(churchId: string, month: string) {
  return pb.collection('fin_audits').getFullList<FinAudit>({
    filter: pb.filter('church_id = {:churchId} && month = {:month}', { churchId, month }),
  })
}

export async function listAuditComments(churchId: string, month: string) {
  return pb.collection('fin_audit_comments').getFullList<FinAuditComment>({
    filter: pb.filter('church_id = {:churchId} && month = {:month}', { churchId, month }),
    sort: 'created',
  })
}

/** Ressalvas ainda sem resposta da tesouraria, de qualquer mês. */
export async function listOpenObjections(churchId: string) {
  return pb.collection('fin_audits').getFullList<FinAudit>({
    filter: pb.filter("church_id = {:churchId} && status = 'RESSALVA'", { churchId }),
    fields: 'id,month,transaction_id',
  })
}

export const auditTransactions = (
  churchId: string,
  action: 'approve' | 'objection' | 'reply',
  transactionIds: string[],
  text = '',
) =>
  pb.send<{ approved: number; skipped_own: number; status: string }>('/backend/v1/finance/audit', {
    method: 'POST',
    body: { church_id: churchId, action, transaction_ids: transactionIds, text },
  })

// ---- Contribuições por pessoa e informe anual ----

const GIVING_FIELDS =
  'id,type,amount_cents,account_id,category_id,person_id,is_anonymous,status,date,description,payment_method,bank_line_id,count_id,campaign_id'

/** Entradas com o nome da pessoa (nunca as anônimas), da mais recente para a mais antiga. */
export async function listPersonGiving(churchId: string, personId: string) {
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: pb.filter(
      "church_id = {:churchId} && person_id = {:personId} && type = 'ENTRADA' && is_anonymous = false",
      { churchId, personId },
    ),
    fields: GIVING_FIELDS,
    sort: '-date,-created',
  })
}

/** Entradas com nome de um ano inteiro, para os informes de todos os contribuintes. */
export async function listYearGiving(churchId: string, year: number) {
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: pb.filter(
      "church_id = {:churchId} && type = 'ENTRADA' && is_anonymous = false && person_id != '' && date >= {:from} && date <= {:to}",
      { churchId, from: `${year}-01-01 00:00:00`, to: `${year}-12-31 23:59:59` },
    ),
    fields: GIVING_FIELDS,
    sort: 'date',
  })
}

export async function getFinSettings(churchId: string) {
  const rows = await pb.collection('fin_settings').getList<FinSettings>(1, 1, {
    filter: byChurch(churchId),
  })
  return rows.items[0] || null
}

export async function saveFinSettings(
  churchId: string,
  current: FinSettings | null,
  data: Partial<FinSettings>,
) {
  if (current) return pb.collection('fin_settings').update<FinSettings>(current.id, data)
  return pb.collection('fin_settings').create<FinSettings>({ ...data, church_id: churchId })
}

// ---- Campanhas ----

export async function listCampaigns(churchId: string) {
  return pb.collection('fin_campaigns').getFullList<FinCampaign>({
    filter: byChurch(churchId),
    sort: '-start_date,name',
  })
}

export type CampaignInput = Pick<
  FinCampaign,
  'name' | 'description' | 'goal_cents' | 'congregation' | 'color' | 'status' | 'is_public'
> & { start_date: string; end_date: string }

export async function saveCampaign(churchId: string, id: string | null, input: CampaignInput) {
  const data = {
    ...input,
    start_date: input.start_date ? toPbDate(input.start_date) : '',
    end_date: input.end_date ? toPbDate(input.end_date) : '',
  }
  if (id) return pb.collection('fin_campaigns').update<FinCampaign>(id, data)
  return pb.collection('fin_campaigns').create<FinCampaign>({ ...data, church_id: churchId })
}

export const setCampaignStatus = (id: string, status: FinCampaign['status']) =>
  pb.collection('fin_campaigns').update<FinCampaign>(id, { status })

/** Página pública de doação (sem login). */
export const getPublicCampaign = (id: string) =>
  pb.send<PublicCampaign>(`/backend/v1/public/campaign/${encodeURIComponent(id)}`, {
    method: 'GET',
  })

/** Lançamentos ligados a alguma campanha, para os totais e a lista de cada uma. */
export async function listCampaignTransactions(churchId: string) {
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: pb.filter("church_id = {:churchId} && campaign_id != ''", { churchId }),
    fields:
      'id,type,amount_cents,account_id,category_id,person_id,is_anonymous,status,date,description,payment_method,bank_line_id,count_id,bill_id,campaign_id,created_by',
    sort: '-date,-created',
  })
}

// ---- Orçamento (hook finance_budget.js) ----

export async function listBudgets(churchId: string, years: number[]) {
  return pb.collection('fin_budgets').getFullList<FinBudget>({
    filter: pb.filter(
      `church_id = {:churchId} && (${years.map((_, i) => `year = {:y${i}}`).join(' || ')})`,
      { churchId, ...Object.fromEntries(years.map((y, i) => [`y${i}`, y])) },
    ),
  })
}

export const saveBudget = (
  churchId: string,
  year: number,
  congregation: string,
  lines: { category_id: string; amount_cents: number }[],
) =>
  pb.send<{ lines: number }>('/backend/v1/finance/budget', {
    method: 'POST',
    body: { church_id: churchId, year, congregation, lines },
  })

/** Lançamentos de um período (YYYY-MM-DD), só com o que o orçamento usa. */
export async function listTransactionsBetween(churchId: string, from: string, to: string) {
  return pb.collection('fin_transactions').getFullList<FinTransaction>({
    filter: pb.filter('church_id = {:churchId} && date >= {:from} && date <= {:to}', {
      churchId,
      from: `${from} 00:00:00`,
      to: `${to} 23:59:59`,
    }),
    fields: 'id,type,amount_cents,account_id,category_id,status,date',
  })
}

// ---- Credenciais das APIs dos bancos (tela de Integrações) ----

/** Resumo do que está cadastrado; o servidor nunca devolve o segredo. */
export async function getBankSecrets(churchId: string): Promise<BankSecretsInfo> {
  return pb.send('/backend/v1/finance/bank-secrets', { query: { church_id: churchId } })
}

export async function saveBankSecret(churchId: string, input: BankSecretInput) {
  return pb.send('/backend/v1/finance/bank-secrets', {
    method: 'POST',
    body: { church_id: churchId, action: 'save', ...input },
  })
}

export async function deleteBankSecret(churchId: string, id: string) {
  return pb.send('/backend/v1/finance/bank-secrets', {
    method: 'POST',
    body: { church_id: churchId, action: 'delete', id },
  })
}

/** Gera a chave do conector; ela só aparece nesta resposta. */
export async function newBankConnectorKey(
  churchId: string,
): Promise<{ token: string; key_prefix: string }> {
  return pb.send('/backend/v1/finance/bank-secrets', {
    method: 'POST',
    body: { church_id: churchId, action: 'new_key' },
  })
}

export async function saveBankGithub(churchId: string, githubRepo: string, githubToken?: string) {
  return pb.send('/backend/v1/finance/bank-secrets', {
    method: 'POST',
    body: {
      church_id: churchId,
      action: 'github',
      github_repo: githubRepo,
      github_token: githubToken,
    },
  })
}
