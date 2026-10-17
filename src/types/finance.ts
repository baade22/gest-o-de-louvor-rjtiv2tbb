// Tipos do módulo Financeiro. Valores sempre em centavos (inteiros).

export type FinDirection = 'ENTRADA' | 'SAIDA'
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

export interface Person extends BaseRecord {
  name: string
  phone?: string
  email?: string
  document?: string
  user_id?: string
  notes?: string
  is_active: boolean
}

export interface FinAccount extends BaseRecord {
  name: string
  kind: FinAccountKind
  bank_name?: string
  agency?: string
  account_number?: string
  opening_balance_cents: number
  opening_date?: string
  is_active: boolean
}

export interface FinCategory extends BaseRecord {
  name: string
  direction: FinDirection
  parent_id?: string
  is_contribution: boolean
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
  type: FinDirection
  date: string
  amount_cents: number
  description?: string
  account_id: string
  category_id?: string
  cost_center_id?: string
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
    category_id?: FinCategory
    cost_center_id?: FinCostCenter
    person_id?: Person
    supplier_id?: FinSupplier
    event_id?: { id: string; title: string; date: string }
  }
}
