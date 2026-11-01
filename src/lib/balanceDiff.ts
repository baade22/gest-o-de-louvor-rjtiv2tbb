// De onde vem a diferença entre o saldo do banco e o saldo no LouvorFlow numa data.
//
// O extrato diz quanto o banco tinha antes do primeiro movimento carregado
// (saldo do banco − soma dos movimentos até a data). A partir daí a diferença se divide em:
// - antes do extrato: saldo inicial da conta ou lançamentos anteriores ao primeiro movimento;
// - movimentos ignorados, a conciliar ou só de visualização: o banco mexeu, o LouvorFlow não;
// - lançamentos sem movimento no extrato: o LouvorFlow mexeu, o banco não;
// - conciliados com valor ou data diferente do movimento.
// As partes somam exatamente a diferença.

import type { FinAccount, FinBankLine, FinTransaction } from '@/types/finance'

type Tx = Pick<
  FinTransaction,
  'id' | 'type' | 'amount_cents' | 'account_id' | 'status' | 'date' | 'description'
> &
  Partial<Pick<FinTransaction, 'to_account_id' | 'bank_line_id' | 'to_bank_line_id'>>
type Line = Pick<
  FinBankLine,
  'id' | 'date' | 'amount_cents' | 'description' | 'status' | 'transaction_id'
>

export type DiffKind = 'ANTES' | 'IGNORADO' | 'PENDENTE' | 'EXTRATO' | 'SEM_EXTRATO' | 'CONCILIADO'

export interface DiffItem {
  date: string
  description: string
  /** Quanto este item explica da diferença (banco − LouvorFlow) */
  cents: number
  /** Valor do movimento no banco e do lançamento, quando há */
  bank_cents?: number
  system_cents?: number
  line_id?: string
  transaction_id?: string
}

export interface DiffGroup {
  kind: DiffKind
  cents: number
  items: DiffItem[]
}

export interface BalanceDiff {
  day: string
  bank_cents: number
  system_cents: number
  diff_cents: number
  /** Primeiro movimento do extrato (até a data) */
  first_day: string
  /** Saldo do banco antes do primeiro movimento, pelo extrato */
  bank_before_cents: number
  system_before_cents: number
  groups: DiffGroup[]
}

const day = (s?: string) => (s || '').slice(0, 10)

/** Efeito do lançamento no saldo desta conta (0 se não mexe nela ou foi estornado). */
export function txEffect(tx: Tx, accountId: string) {
  if (tx.status === 'ESTORNADO') return 0
  if (tx.type === 'TRANSFERENCIA') {
    let v = 0
    if (tx.account_id === accountId) v -= tx.amount_cents
    if (tx.to_account_id === accountId) v += tx.amount_cents
    return v
  }
  if (tx.account_id !== accountId) return 0
  return tx.type === 'SAIDA' ? -tx.amount_cents : tx.amount_cents
}

/** Movimento do extrato desta conta ligado ao lançamento (o lado desta conta). */
function linkedLine(tx: Tx, accountId: string, byId: Map<string, Line>) {
  const ids =
    tx.type === 'TRANSFERENCIA'
      ? [
          tx.account_id === accountId ? tx.bank_line_id : '',
          tx.to_account_id === accountId ? tx.to_bank_line_id : '',
        ]
      : [tx.bank_line_id]
  for (const id of ids) if (id && byId.has(id)) return byId.get(id)
  return undefined
}

