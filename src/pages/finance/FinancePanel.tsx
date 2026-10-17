import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  Landmark,
  PiggyBank,
  Plus,
  Scale,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { accountBalances, monthOf, monthlySeries, periodTotals } from '@/lib/financeSummary'
import { listAccounts, listCategories, listLedger } from '@/services/finance'
import type { FinAccount, FinAccountKind, FinCategory, FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MonthSwitcher,
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  monthLabel,
  monthShort,
  primaryButtonClass,
  useFinanceAccess,
} from './shared'

const KIND_ICON: Record<FinAccountKind, LucideIcon> = {
  CAIXA: Banknote,
  BANCO: Landmark,
  APLICACAO: PiggyBank,
  OUTRA: Wallet,
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  tone: string
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className={cn(cardClass, 'p-4 sm:p-5')}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
        <span className={cn('grid h-8 w-8 place-items-center rounded-lg', tone)}>
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <div className="mt-3 text-[22px] font-bold tabular-nums tracking-tight text-slate-900 sm:text-[25px]">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export default function FinancePanel() {
  const { currentChurch } = useAuth()
  const { canEdit } = useFinanceAccess()
  const churchId = currentChurch?.id
  const [month, setMonth] = useState(() => getLocalTodayYMD().slice(0, 7))
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [ledger, setLedger] = useState<FinTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!churchId) return
    setLoading(true)
    Promise.all([listAccounts(churchId), listCategories(churchId), listLedger(churchId)])
      .then(([a, c, l]) => {
        setAccounts(a)
        setCategories(c)
        setLedger(l)
      })
      .catch((err) => console.error('Erro ao carregar o painel financeiro:', err))
      .finally(() => setLoading(false))
  }, [churchId])

  const balances = useMemo(() => accountBalances(accounts, ledger), [accounts, ledger])
  const total = Object.values(balances).reduce((sum, v) => sum + v, 0)
  const monthTxs = useMemo(() => ledger.filter((tx) => monthOf(tx.date) === month), [ledger, month])
  const totals = useMemo(() => periodTotals(monthTxs, categories), [monthTxs, categories])
  const series = useMemo(() => monthlySeries(ledger, month, 6), [ledger, month])
  const maxBar = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]))
  const contributionShare = totals.income
    ? Math.round((totals.contributions / totals.income) * 100)
    : 0
  const visibleAccounts = accounts.filter((a) => a.is_active || balances[a.id])

  const needsSetup = !loading && (accounts.length === 0 || categories.length === 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Painel financeiro"
        subtitle={
          <span>
            {monthLabel(month)}
            {currentChurch?.name ? ` · ${currentChurch.name}` : ''}
          </span>
        }
      >
        <MonthSwitcher value={month} onChange={setMonth} />
        {canEdit && !needsSetup && (
          <Button asChild className={primaryButtonClass}>
            <Link to="/financeiro/lancamentos?novo=1">
              <Plus className="h-4 w-4" />
              Novo lançamento
            </Link>
          </Button>
        )}
      </PageHeader>

      {!canEdit && <ReadOnlyNotice />}

      {needsSetup && (
        <div className="flex flex-col gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold text-teal-900">
              Primeiro passo: cadastre contas e categorias
            </p>
            <p className="text-sm text-teal-800">
              {accounts.length === 0
                ? 'Crie o caixa e as contas bancárias'
                : 'As contas já estão criadas'}
              {categories.length === 0
                ? ' e use o plano de contas sugerido para as categorias.'
                : '.'}
            </p>
          </div>
          {canEdit && (
            <Button asChild className={primaryButtonClass}>
              <Link to="/financeiro/cadastros">Abrir cadastros</Link>
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Wallet}
            tone="bg-teal-50 text-teal-700"
            label="Saldo em todas as contas"
            value={formatCents(total)}
            hint={`${visibleAccounts.length} ${visibleAccounts.length === 1 ? 'conta' : 'contas'}`}
          />
          <Stat
            icon={ArrowDownLeft}
            tone="bg-emerald-50 text-emerald-700"
            label="Entradas no mês"
            value={formatCents(totals.income)}
            hint={totals.anonymous ? `${formatCents(totals.anonymous)} anônimos` : undefined}
          />
          <Stat
            icon={ArrowUpRight}
            tone="bg-rose-50 text-rose-700"
            label="Saídas no mês"
            value={formatCents(totals.expense)}
          />
          <Stat
            icon={Scale}
            tone="bg-indigo-50 text-indigo-700"
            label="Resultado do mês"
            value={formatCents(totals.result)}
            hint={
              totals.income ? `Dízimos e ofertas: ${contributionShare}% das entradas` : undefined
            }
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className={cardClass}>
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Entradas e saídas</h3>
            <span className="text-xs text-slate-400">últimos 6 meses</span>
            <div className="ml-auto flex gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
                Entradas
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
                Saídas
              </span>
            </div>
          </div>
          <div className="px-5 pb-4 pt-5">
            <div className="grid h-52 grid-cols-6 items-end gap-3 border-b border-slate-200">
              {series.map((s) => (
                <div
                  key={s.month}
                  className="flex h-full items-end justify-center gap-1"
                  title={`${monthLabel(s.month)}: entradas ${formatCents(s.income)}, saídas ${formatCents(s.expense)}`}
                >
                  <i
                    className="w-4 rounded-t bg-emerald-600 sm:w-5"
                    style={{ height: `${(s.income / maxBar) * 100}%` }}
                  />
                  <i
                    className="w-4 rounded-t bg-rose-500 sm:w-5"
                    style={{ height: `${(s.expense / maxBar) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-6 gap-3 text-center text-xs capitalize">
              {series.map((s) => (
                <span
                  key={s.month}
                  className={s.month === month ? 'font-semibold text-slate-900' : 'text-slate-400'}
                >
                  {monthShort(s.month)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Saldo por conta</h3>
            <Link
              to="/financeiro/cadastros"
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Contas <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {visibleAccounts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              Nenhuma conta cadastrada.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleAccounts.map((a) => {
                const Icon = KIND_ICON[a.kind] || Wallet
                return (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{a.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {[a.bank_name, a.account_number].filter(Boolean).join(' · ') ||
                          (a.is_active ? '' : 'Arquivada')}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'font-semibold tabular-nums',
                        (balances[a.id] || 0) < 0 ? 'text-rose-700' : 'text-slate-900',
                      )}
                    >
                      {formatCents(balances[a.id] || 0)}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
