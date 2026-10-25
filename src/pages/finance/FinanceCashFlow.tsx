import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Download, TrendingDown } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { brtDay } from '@/lib/bankStatement'
import { addDays, cashFlow, type CashFlow, type FlowItem, type FlowPoint } from '@/lib/cashFlow'
import { centsToText, toCsv } from '@/lib/financeReports'
import { listAccounts, listBills, listCategories, listReportTransactions } from '@/services/finance'
import type { FinAccount, FinBill, FinCategory, FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { PageHeader, cardClass, errorMessage, shortDate, useFinanceAccess } from './shared'

const HORIZONS = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 365, label: 'Ano' },
]

const SOURCE_LABELS: Record<FlowItem['source'], string> = {
  LANCAMENTO: 'Lançado',
  AGENDADO: 'Lançamento futuro',
  CONTA: 'Conta em aberto',
  VENCIDA: 'Conta vencida',
  MEDIA: 'Média',
}

function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium',
            o.value === value
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint?: string
  tone?: 'in' | 'out'
}) {
  return (
    <div className={cn(cardClass, 'p-4')}>
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums tracking-tight',
          tone === 'in' ? 'text-emerald-700' : tone === 'out' ? 'text-red-600' : 'text-slate-900',
        )}
      >
        {formatCents(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

/** Gráfico de linha simples: realizado (cheio), projetado (tracejado) e saldo mínimo. */
function BalanceChart({ points, min, today }: { points: FlowPoint[]; min: number; today: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 240
  const pad = { l: 8, r: 8, t: 16, b: 28 }
  const values = points.map((p) => (p.realized ?? p.projected) as number)
  let lo = Math.min(...values, min || Infinity)
  let hi = Math.max(...values, min || -Infinity)
  if (lo === hi) {
    lo -= 100
    hi += 100
  }
  const span = hi - lo
  lo -= span * 0.08
  hi += span * 0.08
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (width - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const path = (key: 'realized' | 'projected') =>
    points
      .map((p, i) => [p[key], i] as const)
      .filter(([v]) => v !== null)
      .map(([v, i], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v as number).toFixed(1)}`)
      .join('')
  const todayIdx = points.findIndex((p) => p.date === today)
  const ticks = [0, Math.round((points.length - 1) / 4), Math.round((points.length - 1) / 2)]
    .concat([Math.round(((points.length - 1) * 3) / 4), points.length - 1])
    .filter((v, i, a) => a.indexOf(v) === i)
  const zero = lo < 0 && hi > 0
  const h = hover !== null ? points[hover] : null

  return (
    <div ref={box} className="relative">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label="Saldo dia a dia, realizado e projetado"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.round(
            ((e.clientX - r.left - pad.l) / (width - pad.l - pad.r)) * (points.length - 1),
          )
          setHover(Math.max(0, Math.min(points.length - 1, i)))
        }}
      >
        {todayIdx >= 0 && (
          <rect
            x={x(todayIdx)}
            y={pad.t}
            width={width - pad.r - x(todayIdx)}
            height={H - pad.t - pad.b}
            className="fill-slate-50"
          />
        )}
        {zero && (
          <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} className="stroke-slate-200" />
        )}
        {min > 0 && (
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={y(min)}
            y2={y(min)}
            strokeDasharray="6 5"
            className="stroke-red-500"
            strokeWidth={1.5}
          />
        )}
        {todayIdx >= 0 && (
          <>
            <line
              x1={x(todayIdx)}
              x2={x(todayIdx)}
              y1={pad.t}
              y2={H - pad.b}
              strokeDasharray="3 4"
              className="stroke-slate-400"
            />
            <text x={x(todayIdx) + 6} y={pad.t + 12} className="fill-slate-500 text-[11px]">
              hoje
            </text>
          </>
        )}
        <path
          d={path('projected')}
          fill="none"
          strokeWidth={2.5}
          strokeDasharray="7 6"
          className="stroke-teal-300"
        />
        <path d={path('realized')} fill="none" strokeWidth={2.5} className="stroke-teal-700" />
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            className="fill-slate-400 text-[11px]"
          >
            {shortDate(points[i].date)}
          </text>
        ))}
        {h && hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.t}
              y2={H - pad.b}
              className="stroke-slate-300"
            />
            <circle
              cx={x(hover)}
              cy={y((h.realized ?? h.projected) as number)}
              r={4}
              className={h.date <= today ? 'fill-teal-700' : 'fill-teal-400'}
            />
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(0, x(hover) - 70), width - 150) }}
        >
          <p className="font-semibold text-slate-900">
            {shortDate(h.date, true)} · {h.date <= today ? 'realizado' : 'previsto'}
          </p>
          <p className="tabular-nums text-slate-700">
            {formatCents((h.realized ?? h.projected) as number)}
          </p>
        </div>
      )}
    </div>
  )
}

function weekCsv(flow: CashFlow) {
  const rows: (string | number)[][] = [
    ['Semana', 'Situação', 'Data', 'Descrição', 'Origem', 'Grupo', 'Valor', 'Saldo ao fim'],
  ]
  for (const w of flow.weeks) {
    const week = `${shortDate(w.start, true)} a ${shortDate(w.end, true)}`
    const kind =
      w.kind === 'REALIZADO' ? 'Realizado' : w.kind === 'ATUAL' ? 'Esta semana' : 'Projetado'
    for (const i of w.items)
      rows.push([
        week,
        kind,
        shortDate(i.date, true),
        i.label,
        SOURCE_LABELS[i.source],
        i.group,
        centsToText(i.cents),
        '',
      ])
    rows.push([
      week,
      kind,
      '',
      'Total da semana',
      '',
      '',
      centsToText(w.income - w.expense),
      centsToText(w.closing),
    ])
  }
  return toCsv(rows)
}

export default function FinanceCashFlow() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id
  const { canView, canEdit } = useFinanceAccess()
  const { toast } = useToast()
  const today = brtDay(new Date().toISOString())

  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [bills, setBills] = useState<FinBill[]>([])
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [congregation, setCongregation] = useState<string>('')
  const [days, setDays] = useState(90)
  const [useAverage, setUseAverage] = useState(true)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!churchId) return
    setLoading(true)
    Promise.all([
      listAccounts(churchId),
      listCategories(churchId),
      listBills(churchId),
      listReportTransactions(churchId, addDays(today, 366)),
    ])
      .then(([acc, cat, bl, tx]) => {
        setAccounts(acc)
        setCategories(cat)
        setBills(bl)
        setTxs(tx)
      })
      .catch((err) =>
        toast({
          title: 'Não foi possível carregar o fluxo de caixa',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        }),
      )
      .finally(() => setLoading(false))
  }, [churchId, today, toast])

  const congregations = useMemo(
    () => [...new Set(accounts.map((a) => a.congregation || '').filter(Boolean))].sort(),
    [accounts],
  )
  const flow = useMemo(
    () =>
      cashFlow(accounts, txs, bills, categories, {
        today,
        days,
        pastDays: days <= 30 ? 30 : 60,
        congregation: congregation || null,
        useAverage,
      }),
    [accounts, txs, bills, categories, today, days, congregation, useAverage],
  )
  const hasInvestments = accounts.some((a) => a.kind === 'APLICACAO' && a.is_active !== false)
  const alert = flow.alerts[0]
  const endDate = addDays(today, days)

  if (!canView) return null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fluxo de caixa"
        subtitle="O que entrou e saiu, e o que deve acontecer nas próximas semanas."
      >
        {congregations.length > 0 && (
          <Segmented
            label="Congregação"
            value={congregation}
            onChange={setCongregation}
            options={[
              { value: '', label: 'Todas' },
              ...congregations.map((c) => ({ value: c, label: c })),
            ]}
          />
        )}
        <Segmented
          label="Período da previsão"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={HORIZONS.map((h) => ({ value: String(h.days), label: h.label }))}
        />
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([weekCsv(flow)], { type: 'text/csv;charset=utf-8' }),
            )
            const a = document.createElement('a')
            a.href = url
            a.download = `fluxo-de-caixa-${today}.csv`
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </PageHeader>

      {loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <>
          {alert && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center">
              <TrendingDown className="hidden h-5 w-5 shrink-0 text-amber-700 sm:block" />
              <p className="flex-1 text-sm text-amber-900">
                <strong>Atenção para {shortDate(alert.date)}.</strong> Pela previsão, o saldo{' '}
                {flow.alerts.length > 1 || congregations.length > 0 ? `de ${alert.group} ` : ''}fica
                em {formatCents(alert.balance)}, abaixo do mínimo de {formatCents(alert.min)}.
                {flow.alerts.length > 1 &&
                  ` Também fica abaixo: ${flow.alerts
                    .slice(1)
                    .map((a) => `${a.group} em ${shortDate(a.date)}`)
                    .join(', ')}.`}
              </p>
              <Button asChild variant="outline" size="sm" className="bg-white">
                <Link to="/financeiro/contas">Ver contas</Link>
              </Button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Saldo hoje"
              value={flow.balanceToday}
              hint={hasInvestments ? 'Aplicações não somadas' : undefined}
            />
            <Stat
              label={`Entradas previstas (${days === 365 ? 'ano' : `${days} dias`})`}
              value={flow.projectedIn}
              tone="in"
              hint={[
                flow.billsIn ? `${formatCents(flow.billsIn)} a receber` : '',
                flow.averageWeekly
                  ? `média de ${formatCents(flow.averageWeekly)} por semana em dízimos e ofertas`
                  : '',
              ]
                .filter(Boolean)
                .join(' + ')}
            />
            <Stat
              label={`Saídas previstas (${days === 365 ? 'ano' : `${days} dias`})`}
              value={flow.projectedOut}
              tone="out"
              hint={
                flow.billsOutCount === 1
                  ? '1 conta a pagar lançada'
                  : `${flow.billsOutCount} contas a pagar lançadas`
              }
            />
            <Stat
              label={`Saldo previsto em ${shortDate(endDate)}`}
              value={flow.endBalance}
              hint={`Menor saldo: ${formatCents(flow.worst.balance)} em ${shortDate(flow.worst.date)}`}
            />
          </div>

          <section className={cardClass}>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-semibold text-slate-900">Saldo dia a dia</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-teal-700" /> Realizado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-teal-300" /> Projetado
                </span>
                {flow.min > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-red-500" /> Saldo mínimo
                  </span>
                )}
                <label className="flex items-center gap-2">
                  <Switch checked={useAverage} onCheckedChange={setUseAverage} />
                  Somar a média de dízimos e ofertas
                </label>
              </div>
            </div>
            <div className="overflow-hidden px-2 py-3">
              <BalanceChart points={flow.points} min={flow.min} today={today} />
            </div>
            {flow.min === 0 && canEdit && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                Para receber aviso antes de faltar dinheiro, defina o saldo mínimo das contas em{' '}
                <Link
                  to="/financeiro/cadastros"
                  className="font-medium text-teal-700 hover:underline"
                >
                  Cadastros
                </Link>
                .
              </p>
            )}
          </section>

          <section className={cardClass}>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">
                Semana a semana{' '}
                <span className="text-sm font-normal text-slate-500">
                  toque numa semana para ver os lançamentos
                </span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Semana</th>
                    <th className="px-4 py-2.5 font-medium">Origem</th>
                    <th className="px-4 py-2.5 text-right font-medium">Entradas</th>
                    <th className="px-4 py-2.5 text-right font-medium">Saídas</th>
                    <th className="px-4 py-2.5 text-right font-medium">Saldo ao fim</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.weeks.map((w) => {
                    const expanded = open === w.start
                    const Icon = expanded ? ChevronDown : ChevronRight
                    return (
                      <WeekRows
                        key={w.start}
                        week={w}
                        expanded={expanded}
                        icon={<Icon className="h-4 w-4 text-slate-400" />}
                        onToggle={() => setOpen(expanded ? null : w.start)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function WeekRows({
  week: w,
  expanded,
  icon,
  onToggle,
}: {
  week: CashFlow['weeks'][number]
  expanded: boolean
  icon: React.ReactNode
  onToggle: () => void
}) {
  const below = w.below.length > 0
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer border-b border-slate-100',
          below ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50',
        )}
      >
        <td className="px-4 py-3">
          <button
            type="button"
            aria-expanded={expanded}
            className="flex items-center gap-1.5 whitespace-nowrap font-medium text-slate-800"
          >
            {icon}
            {shortDate(w.start)} a {shortDate(w.end)}
          </button>
        </td>
        <td className="px-4 py-3">
          {below ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Abaixo do mínimo{w.below.length === 1 ? ` (${w.below[0]})` : ''}
            </span>
          ) : (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                w.kind === 'REALIZADO'
                  ? 'bg-emerald-50 text-emerald-700'
                  : w.kind === 'ATUAL'
                    ? 'bg-sky-50 text-sky-700'
                    : 'border border-slate-200 text-slate-600',
              )}
            >
              {w.kind === 'REALIZADO'
                ? 'Realizado'
                : w.kind === 'ATUAL'
                  ? 'Esta semana'
                  : 'Projetado'}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
          {formatCents(w.income)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatCents(w.expense)}</td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
          {formatCents(w.closing)}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={5} className="px-4 py-2">
            {w.items.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">Nada nesta semana.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {w.items.map((i, k) => (
                  <li key={k} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-slate-500">
                      {shortDate(i.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-800">{i.label}</span>
                    <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">
                      {SOURCE_LABELS[i.source]}
                      {i.group ? ` · ${i.group}` : ''}
                    </span>
                    <span
                      className={cn(
                        'w-28 shrink-0 text-right tabular-nums',
                        i.cents < 0 ? 'text-red-600' : 'text-emerald-700',
                      )}
                    >
                      {formatCents(i.cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