export function explainBalanceDiff(
  account: Pick<FinAccount, 'id' | 'opening_balance_cents'>,
  txs: Tx[],
  lines: Line[],
  bankCents: number,
  balanceDay: string,
): BalanceDiff {
  const id = account.id
  const mine = txs.filter((tx) => txEffect(tx, id) !== 0)
  const upTo = lines.filter((l) => day(l.date) <= balanceDay)
  const first = upTo.reduce((m, l) => (!m || day(l.date) < m ? day(l.date) : m), '')
  const byId = new Map(upTo.map((l) => [l.id, l]))
  const inRange = (d: string) => !!first && d >= first && d <= balanceDay

  const systemCents =
    (account.opening_balance_cents || 0) +
    mine.filter((tx) => day(tx.date) <= balanceDay).reduce((s, tx) => s + txEffect(tx, id), 0)
  const bankBefore = bankCents - upTo.reduce((s, l) => s + l.amount_cents, 0)
  const systemBefore = first
    ? (account.opening_balance_cents || 0) +
      mine.filter((tx) => day(tx.date) < first).reduce((s, tx) => s + txEffect(tx, id), 0)
    : systemCents

  const groups: Record<DiffKind, DiffGroup> = {
    ANTES: { kind: 'ANTES', cents: 0, items: [] },
    IGNORADO: { kind: 'IGNORADO', cents: 0, items: [] },
    PENDENTE: { kind: 'PENDENTE', cents: 0, items: [] },
    EXTRATO: { kind: 'EXTRATO', cents: 0, items: [] },
    SEM_EXTRATO: { kind: 'SEM_EXTRATO', cents: 0, items: [] },
    CONCILIADO: { kind: 'CONCILIADO', cents: 0, items: [] },
  }
  const add = (kind: DiffKind, item: DiffItem) => {
    if (item.cents === 0) return
    groups[kind].cents += item.cents
    groups[kind].items.push(item)
  }

  if (first) {
    add('ANTES', {
      date: first,
      description: 'Saldo antes do primeiro movimento do extrato',
      cents: bankBefore - systemBefore,
      bank_cents: bankBefore,
      system_cents: systemBefore,
    })
  } else {
    add('ANTES', {
      date: balanceDay,
      description: 'Sem movimentos do extrato até esta data',
      cents: bankCents - systemCents,
      bank_cents: bankCents,
      system_cents: systemCents,
    })
  }

  // Lançamento de cada movimento conciliado (pelo lado desta conta)
  const txOfLine = new Map<string, Tx>()
  for (const tx of mine) {
    const l = linkedLine(tx, id, byId)
    if (l) txOfLine.set(l.id, tx)
  }

  for (const l of upTo) {
    const base = {
      date: day(l.date),
      description: l.description || 'Movimento',
      bank_cents: l.amount_cents,
      line_id: l.id,
    }
    const tx = txOfLine.get(l.id)
    if (tx) {
      const counted = inRange(day(tx.date)) ? txEffect(tx, id) : 0
      add('CONCILIADO', {
        ...base,
        cents: l.amount_cents - counted,
        system_cents: txEffect(tx, id),
        transaction_id: tx.id,
        description:
          counted === 0
            ? `${base.description} (lançado em ${day(tx.date).split('-').reverse().join('/')})`
            : base.description,
      })
      continue
    }
    const kind: DiffKind =
      l.status === 'IGNORADO'
        ? 'IGNORADO'
        : l.status === 'PENDENTE'
          ? 'PENDENTE'
          : l.status === 'EXTRATO'
            ? 'EXTRATO'
            : 'CONCILIADO'
    add(kind, {
      ...base,
      cents: l.amount_cents,
      description:
        kind === 'CONCILIADO'
          ? `${base.description} (o lançamento ligado foi estornado ou é de outra conta)`
          : base.description,
    })
  }

  // Lançamentos do período que não estão ligados a um movimento até a data
  for (const tx of mine) {
    const d = day(tx.date)
    if (!inRange(d)) continue
    const l = linkedLine(tx, id, byId)
    if (l) continue
    add('SEM_EXTRATO', {
      date: d,
      description: tx.description || 'Lançamento',
      cents: -txEffect(tx, id),
      system_cents: txEffect(tx, id),
      transaction_id: tx.id,
    })
  }

  const order: DiffKind[] = [
    'IGNORADO',
    'SEM_EXTRATO',
    'ANTES',
    'PENDENTE',
    'EXTRATO',
    'CONCILIADO',
  ]
  return {
    day: balanceDay,
    bank_cents: bankCents,
    system_cents: systemCents,
    diff_cents: bankCents - systemCents,
    first_day: first,
    bank_before_cents: bankBefore,
    system_before_cents: systemBefore,
    groups: order
      .map((k) => groups[k])
      .filter((g) => g.items.length > 0)
      .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.date.localeCompare(b.date)) })),
  }
}
