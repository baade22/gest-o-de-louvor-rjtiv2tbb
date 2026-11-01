import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { accountBalances } from '@/lib/financeSummary'
import { txEffect } from '@/lib/balanceDiff'
import { isRealized, isReconciledSide, type ReconcileStarts } from '@/lib/realizedBalance'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import type { FinAccount, FinTransaction } from '@/types/finance'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FinanceLookups } from './TransactionSheet'
import { cardClass, shortDate } from './shared'

/**
 * Movimentos de cada conta no LouvorFlow (banco, aplicação ou caixa em espécie), com o saldo
 * conciliado linha a linha. Na conta bancária, o que ainda não foi conciliado aparece como
 * "a conciliar" e só entra no saldo previsto.
 */
export function LedgerStatement({
  churchAccounts,
  ledger,
  starts,
  lookups,
}: {
  churchAccounts: FinAccount[]
  ledger: FinTransaction[]
  starts: ReconcileStarts
  lookups: FinanceLookups
}) {
  const [accountId, setAccountId] = useState('')
  const [month, setMonth] = useState(getLocalTodayYMD().slice(0, 7))
  const account = churchAccounts.find((a) => a.id === accountId) || churchAccounts[0]
  const id = account?.id || ''
  const isCash = account?.kind === 'CAIXA'

  const data = useMemo(() => {
    if (!account) return null
    const first = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    const include = (tx: FinTransaction, accId: string) => isRealized(tx, accId, starts)
    const before = ledger.filter((tx) => tx.date.slice(0, 10) < first)
    const opening = accountBalances([account], before, include)[id] || 0
    const rows = ledger
      .filter((tx) => {
        const d = tx.date.slice(0, 10)
        return d >= first && d < next && txEffect(tx, id) !== 0
      })
      .sort((a, b) => a.date.localeCompare(b.date))
    let running = opening
    let pendingIn = 0
    let pendingOut = 0
    const items = rows.map((tx) => {
      const effect = txEffect(tx, id)
      const realized = isRealized(tx, id, starts)
      if (realized) running += effect
      else if (effect > 0) pendingIn += effect
      else pendingOut += -effect
      return { tx, effect, realized, reconciled: isReconciledSide(tx, id), running }
    })
    return { opening, closing: running, pendingIn, pendingOut, items }
  }, [account, id, ledger, month, starts])

  const describe = (tx: FinTransaction) => {
    const accName = (x?: string) => lookups.accounts.find((a) => a.id === x)?.name || 'outra conta'
    if (tx.type === 'TRANSFERENCIA') {
      return tx.account_id === id
        ? `Transferência para ${accName(tx.to_account_id)}`
        : `Transferência de ${accName(tx.account_id)}`
    }
    return (
      tx.description ||
      lookups.categories.find((c) => c.id === tx.category_id)?.name ||
      'Lançamento'
    )
  }
  const category = (tx: FinTransaction) =>
    tx.type === 'TRANSFERENCIA'
      ? tx.description || ''
      : lookups.categories.find((c) => c.id === tx.category_id)?.name || ''

  if (!account || !data) return null
  const hasStart = !!starts[id]

  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center">
        <div className="px-1">
          <h2 className="font-semibold text-slate-900">Movimentos no LouvorFlow</h2>
          <p className="text-xs text-slate-500">
            {isCash
              ? 'Dinheiro em espécie: vale tudo o que foi lançado.'
              : hasStart
                ? `Só o que foi conciliado com o extrato entra no saldo (conciliação desde ${shortDate(starts[id], true)}).`
                : 'Sem extrato carregado: vale tudo o que foi lançado.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Select value={id} onValueChange={setAccountId}>
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-52" aria-label="Conta">
              <SelectValue placeholder="Conta" />
            </SelectTrigger>
            <SelectContent>
              {churchAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-9 w-[160px]"
            aria-label="Mês"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-200 text-center sm:grid-cols-4">
        <div className="p-3">
          <div className="text-xs text-slate-500">Saldo no início</div>
          <div className="text-sm font-bold tabular-nums sm:text-base">
            {formatCents(data.opening)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-xs text-slate-500">Saldo conciliado no fim</div>
          <div className="text-sm font-bold tabular-nums sm:text-base">
            {formatCents(data.closing)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-xs text-slate-500">A conciliar</div>
          <div className="text-sm font-bold tabular-nums text-amber-700 sm:text-base">
            {data.pendingIn || data.pendingOut
              ? `+${formatCents(data.pendingIn)} −${formatCents(data.pendingOut)}`
              : '—'}
          </div>
        </div>
        <div className="p-3">
          <div className="text-xs text-slate-500">Previsto no fim</div>
          <div className="text-sm font-bold tabular-nums sm:text-base">
            {formatCents(data.closing + data.pendingIn - data.pendingOut)}
          </div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">
          Nenhum lançamento nesta conta neste mês.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...data.items].reverse().map(({ tx, effect, realized, reconciled, running }) => (
            <li key={tx.id} className="flex items-center gap-3 px-4 py-2.5">
              <div
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                  effect > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                )}
              >
                {effect > 0 ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </div>
              <span className="w-12 shrink-0 text-xs tabular-nums text-slate-500">
                {shortDate(tx.date)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">{describe(tx)}</div>
                <div className="truncate text-xs">
                  {reconciled ? (
                    <span className="text-emerald-700">
                      <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                      Conciliado
                    </span>
                  ) : !realized ? (
                    <Link
                      to={`/financeiro/conciliacao?conta=${id}`}
                      className="font-semibold text-amber-700 hover:underline"
                    >
                      <Clock3 className="mr-1 inline h-3.5 w-3.5" />A conciliar (fora do saldo)
                    </Link>
                  ) : (
                    <span className="text-slate-500">
                      {isCash ? 'Em espécie' : hasStart ? 'Antes da conciliação' : 'Lançado'}
                    </span>
                  )}
                  {category(tx) && <span className="text-slate-400"> · {category(tx)}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    effect > 0 ? 'text-emerald-700' : 'text-rose-700',
                    !realized && 'opacity-60',
                  )}
                >
                  {effect < 0 ? '− ' : ''}
                  {formatCents(Math.abs(effect))}
                </div>
                <div className="text-[11px] tabular-nums text-slate-500">
                  {realized ? `saldo ${formatCents(running)}` : 'não entra no saldo'}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
