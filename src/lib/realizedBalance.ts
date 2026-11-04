// Saldo realizado (conciliado), como nos ERPs (ex.: "saldo conciliado" do Omie e o saldo do
// Eklesia): numa conta bancária, um lançamento só vale no saldo depois de conciliado com o
// movimento do extrato (importado por OFX ou trazido pela API). O que ainda não foi conciliado
// fica como "a conciliar" e entra só no saldo previsto. A API e o OFX só carregam o extrato.
//
// Antes do início da conciliação da conta (o primeiro movimento do extrato que entra na
// conciliação) vale tudo o que foi lançado, como antes. Conta de caixa (dinheiro em espécie)
// e conta sem extrato não têm o que conciliar: vale tudo.
//
// Conta de fundo de investimento (ex.: Fundo Max DI): o extrato dela só traz as aplicações e
// os resgates espelhados da conta-corrente. Rendimento, IR e outros lançamentos do fundo nunca
// aparecem num extrato, então valem sempre; só as transferências esperam a conciliação.

import type { FinTransaction } from '@/types/finance'

/**
 * Conta → dia (AAAA-MM-DD) em que a conciliação começa. Conta fora do mapa: vale tudo.
 * A chave `fundo:<conta>` marca a conta de fundo (extrato só com aplicações e resgates).
 */
export type ReconcileStarts = Record<string, string>

export const fundKey = (accountId: string) => `fundo:${accountId}`

/** A conta é de fundo (o extrato só traz aplicações e resgates)? */
export const isFundAccount = (starts: ReconcileStarts, accountId: string) =>
  !!starts[fundKey(accountId)]

type Tx = Pick<FinTransaction, 'type' | 'account_id' | 'date'> &
  Partial<Pick<FinTransaction, 'to_account_id' | 'bank_line_id' | 'to_bank_line_id'>>

/** O lado desta conta está conciliado com o extrato? */
export function isReconciledSide(tx: Tx, accountId: string) {
  if (tx.type === 'TRANSFERENCIA' && tx.to_account_id === accountId && tx.account_id !== accountId)
    return !!tx.to_bank_line_id
  return !!tx.bank_line_id
}

/** O lançamento já vale no saldo desta conta? */
export function isRealized(tx: Tx, accountId: string, starts: ReconcileStarts) {
  const start = starts[accountId]
  if (!start) return true
  if ((tx.date || '').slice(0, 10) < start) return true
  if (tx.type !== 'TRANSFERENCIA' && isFundAccount(starts, accountId)) return true
  return isReconciledSide(tx, accountId)
}

export const realizedFilter = (starts: ReconcileStarts) => (tx: Tx, accountId: string) =>
  isRealized(tx, accountId, starts)
