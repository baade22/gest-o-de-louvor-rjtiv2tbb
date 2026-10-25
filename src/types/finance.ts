// Tipos do módulo Financeiro. Valores sempre em centavos (inteiros).

import type { Person as MemberPerson } from './index'

export type FinDirection = 'ENTRADA' | 'SAIDA'
/** Transferência tira de uma conta e põe em outra; não é entrada nem saída. */
export type FinTransactionType = FinDirection | 'TRANSFERENCIA'
export type FinAccountKind = 'CAIXA' | 'BANCO' | 'APLICACAO' | 'OUTRA'
export type FinPaymentMethod =
  | 'DINHEIRO'
  | 'PIX'
  | 'CARTAO'
  | 'TRANSFERENCIA'
  | 'BOLETO'
  | 'CHEQUE'
  | 'OUTRO'
export type FinTransactionStatus = 'CONFIRMADO' | 'ESTORNADO'

interface BaseRecord {
  id: string
  church_id: string
  created: string
  updated: string
}

/** Pessoa da igreja: a mesma ficha da Membresia; o Financeiro usa o CPF e o arquivamento. */
export type Person = MemberPerson & { document?: string; is_active: boolean }

export interface FinAccount extends BaseRecord {
  name: string
  kind: FinAccountKind
  bank_name?: string
  agency?: string
  account_number?: string
  opening_balance_cents: number
  opening_date?: string
  /** Congregação dona da conta (ex.: Aldeia); vazio = da igreja toda. */
  congregation?: string
  /** Conta no plano do contador, para a exportação contábil. */
  accounting_code?: string
  /** Saldo mínimo que a tesouraria quer manter; o fluxo de caixa avisa abaixo dele. */
  min_balance_cents?: number
  is_active: boolean
}

export interface FinCategory extends BaseRecord {
  name: string
  direction: FinDirection
  parent_id?: string
  is_contribution: boolean
  /** Conta no plano do contador, para a exportação contábil. */
  accounting_code?: string
  is_active: boolean
}

export interface FinCostCenter extends BaseRecord {
  name: string
  is_active: boolean
}

export interface FinSupplier extends BaseRecord {
  name: string
  document?: string
  pix_key?: string
  phone?: string
  notes?: string
  is_active: boolean
}

export interface FinTransaction extends BaseRecord {
  type: FinTransactionType
  date: string
  amount_cents: number
  description?: string
  account_id: string
  /** Conta de destino, só em transferências. */
  to_account_id?: string
  /** Contagem do culto que gerou o lançamento. */
  count_id?: string
  /** Conta a pagar ou a receber que o lançamento quitou. */
  bill_id?: string
  /** Movimento do extrato com que o lançamento foi conciliado. */
  bank_line_id?: string
  category_id?: string
  cost_center_id?: string
  /** Campanha para a qual a entrada (ou saída) conta. */
  campaign_id?: string
  payment_method?: FinPaymentMethod | ''
  person_id?: string
  is_anonymous: boolean
  supplier_id?: string
  event_id?: string
  attachment?: string
  notes?: string
  status: FinTransactionStatus
  void_reason?: string
  created_by: string
  expand?: {
    account_id?: FinAccount
    to_account_id?: FinAccount
    category_id?: FinCategory
    cost_center_id?: FinCostCenter
    person_id?: Person
    supplier_id?: FinSupplier
    event_id?: { id: string; title: string; date: string }
    campaign_id?: FinCampaign
  }
}

export type FinCountStatus = 'CONTADO' | 'APROVADO' | 'CANCELADO'

export interface FinCountEnvelope {
  /** Vazio = envelope sem nome (anônimo). */
  person_id?: string
  category_id: string
  amount_cents: number
}

/** Contagem do culto: uma pessoa conta, outra confere e aprova. */
export interface FinCount extends BaseRecord {
  date: string
  event_id?: string
  account_id: string
  cash_cents: number
  offering_category_id: string
  envelopes: FinCountEnvelope[] | null
  notes?: string
  difference_note?: string
  status: FinCountStatus
  counted_by: string
  approved_by?: string
  approved_at?: string
  counted_by_name?: string
  approved_by_name?: string
  expand?: {
    account_id?: FinAccount
    event_id?: { id: string; title: string; date: string }
  }
}

export type FinBillKind = 'PAGAR' | 'RECEBER'
export type FinBillStatus = 'ABERTO' | 'PAGO' | 'CANCELADO'
export type FinBillDocumentType =
  | 'BOLETO'
  | 'NOTA_FISCAL'
  | 'RECIBO'
  | 'FATURA'
  | 'CONTRATO'
  | 'OUTRO'

/** Conta a pagar (fornecedor) ou a receber (pessoa), com vencimento. A baixa gera o lançamento. */
export interface FinBill extends BaseRecord {
  kind: FinBillKind
  description: string
  amount_cents: number
  due_date: string
  issue_date?: string
  category_id?: string
  cost_center_id?: string
  supplier_id?: string
  person_id?: string
  campaign_id?: string
  /** Conta prevista para pagar ou receber. */
  account_id?: string
  document_type?: FinBillDocumentType | ''
  document_number?: string
  attachment?: string
  notes?: string
  /** Contas criadas juntas pela repetição mensal dividem o mesmo grupo. */
  recurrence_group?: string
  installment?: number
  installments?: number
  status: FinBillStatus
  paid_at?: string
  paid_amount_cents?: number
  paid_account_id?: string
  transaction_id?: string
  expand?: {
    category_id?: FinCategory
    supplier_id?: FinSupplier
    person_id?: Person
    account_id?: FinAccount
    paid_account_id?: FinAccount
  }
}

