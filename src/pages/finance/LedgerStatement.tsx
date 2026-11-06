import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { accountBalances } from '@/lib/financeSummary'
import { txEffect } from '@/lib/balanceDiff'
import {
  isFundAccount,
  isRealized,
  isReconciledSide,
  type ReconcileStarts,
} from '@/lib/realizedBalance'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import type { FinAccount, FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
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
 * Extrato de cada conta (banco, aplicação ou caixa em espécie): só o que sabemos que
 * aconteceu. Na conta bancária, só o que foi conciliado com o banco; o resto fica na
 * conciliação e aparece aqui só como um aviso.
 */
export function LedgerStatement({
  accountId: controlledId,
  onAccountChange,
  churchAccounts,
  ledger,
  starts,
  lookups,
}: {
  accountId?: string
  onAccountChange?: (id: string) => void
  churchAccounts: FinAccount[]
  ledger: FinTransaction[]
  starts: ReconcileStarts
  lookups: FinanceLookups
}) {
  const [ownId, setOwnId] = useState('')
  const accountId = controlledId ?? ownId
  const setAccountId = onAccountChange ?? setOwnId
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
    let entradas = 0
    let saidas = 0
    let pending = 0
    const items: {
      tx: FinTransaction
      effect: number
      reconciled: boolean
      running: number
    }[] = []
    for (const tx of rows) {
      const effect = txEffect(tx, id)
      // Ainda não conciliado: fica fora do extrato (está na conciliação)
      if (!isRealized(tx, id, starts)) {
        pending++
        continue
      }
      running += effect
      if (effect > 0) entradas += effect
      else saidas += -effect
      items.push({ tx, effect, reconciled: isReconciledSide(tx, id), running })
    }
    return { opening, closing: running, entradas, saidas, pending, items }
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

  const exportCsv = () => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`
    const money = (c: number) => (c / 100).toFixed(2).replace('.', ',')
    const head = 'Data;Descrição;Categoria;Valor;Saldo'
    const body = data.items.map(({ tx, effect, running }) =>
      [
        shortDate(tx.date, true),
        q(describe(tx)),
        q(category(tx)),
        money(effect),
        money(running),
      ].join(';'),
    )
    const blob = new Blob(['\ufeff' + [head, ...body].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extrato-${account.name.toLowerCase().replace(/\s+/g, '-')}-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div id="extrato" className={cn(cardClass, 'scroll-mt-4')}>
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center">
        <div className="px-1">
          <h2 className="font-semibold text-slate-900">Extrato</h2>
          <p className="text-xs text-slate-500">
            {isCash
              ? 'Dinheiro em espécie: vale tudo o que foi lançado.'
              : hasStart && isFundAccount(starts, id)
                ? 'Fundo: rendimentos entram na hora; aplicações e resgates, depois de conciliados.'
                : hasStart
                  ? 'Só o que foi conciliado com o banco.'
                  : 'Sem extrato do banco: vale tudo o que foi lançado.'}
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
            className="h-9 w-full sm:w-[170px]"
            aria-label="Mês"
          />
          <Button
            variant="outline"
            className="h-9 gap-1.5 rounded-lg"
            onClick={exportCsv}
            disabled={!data.items.length}
          >
            <Download className="h-4 w-4" /> Planilha
          </Button>
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
          <div className="text-xs text-slate-500">Entradas</div>
          <div className="text-sm font-bold tabular-nums text-emerald-700 sm:text-base">
            {formatCents(data.entradas)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-xs text-slate-500">Saídas</div>
          <div className="text-sm font-bold tabular-nums text-rose-700 sm:text-base">
            {formatCents(data.saidas)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-xs text-slate-500">Saldo no fim</div>
          <div className="text-sm font-bold tabular-nums sm:text-base">
            {formatCents(data.closing)}
          </div>
        </div>
      </div>

      {data.pending > 0 && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-800">
          <Clock3 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {data.pending === 1
              ? '1 lançamento deste mês ainda não foi conciliado e fica fora do extrato.'
              : `${data.pending} lançamentos deste mês ainda não foram conciliados e ficam fora do extrato.`}
          </span>
          <Link
            to={`/financeiro/conciliacao?conta=${id}`}
            className="shrink-0 font-semibold text-teal-700 hover:underline"
          >
            Conciliar
          </Link>
        </div>
      )}

      {data.items.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">
          Nenhum lançamento nesta conta neste mês.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...data.items].reverse().map(({ tx, effect, reconciled, running }) => (
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
              <span className="hidden w-12 shrink-0 text-xs tabular-nums text-slate-500 sm:block">
                {shortDate(tx.date)}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-900 sm:line-clamp-1"
                  title={describe(tx)}
                >
                  {describe(tx)}
                </div>
                <div className="truncate text-xs">
                  <span className="tabular-nums text-slate-500 sm:hidden">
                    {shortDate(tx.date)} ·{' '}
                  </span>
                  {reconciled ? (
                    <span className="text-emerald-700">
                      <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                      Conciliado
                    </span>
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
                  )}
                >
                  {effect < 0 ? '− ' : ''}
                  {formatCents(Math.abs(effect))}
                </div>
                <div className="text-[11px] tabular-nums text-slate-500">
                  saldo {formatCents(running)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
