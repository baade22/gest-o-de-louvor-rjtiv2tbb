import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  ChevronRight,
  Landmark,
  LockKeyholeOpen,
  MessageSquareWarning,
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
import {
  accountBalances,
  billTotals,
  contributorStats,
  daysBetween,
  monthOf,
  monthlySeries,
  onlyAccounts,
  periodTotals,
  shiftMonth,
} from '@/lib/financeSummary'
import {
  listAccounts,
  listCategories,
  listClosings,
  listLedger,
  listOpenBills,
  listOpenObjections,
  listPendingLines,
  lockedUntil,
} from '@/services/finance'
import type {
  FinAccount,
  FinAccountKind,
  FinBill,
  FinCategory,
  FinTransaction,
} from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MonthSwitcher,
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  monthLabel,
  monthShort,
  primaryButtonClass,
  shortDate,
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
  const [openBills, setOpenBills] = useState<FinBill[]>([])
  // Movimentos do extrato a conciliar, por conta
  const [pendingByAccount, setPendingByAccount] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  // '' = todas as congregações
  const [congregation, setCongregation] = useState('')
  // Último mês fechado ('' = nenhum; null = não carregou)
  const [locked, setLocked] = useState<string | null>(null)
  // Ressalvas do conselho fiscal esperando resposta da tesouraria (meses)
  const [objections, setObjections] = useState<string[]>([])

  useEffect(() => {
    if (!churchId) return
    setLoading(true)
    Promise.all([
      listAccounts(churchId),
      listCategories(churchId),
      listLedger(churchId),
      // Contas a pagar e receber não podem derrubar o painel
      listOpenBills(churchId).catch(() => [] as FinBill[]),
      listPendingLines(churchId).catch(() => []),
      listClosings(churchId).catch(() => null),
      listOpenObjections(churchId).catch(() => []),
    ])
      .then(([a, c, l, b, p, closings, open]) => {
        setLocked(closings ? lockedUntil(closings) : null)
        setObjections(open.map((o) => o.month).sort())
        setAccounts(a)
        setCategories(c)
        setLedger(l)
        setOpenBills(b)
        const byAccount: Record<string, number> = {}
        for (const line of p) byAccount[line.account_id] = (byAccount[line.account_id] || 0) + 1
        setPendingByAccount(byAccount)
      })
      .catch((err) => console.error('Erro ao carregar o painel financeiro:', err))
      .finally(() => setLoading(false))
  }, [churchId])

  const congregations = useMemo(
    () => [...new Set(accounts.map((a) => (a.congregation || '').trim()).filter(Boolean))].sort(),
    [accounts],
  )
  const scopedAccounts = useMemo(
    () =>
      congregation
        ? accounts.filter((a) => (a.congregation || '').trim() === congregation)
        : accounts,
    [accounts, congregation],
  )
  const scopedLedger = useMemo(
    () => onlyAccounts(ledger, congregation ? new Set(scopedAccounts.map((a) => a.id)) : null),
    [ledger, scopedAccounts, congregation],
  )
  const balances = useMemo(() => accountBalances(scopedAccounts, ledger), [scopedAccounts, ledger])
  const total = Object.values(balances).reduce((sum, v) => sum + v, 0)
  const monthTxs = useMemo(
    () => scopedLedger.filter((tx) => monthOf(tx.date) === month),
    [scopedLedger, month],
  )
  const totals = useMemo(() => periodTotals(monthTxs, categories), [monthTxs, categories])
  const contributors = useMemo(() => contributorStats(monthTxs, categories), [monthTxs, categories])
  const series = useMemo(() => monthlySeries(scopedLedger, month, 6), [scopedLedger, month])
  const maxBar = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]))
  const contributionShare = totals.income
    ? Math.round((totals.contributions / totals.income) * 100)
    : 0
  const visibleAccounts = scopedAccounts.filter((a) => a.is_active || balances[a.id])

  const today = getLocalTodayYMD()
  const payTotals = useMemo(
    () =>
      billTotals(
        openBills.filter((b) => b.kind === 'PAGAR'),
        today,
      ),
    [openBills, today],
  )
  const receiveTotals = useMemo(
    () =>
      billTotals(
        openBills.filter((b) => b.kind === 'RECEBER'),
        today,
      ),
    [openBills, today],
  )
  // Vencidas e as dos próximos 7 dias, das mais antigas para as mais novas
  const upcoming = openBills.filter((b) => daysBetween(today, b.due_date) <= 7).slice(0, 6)

  const needsSetup = !loading && (accounts.length === 0 || categories.length === 0)
  // Mês passado (ou anterior) com lançamentos e ainda sem fechamento
  const lastMonth = shiftMonth(today.slice(0, 7), -1)
  const unclosed =
    canEdit && locked !== null && locked < lastMonth
      ? ledger
          .map((tx) => monthOf(tx.date))
          .filter((m) => m > locked && m <= lastMonth)
          .sort()[0]
      : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title="Painel financeiro"
        subtitle={
          <span>
            {monthLabel(month)}
            {congregation
              ? ` · ${congregation}`
              : currentChurch?.name
                ? ` · ${currentChurch.name}`
                : ''}
          </span>
        }
      >
        {congregations.length > 0 && (
          <Select
            value={congregation || '__all__'}
            onValueChange={(v) => setCongregation(v === '__all__' ? '' : v)}
          >
            <SelectTrigger
              className="h-10 w-full rounded-lg bg-white sm:w-52"
              aria-label="Congregação"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as congregações</SelectItem>
              {congregations.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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

      {unclosed && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center">
          <LockKeyholeOpen className="h-4 w-4 shrink-0 text-amber-700" />
          <p className="flex-1">
            <b>{monthLabel(unclosed)} ainda não foi fechado.</b> Confira os saldos com o banco e
            feche o mês para ninguém alterar o que já teve prestação de contas.
          </p>
          <Button asChild variant="outline" size="sm" className="bg-white">
            <Link to="/financeiro/fechamento">Fechar o mês</Link>
          </Button>
        </div>
      )}

      {canEdit && objections.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 sm:flex-row sm:items-center">
          <MessageSquareWarning className="h-4 w-4 shrink-0 text-orange-700" />
          <p className="flex-1">
            <b>
              {objections.length === 1
                ? '1 ressalva do conselho fiscal'
                : `${objections.length} ressalvas do conselho fiscal`}
            </b>{' '}
            {objections.length === 1 ? 'espera' : 'esperam'} resposta da tesouraria.
          </p>
          <Button asChild variant="outline" size="sm" className="bg-white">
            <Link to={`/financeiro/auditoria?mes=${objections[0]}`}>Responder</Link>
          </Button>
        </div>
      )}

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
            hint={
              contributors.named || contributors.anonymous
                ? `${contributors.named} ${contributors.named === 1 ? 'contribuinte' : 'contribuintes'} com nome · ${contributors.anonymous} ${contributors.anonymous === 1 ? 'anônima' : 'anônimas'}`
                : undefined
            }
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

      {!loading && openBills.length > 0 && (
        <div className={cn(cardClass, 'min-w-0')}>
          <div className="flex items-center border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Contas a pagar e receber</h3>
            <Link
              to="/financeiro/contas"
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Ver todas <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200 text-sm">
            {[
              { label: 'A pagar', t: payTotals, to: '/financeiro/contas' },
              { label: 'A receber', t: receiveTotals, to: '/financeiro/contas?tipo=receber' },
            ].map(({ label, t, to }) => (
              <Link key={label} to={to} className="min-w-0 px-5 py-3 hover:bg-slate-50">
                <div className="text-xs text-slate-500">{label}, próximos 7 dias</div>
                <div className="font-bold tabular-nums text-slate-900">
                  {formatCents(t.next7.cents)}
                </div>
                {t.overdue.count > 0 && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-rose-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {t.overdue.count} {t.overdue.count === 1 ? 'vencida' : 'vencidas'} ·{' '}
                      {formatCents(t.overdue.cents)}
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
          {upcoming.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              Nada vence nos próximos 7 dias.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((b) => {
                const days = daysBetween(today, b.due_date)
                return (
                  <li key={b.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <CalendarClock
                      className={cn(
                        'h-4 w-4 shrink-0',
                        days < 0 ? 'text-rose-600' : 'text-amber-600',
                      )}
                    />
                    <span className="w-12 shrink-0 tabular-nums text-slate-500">
                      {shortDate(b.due_date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {b.description}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-semibold tabular-nums',
                        b.kind === 'PAGAR' ? 'text-rose-700' : 'text-emerald-700',
                      )}
                    >
                      {b.kind === 'PAGAR' ? '− ' : ''}
                      {formatCents(b.amount_cents)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className={cn(cardClass, 'min-w-0')}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 px-5 py-4">
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

        <div className={cn(cardClass, 'min-w-0')}>
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
                        {pendingByAccount[a.id] ? (
                          <Link
                            to="/financeiro/conciliacao"
                            className="font-semibold text-amber-700"
                          >
                            {pendingByAccount[a.id]} a conciliar
                          </Link>
                        ) : (
                          [a.bank_name, a.account_number].filter(Boolean).join(' · ') ||
                          (a.is_active ? '' : 'Arquivada')
                        )}
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