export type FinBankLineStatus = 'PENDENTE' | 'CONCILIADO' | 'IGNORADO'

/** Movimento do extrato bancário importado (OFX). Valor positivo entrou, negativo saiu. */
export interface FinBankLine extends BaseRecord {
  account_id: string
  import_id?: string
  fitid: string
  date: string
  amount_cents: number
  description?: string
  status: FinBankLineStatus
  transaction_id?: string
  reconciled_at?: string
  reconciled_by_name?: string
  expand?: {
    transaction_id?: FinTransaction
  }
}

/** Arquivo de extrato importado. */
export interface FinBankImport extends BaseRecord {
  account_id: string
  file_name?: string
  start_date?: string
  end_date?: string
  balance_cents?: number
  balance_date?: string
  has_balance?: boolean
  lines_created?: number
  lines_skipped?: number
  imported_by_name?: string
}

export type FinBankProvider = 'CORA' | 'BRADESCO'
export type FinBankEnvironment = 'PRODUCAO' | 'TESTE'

/** Conta ligada à API do banco. As credenciais ficam no conector bancário, não aqui. */
export interface FinBankConnection extends BaseRecord {
  account_id: string
  provider: FinBankProvider
  environment: FinBankEnvironment
  branch?: string
  account_number?: string
  account_type?: 'CC' | 'CP' | ''
  credential_key?: string
  enabled: boolean
  auto_reconcile: boolean
  initial_days?: number
  // Situação, gravada só pelo servidor
  last_sync_at?: string
  last_status?: 'OK' | 'ERRO' | ''
  last_error?: string
  balance_cents?: number
  available_cents?: number
  balance_at?: string
  has_balance?: boolean
  last_created?: number
  last_auto_reconciled?: number
  sync_requested_at?: string
}

export type FinClosingStatus = 'FECHADO' | 'REABERTO'

export interface FinClosingAccount {
  id: string
  name: string
  kind: FinAccountKind
  congregation?: string
  opening_cents: number
  income_cents: number
  expense_cents: number
  closing_cents: number
}

export interface FinClosingSummary {
  accounts: FinClosingAccount[]
  totals: { opening: number; income: number; expense: number; closing: number }
}

/** Item da conferência do fechamento: blocking impede fechar; warning só avisa. */
export interface FinClosingItem {
  key: string
  level: 'ok' | 'warning' | 'blocking' | 'info'
  title: string
  detail: string
  count: number
  link?: string
}

export interface FinClosing extends BaseRecord {
  month: string
  status: FinClosingStatus
  notes?: string
  summary?: FinClosingSummary
  checklist?: FinClosingItem[]
  closed_by?: string
  closed_by_name?: string
  closed_at?: string
  reopened_by_name?: string
  reopened_at?: string
  reopen_reason?: string
}

export interface FinClosingCheck {
  month: string
  /** Primeiro mês conferido (o seguinte ao último fechado); vazio = desde o início. */
  from_month: string
  /** Último mês fechado; vazio = nenhum. */
  locked_until: string
  can_close: boolean
  problems: string[]
  items: FinClosingItem[]
  summary: FinClosingSummary
}

/** Quem assina os relatórios (ex.: Tesoureira, Pastor presidente). */
export interface FinSigner extends BaseRecord {
  name: string
  title?: string
  document?: string
  is_active: boolean
}

export type FinAuditStatus = 'APROVADO' | 'RESSALVA' | 'RESPONDIDA'

/** Auditoria de um lançamento pelo conselho fiscal (gravada só pelo hook finance_audit.js). */
export interface FinAudit extends BaseRecord {
  transaction_id: string
  month: string
  status: FinAuditStatus
  approved_by?: string
  approved_by_name?: string
  approved_at?: string
  /** "updated" do lançamento na aprovação; se mudou depois, a aprovação não vale mais. */
  tx_updated?: string
}

export interface FinAuditComment extends BaseRecord {
  audit_id: string
  month: string
  kind: 'RESSALVA' | 'RESPOSTA' | 'APROVACAO'
  text: string
  author_id: string
  author_name: string
  author_role: string
}

/** Dados da igreja que saem no informe anual de contribuições (um registro por igreja). */
export interface FinSettings extends BaseRecord {
  legal_name?: string
  cnpj?: string
  address?: string
  city?: string
  /** Texto do rodapé do informe. */
  statement_note?: string
}

export type FinCampaignStatus = 'ATIVA' | 'ENCERRADA'
export type FinCampaignColor = 'TEAL' | 'INDIGO' | 'ORANGE' | 'ROSE' | 'SKY' | 'AMBER'

/** Campanha: arrecadação com meta e prazo (reforma, missões, congresso). */
export interface FinCampaign extends BaseRecord {
  name: string
  description?: string
  goal_cents?: number
  start_date?: string
  end_date?: string
  /** Vazio = a igreja toda. */
  congregation?: string
  color?: FinCampaignColor | ''
  status: FinCampaignStatus
}
