// Sugestões da conciliação: para cada movimento do extrato, procura o lançamento, a conta a
// pagar/receber ou a pessoa que corresponde. Só sugere; quem confirma é o tesoureiro.

import { daysBetween } from './financeSummary'

interface LineLike {
  id: string
  account_id: string
  date: string
  amount_cents: number
  description?: string
}

interface TxLike {
  id: string
  type: string
  status: string
  account_id: string
  to_account_id?: string
  amount_cents: number
  date: string
  bank_line_id?: string
}

interface BillLike {
  id: string
  kind: string
  status: string
  amount_cents: number
  due_date: string
}

interface PersonLike {
  id: string
  name: string
  is_active?: boolean
}

export interface LineSuggestion<T, B, P> {
  tx?: T
  bill?: B
  person?: P
}

/** O lançamento movimenta esta conta no mesmo sentido do extrato? */
export function sameSide(line: LineLike, tx: TxLike) {
  if (line.amount_cents > 0)
    return (
      (tx.type === 'ENTRADA' && tx.account_id === line.account_id) ||
      (tx.type === 'TRANSFERENCIA' && tx.to_account_id === line.account_id)
    )
  return (tx.type === 'SAIDA' || tx.type === 'TRANSFERENCIA') && tx.account_id === line.account_id
}

/** "JOÃO  Mendes" → ["JOAO", "MENDES"] */
export const nameTokens = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 2)

/** A pessoa cujo primeiro e último nome aparecem no histórico (ex.: "PIX RECEBIDO JOAO S MENDES"). */
export function personInDescription<P extends PersonLike>(description: string, people: P[]) {
  const words = new Set(nameTokens(description))
  const hits = people.filter((p) => {
    if (p.is_active === false) return false
    const t = nameTokens(p.name).filter((w) => !['DA', 'DE', 'DO', 'DAS', 'DOS'].includes(w))
    return t.length >= 2 && words.has(t[0]) && words.has(t[t.length - 1])
  })
  return hits.length === 1 ? hits[0] : undefined
}

/**
 * Sugere, para cada movimento pendente, o lançamento de mesmo valor e sentido mais próximo da
 * data (até `txDays` dias); sem lançamento, a conta em aberto de mesmo valor com vencimento até
 * `billDays` dias; e, nos créditos, a pessoa citada no histórico. Um lançamento ou conta só é
 * sugerido para um movimento.
 */
export function suggestMatches<
  L extends LineLike,
  T extends TxLike,
  B extends BillLike,
  P extends PersonLike,
>(
  lines: L[],
  txs: T[],
  bills: B[],
  people: P[],
  { txDays = 5, billDays = 10 } = {},
): Map<string, LineSuggestion<T, B, P>> {
  const out = new Map<string, LineSuggestion<T, B, P>>()
  const usedTx = new Set<string>()
  const usedBill = new Set<string>()
  const ordered = [...lines].sort((a, b) => a.date.localeCompare(b.date))
  for (const line of ordered) {
    const abs = Math.abs(line.amount_cents)
    const s: LineSuggestion<T, B, P> = {}
    let best: { tx: T; d: number } | null = null
    for (const tx of txs) {
      if (tx.status !== 'CONFIRMADO' || tx.bank_line_id || usedTx.has(tx.id)) continue
      if (tx.amount_cents !== abs || !sameSide(line, tx)) continue
      const d = Math.abs(daysBetween(line.date, tx.date))
      if (d <= txDays && (!best || d < best.d)) best = { tx, d }
    }
    if (best) {
      s.tx = best.tx
      usedTx.add(best.tx.id)
    } else {
      const kind = line.amount_cents > 0 ? 'RECEBER' : 'PAGAR'
      let bestBill: { bill: B; d: number } | null = null
      for (const bill of bills) {
        if (bill.status !== 'ABERTO' || bill.kind !== kind || usedBill.has(bill.id)) continue
        if (bill.amount_cents !== abs) continue
        const d = Math.abs(daysBetween(line.date, bill.due_date))
        if (d <= billDays && (!bestBill || d < bestBill.d)) bestBill = { bill, d }
      }
      if (bestBill) {
        s.bill = bestBill.bill
        usedBill.add(bestBill.bill.id)
      }
    }
    if (line.amount_cents > 0) s.person = personInDescription(line.description || '', people)
    out.set(line.id, s)
  }
  return out
}
