// Orçamento anual × realizado, por categoria e congregação.
// Na visão "Todas" o previsto soma o orçamento da igreja toda e o de cada congregação;
// numa congregação, só o dela e só as contas dela.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Loader2, Pencil, Target } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { centsToInput, formatCents, parseMoneyToCents } from '@/lib/money'
import { brtDay } from '@/lib/bankStatement'
import {
  budgetReport,
  realizedByCategory,
  withAdjustment,
  type BudgetRow,
  type BudgetStatus,
} from '@/lib/budget'
import {
  listAccounts,
  listBudgets,
  listCategories,
  listTransactionsBetween,
  saveBudget,
} from '@/services/finance'
import type { FinAccount, FinBudget, FinCategory, FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PageHeader,
  ReadOnlyNotice,
  cardClass,
  errorMessage,
  primaryButtonClass,
  useFinanceAccess,
} from './shared'

const today = () => brtDay(new Date().toISOString())
const ALL = '__all__'
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const pctText = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}%`

function StatusBadge({ row, direction }: { row: BudgetRow; direction: 'ENTRADA' | 'SAIDA' }) {
  const map: Record<BudgetStatus, [string, string]> = {
    NO_RITMO: ['No ritmo', 'bg-emerald-50 text-emerald-700'],
    ACIMA: [`${Math.round(row.pacePct)}% acima do ritmo`, 'bg-red-50 text-red-700'],
    ESTOUROU: [`Estourou ${formatCents(row.realized - row.planned)}`, 'bg-red-50 text-red-700'],
    ABAIXO:
      direction === 'SAIDA'
        ? ['Abaixo', 'border border-slate-200 text-slate-600']
        : ['Abaixo do previsto', 'bg-amber-50 text-amber-700'],
    SEM_PREVISAO: ['Sem previsão', 'bg-amber-50 text-amber-700'],
    META_BATIDA: ['Meta batida', 'bg-emerald-50 text-emerald-700'],
  }
  const [text, cls] = map[row.status]
  return (
    <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>
      {text}
    </span>
  )
}

function BudgetTable({
  title,
  rows,
  direction,
  fraction,
  planningOnly = false,
}: {
  title: string
  rows: BudgetRow[]
  direction: 'ENTRADA' | 'SAIDA'
  fraction: number
  /** Ano que ainda não começou: só o previsto. */
  planningOnly?: boolean
}) {
  const total = rows.reduce((s, r) => s + r.planned, 0)
  const bad = (r: BudgetRow) =>
    direction === 'SAIDA' && (r.status === 'ACIMA' || r.status === 'ESTOUROU')
  return (
    <section className={cn(cardClass, 'overflow-hidden')}>
      <div className="flex flex-wrap items-baseline gap-x-3 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {fraction > 0 && fraction < 1 && (
          <span className="text-xs text-slate-500">
            a marca preta mostra onde o ano deveria estar ({Math.round(fraction * 100)}%)
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-6 text-center text-sm text-slate-400">
          {planningOnly ? 'Nada previsto.' : 'Nada previsto nem realizado.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cn('w-full text-sm', !planningOnly && 'min-w-[680px]')}>
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">Categoria</th>
                <th className={cn('px-4 py-2 text-right font-semibold', planningOnly && 'w-48')}>
                  Previsto no ano
                </th>
                {planningOnly ? (
                  <th className="w-36 px-4 py-2 text-right font-semibold">Parte do total</th>
                ) : (
                  <>
                    <th className="px-4 py-2 text-right font-semibold">Realizado</th>
                    <th className="px-4 py-2 font-semibold">Consumo</th>
                    <th className="px-4 py-2" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const used = r.planned ? Math.min(1, r.realized / r.planned) : r.realized ? 1 : 0
                if (planningOnly)
                  return (
                    <tr key={r.categoryId} className="border-b border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatCents(r.planned)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {total ? `${Math.round((r.planned / total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  )
                return (
                  <tr
                    key={r.categoryId}
                    className={cn('border-b border-slate-100', bad(r) && 'bg-red-50/40')}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.planned ? formatCents(r.planned) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatCents(r.realized)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="relative h-2 w-40 rounded-full bg-slate-100">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            bad(r) || r.status === 'SEM_PREVISAO' ? 'bg-red-500' : 'bg-teal-600',
                          )}
                          style={{ width: `${used * 100}%` }}
                        />
                        {fraction > 0 && fraction < 1 && (
                          <span
                            className="absolute -top-1 h-4 w-0.5 bg-slate-900"
                            style={{ left: `${fraction * 100}%` }}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StatusBadge row={r} direction={direction} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function EditDialog({
  open,
  onOpenChange,
  year,
  congregation,
  categories,
  current,
  lastYear,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  /** '' = igreja toda */
  congregation: string
  categories: FinCategory[]
  current: Map<string, number>
  lastYear: Map<string, number>
  onSave: (lines: { category_id: string; amount_cents: number }[]) => Promise<void>
}) {
  const { toast } = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [adjust, setAdjust] = useState('5')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const start: Record<string, string> = {}
    for (const c of categories) {
      const v = current.get(c.id)
      start[c.id] = v ? centsToInput(v) : ''
    }
    setValues(start)
  }, [open, categories, current])

  const applyAdjustment = () => {
    const pct = Number(adjust.replace(',', '.'))
    if (!Number.isFinite(pct)) return
    const next: Record<string, string> = {}
    for (const c of categories) {
      const base = lastYear.get(c.id) || 0
      next[c.id] = base ? centsToInput(withAdjustment(base, pct)) : values[c.id] || ''
    }
    setValues(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines: { category_id: string; amount_cents: number }[] = []
    for (const c of categories) {
      const raw = (values[c.id] || '').trim()
      if (!raw) continue
      const cents = parseMoneyToCents(raw)
      if (cents === null || cents < 0) {
        toast({ title: `Confira o valor de ${c.name}`, variant: 'destructive' })
        return
      }
      if (cents) lines.push({ category_id: c.id, amount_cents: cents })
    }
    setSaving(true)
    try {
      await onSave(lines)
      onOpenChange(false)
    } catch {
      // o aviso já saiu em onSave
    } finally {
      setSaving(false)
    }
  }

  const group = (direction: 'ENTRADA' | 'SAIDA') =>
    categories.filter((c) => c.direction === direction)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Orçamento de {year} · {congregation || 'igreja toda'}
          </DialogTitle>
          <DialogDescription>
            Valor previsto para o ano inteiro em cada categoria.{' '}
            {congregation
              ? 'Só desta congregação.'
              : 'Da igreja toda; na visão Todas soma com o orçamento de cada congregação.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <div className="space-y-1">
            <Label htmlFor="bud-adj" className="text-xs font-semibold text-slate-600">
              Reajuste sobre o realizado de {year - 1} (%)
            </Label>
            <Input
              id="bud-adj"
              inputMode="decimal"
              value={adjust}
              onChange={(e) => setAdjust(e.target.value)}
              className="h-9 w-28 rounded-lg bg-white"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={applyAdjustment}>
            Preencher
          </Button>
          <p className="w-full text-xs text-slate-500">
            Preenche as categorias que tiveram movimento em {year - 1}; as outras ficam como estão.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          {(['ENTRADA', 'SAIDA'] as const).map((direction) => (
            <div key={direction}>
              <h3 className="mb-2 text-sm font-bold text-slate-900">
                {direction === 'ENTRADA' ? 'Entradas' : 'Saídas'}
              </h3>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {group(direction).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {year - 1}: {formatCents(lastYear.get(c.id) || 0)}
                      </p>
                    </div>
                    <Input
                      aria-label={`Previsto para ${c.name}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={values[c.id] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                      className="h-9 w-36 rounded-lg text-right tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className={cn(primaryButtonClass, 'h-9')}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar orçamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function FinanceBudget() {
  const { currentChurch } = useAuth()
  const churchId = currentChurch?.id
  const { canEdit } = useFinanceAccess()
  const { toast } = useToast()
  const day = today()
  const [year, setYear] = useState(Number(day.slice(0, 4)))
  const [congregation, setCongregation] = useState(ALL)
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [lines, setLines] = useState<FinBudget[]>([])
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyPct, setCopyPct] = useState('5')
  const [copying, setCopying] = useState(false)

  const load = useCallback(async () => {
    if (!churchId) return
    setLoading(true)
    try {
      const [acc, cat, bud, t] = await Promise.all([
        listAccounts(churchId),
        listCategories(churchId),
        listBudgets(churchId, [year - 1, year, year + 1]),
        listTransactionsBetween(churchId, `${year - 1}-01-01`, `${year}-12-31`),
      ])
      setAccounts(acc)
      setCategories(cat)
      setLines(bud)
      setTxs(t)
    } catch (err) {
      toast({
        title: 'Não foi possível carregar o orçamento',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [churchId, year, toast])

  useEffect(() => {
    load()
  }, [load])

  const congregations = useMemo(
    () => [...new Set(accounts.map((a) => a.congregation || '').filter(Boolean))].sort(),
    [accounts],
  )
  const scope = congregation === ALL ? null : congregation
  const report = useMemo(
    () => budgetReport(lines, categories, txs, accounts, { year, today: day, congregation: scope }),
    [lines, categories, txs, accounts, year, day, scope],
  )
  // O que se edita: o orçamento da igreja toda (em Todas) ou o da congregação
  const editScope = scope ?? ''
  const current = useMemo(
    () =>
      new Map(
        lines
          .filter((l) => l.year === year && (l.congregation || '') === editScope)
          .map((l) => [l.category_id, l.amount_cents]),
      ),
    [lines, year, editScope],
  )
  const lastYear = useMemo(
    () => realizedByCategory(txs, year - 1, accounts, scope),
    [txs, year, accounts, scope],
  )
  const editable = useMemo(
    () =>
      categories
        .filter((c) => c.is_active || current.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [categories, current],
  )
  const nextYearHasLines = lines.some(
    (l) => l.year === year + 1 && (l.congregation || '') === editScope,
  )

  const save = async (
    targetYear: number,
    newLines: { category_id: string; amount_cents: number }[],
  ) => {
    if (!churchId) return
    try {
      await saveBudget(churchId, targetYear, editScope, newLines)
      toast({ title: `Orçamento de ${targetYear} salvo` })
      if (targetYear === year) await load()
      else setYear(targetYear)
    } catch (err) {
      toast({
        title: 'Não foi possível salvar o orçamento',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
      throw err
    }
  }

  const copyToNext = async () => {
    const pct = Number(copyPct.replace(',', '.'))
    if (!Number.isFinite(pct)) {
      toast({ title: 'Confira o reajuste', variant: 'destructive' })
      return
    }
    setCopying(true)
    try {
      await save(
        year + 1,
        [...current.entries()].map(([category_id, cents]) => ({
          category_id,
          amount_cents: withAdjustment(cents, pct),
        })),
      )
      setCopyOpen(false)
    } catch {
      // o aviso já saiu em save()
    } finally {
      setCopying(false)
    }
  }

  if (!churchId) return null

  const thisYear = Number(day.slice(0, 4))
  const future = year > thisYear
  const until =
    year === thisYear
      ? `até ${MONTHS[Number(day.slice(5, 7)) - 1]}`
      : year < thisYear
        ? 'do ano'
        : ''
  const diffPct = (realized: number, planned: number) =>
    planned ? pctText((realized / planned - 1) * 100) : ''
  const overNames = report.over.map((r) => r.name)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Orçamento ${year}`}
        subtitle={
          year > thisYear
            ? 'Planejamento do próximo ano.'
            : `Planejado × realizado ${until}${scope ? ` · ${scope}` : ''}`
        }
      >
        <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-white shadow-xs">
          <button
            type="button"
            aria-label="Ano anterior"
            onClick={() => setYear((y) => y - 1)}
            className="grid h-full w-9 place-items-center text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-14 text-center text-sm font-semibold text-slate-800">{year}</span>
          <button
            type="button"
            aria-label="Próximo ano"
            onClick={() => setYear((y) => y + 1)}
            className="grid h-full w-9 place-items-center text-slate-500 hover:text-slate-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {congregations.length > 0 && (
          <div className="flex rounded-lg bg-slate-100 p-1">
            {[ALL, ...congregations].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={congregation === c}
                onClick={() => setCongregation(c)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-semibold',
                  congregation === c ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500',
                )}
              >
                {c === ALL ? 'Todas' : c}
              </button>
            ))}
          </div>
        )}
        {canEdit && (
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)} disabled={loading}>
              <Pencil className="mr-2 h-4 w-4" />
              {current.size ? 'Editar orçamento' : 'Montar orçamento'}
            </Button>
            {current.size > 0 && (
              <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={loading}>
                <Copy className="mr-2 h-4 w-4" />
                Criar {year + 1} a partir deste
              </Button>
            )}
          </>
        )}
      </PageHeader>
      {!canEdit && <ReadOnlyNotice />}

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !report.hasPlan ? (
        <div className={cn(cardClass, 'flex flex-col items-center gap-2 px-6 py-12 text-center')}>
          <Target className="h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-700">
            Ainda não há orçamento para {year}
            {scope ? ` em ${scope}` : ''}.
          </p>
          <p className="max-w-md text-sm text-slate-500">
            Monte o previsto do ano por categoria. Dá para partir do realizado de {year - 1} com um
            reajuste e ajustar o que mudar.
          </p>
          {canEdit && (
            <Button className={cn(primaryButtonClass, 'mt-2')} onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Montar orçamento
            </Button>
          )}
        </div>
      ) : (
        <>
          {future ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-sm text-slate-500">Entradas planejadas no ano</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {formatCents(report.income.planned)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatCents(Math.round(report.income.planned / 12))} por mês
                </p>
              </div>
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-sm text-slate-500">Saídas planejadas no ano</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {formatCents(report.expense.planned)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatCents(Math.round(report.expense.planned / 12))} por mês
                </p>
              </div>
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-sm text-slate-500">Resultado planejado</p>
                <p
                  className={cn(
                    'mt-1 text-xl font-bold tabular-nums',
                    report.resultPlanned < 0 ? 'text-red-600' : 'text-emerald-700',
                  )}
                >
                  {formatCents(report.resultPlanned)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">entradas menos saídas previstas</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-sm text-slate-500">Entradas planejadas {until}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {formatCents(report.income.plannedToDate)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Realizado {formatCents(report.income.realized)}{' '}
                  <span
                    className={
                      report.income.realized >= report.income.plannedToDate
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }
                  >
                    {diffPct(report.income.realized, report.income.plannedToDate)}
                  </span>
                </p>
              </div>
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-sm text-slate-500">Saídas planejadas {until}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {formatCents(report.expense.plannedToDate)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Realizado {formatCents(report.expense.realized)}{' '}
                  <span
                    className={
                      report.expense.realized <= report.expense.plannedToDate
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }
                  >
                    {diffPct(report.expense.realized, report.expense.plannedToDate)}
                  </span>
                </p>
              </div>
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-sm text-slate-500">Categorias acima do previsto</p>
                <p
                  className={cn(
                    'mt-1 text-xl font-bold tabular-nums',
                    overNames.length ? 'text-red-600' : 'text-slate-900',
                  )}
                >
                  {overNames.length}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {overNames.length ? overNames.join(', ') : 'Todas dentro do ritmo'}
                </p>
              </div>
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-sm text-slate-500">Resultado do ano</p>
                <p
                  className={cn(
                    'mt-1 text-xl font-bold tabular-nums',
                    report.resultRealized < 0 ? 'text-red-600' : 'text-emerald-700',
                  )}
                >
                  {formatCents(report.resultRealized)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  planejado {formatCents(report.resultPlanned)} no ano
                </p>
              </div>
            </div>
          )}
          <BudgetTable
            title="Saídas por categoria"
            rows={report.expense.rows}
            direction="SAIDA"
            fraction={report.fraction}
            planningOnly={future}
          />
          <BudgetTable
            title="Entradas por categoria"
            rows={report.income.rows}
            direction="ENTRADA"
            fraction={report.fraction}
            planningOnly={future}
          />
        </>
      )}

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        year={year}
        congregation={editScope}
        categories={editable}
        current={current}
        lastYear={lastYear}
        onSave={(newLines) => save(year, newLines)}
      />

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar o orçamento de {year + 1}</DialogTitle>
            <DialogDescription>
              Copia o previsto de {year}
              {scope ? ` de ${scope}` : ' da igreja toda'} com um reajuste. Depois dá para ajustar
              cada categoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="copy-pct" className="text-xs font-semibold text-slate-600">
              Reajuste (%)
            </Label>
            <Input
              id="copy-pct"
              inputMode="decimal"
              value={copyPct}
              onChange={(e) => setCopyPct(e.target.value)}
              className="h-10 w-28 rounded-lg"
            />
          </div>
          {nextYearHasLines && (
            <p className="text-sm text-amber-700">
              Já existe orçamento de {year + 1}
              {scope ? ` em ${scope}` : ''}; ele será substituído.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" onClick={() => setCopyOpen(false)}>
              Cancelar
            </Button>
            <Button
              className={cn(primaryButtonClass, 'h-9')}
              disabled={copying}
              onClick={copyToNext}
            >
              {copying && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar {year + 1}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
