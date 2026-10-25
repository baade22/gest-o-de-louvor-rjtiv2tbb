// Aba Financeiro da ficha do membro: o que a pessoa contribuiu e o informe anual.
// Só aparece para quem vê o financeiro. Contribuições anônimas nunca entram.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, EyeOff, FileText, Printer } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { annualStatements, contributionIds, givingSummary } from '@/lib/memberGiving'
import {
  getFinSettings,
  listAccounts,
  listCategories,
  listPersonGiving,
  listSigners,
} from '@/services/finance'
import type {
  FinAccount,
  FinCategory,
  FinSettings,
  FinSigner,
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
import { AnnualStatementSheet } from './AnnualStatementSheet'
import { printSheet } from './print'
import {
  PAYMENT_METHOD_LABELS,
  cardClass,
  errorMessage,
  primaryButtonClass,
  shortDate,
} from './shared'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const FIRST_ROWS = 8

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cn(cardClass, 'p-4')}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export default function PersonFinanceTab({
  person,
  churchId,
  churchName,
  today,
}: {
  person: { id: string; name: string; document?: string }
  churchId: string
  churchName: string
  /** Hoje, YYYY-MM-DD. */
  today: string
}) {
  const { toast } = useToast()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [signers, setSigners] = useState<FinSigner[]>([])
  const [settings, setSettings] = useState<FinSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [year, setYear] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      listPersonGiving(churchId, person.id),
      listCategories(churchId),
      listAccounts(churchId),
      listSigners(churchId),
      getFinSettings(churchId).catch(() => null),
    ])
      .then(([t, c, a, s, st]) => {
        if (!alive) return
        setTxs(t)
        setCategories(c)
        setAccounts(a)
        setSigners(s)
        setSettings(st)
      })
      .catch((err) =>
        toast({
          title: 'Não foi possível carregar as contribuições',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        }),
      )
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [churchId, person.id, toast])

  const currentYear = Number(today.slice(0, 4))
  const summary = useMemo(
    () => givingSummary(txs, categories, person.id, currentYear),
    [txs, categories, person.id, currentYear],
  )
  // O informe mais pedido é o do ano anterior; o ano corrente fica na lista para conferência.
  const yearOptions = useMemo(
    () => [...new Set([currentYear, currentYear - 1, ...summary.years])].sort((a, b) => b - a),
    [currentYear, summary.years],
  )
  const chosenYear =
    year ?? summary.years.find((y) => y < currentYear) ?? summary.years[0] ?? currentYear - 1
  const statement = useMemo(
    () => annualStatements(txs, categories, chosenYear).get(person.id) || null,
    [txs, categories, chosenYear, person.id],
  )

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const contributions = useMemo(() => contributionIds(categories), [categories])
  const activeSigners = signers.filter((s) => s.is_active !== false)

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  const max = Math.max(...summary.byMonth, 1)
  const thisMonth = Number(today.slice(5, 7)) - 1
  const last = summary.last
  const rows = showAll ? txs : txs.slice(0, FIRST_ROWS)
  const origin = (tx: FinTransaction) => {
    if (tx.count_id) return 'Contagem do culto'
    const name = accountName.get(tx.account_id) || 'Conta'
    return tx.bank_line_id ? `${name} (conciliado)` : name
  }

  const print = () => {
    if (!sheetRef.current) return
    printSheet(sheetRef.current, `Informe ${chosenYear} - ${person.name}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Só quem cuida do financeiro vê esta aba. Contribuições anônimas nunca aparecem aqui.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label={`Contribuído em ${currentYear}`}
              value={formatCents(summary.total)}
              hint={
                summary.monthsWithGift
                  ? `${summary.monthsWithGift} ${summary.monthsWithGift === 1 ? 'mês' : 'meses'} com contribuição`
                  : 'Nenhuma contribuição no ano'
              }
            />
            <Stat
              label="Última contribuição"
              value={last ? shortDate(last.date, true) : '—'}
              hint={
                last
                  ? [
                      categoryName.get(last.category_id || ''),
                      last.payment_method && PAYMENT_METHOD_LABELS[last.payment_method],
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : undefined
              }
            />
            <Stat
              label={`Em ${currentYear - 1}`}
              value={formatCents(summary.previousTotal)}
              hint="Ano anterior"
            />
          </div>

          <section className={cn(cardClass, 'p-4')}>
            <h3 className="text-sm font-bold text-slate-900">
              Por mês <span className="ml-1 font-normal text-slate-400">{currentYear}</span>
            </h3>
            <div className="mt-4 flex h-40 items-end gap-1.5 sm:gap-2.5">
              {summary.byMonth.map((cents, i) => (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
                  <div
                    title={`${MONTHS[i]}: ${formatCents(cents)}`}
                    className={cn(
                      'w-full rounded-t',
                      cents ? 'bg-teal-600' : i <= thisMonth ? 'bg-slate-100' : 'bg-transparent',
                    )}
                    style={{ height: cents ? `${Math.max(4, (cents / max) * 100)}%` : '3px' }}
                  />
                  <span
                    className={cn(
                      'text-center text-[11px]',
                      i === thisMonth ? 'font-bold text-slate-700' : 'text-slate-400',
                    )}
                  >
                    {MONTHS[i]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={cn(cardClass, 'overflow-hidden')}>
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Lançamentos</h3>
              {txs.length > FIRST_ROWS && (
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Ver menos' : `Ver todos (${txs.length})`}
                </Button>
              )}
            </div>
            {txs.length === 0 ? (
              <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-400">
                Nenhuma entrada com o nome desta pessoa.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2 font-semibold">Data</th>
                      <th className="px-4 py-2 font-semibold">Tipo</th>
                      <th className="px-4 py-2 font-semibold">Forma</th>
                      <th className="px-4 py-2 font-semibold">Origem</th>
                      <th className="px-4 py-2 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((tx) => {
                      const voided = tx.status === 'ESTORNADO'
                      const counts = !voided && contributions.has(tx.category_id || '')
                      return (
                        <tr
                          key={tx.id}
                          className={cn('border-b border-slate-100', voided && 'text-slate-400')}
                        >
                          <td className="px-4 py-2.5 tabular-nums">{shortDate(tx.date, true)}</td>
                          <td className="px-4 py-2.5">
                            {categoryName.get(tx.category_id || '') || tx.description || 'Entrada'}
                            {voided && (
                              <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold">
                                Estornado
                              </span>
                            )}
                            {!voided && !counts && (
                              <span
                                className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                                title="Esta categoria não é de contribuição e não entra no informe."
                              >
                                Fora do informe
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] : '—'}
                          </td>
                          <td className="px-4 py-2.5">{origin(tx)}</td>
                          <td
                            className={cn(
                              'px-4 py-2.5 text-right tabular-nums font-semibold',
                              voided ? 'line-through' : 'text-emerald-700',
                            )}
                          >
                            {formatCents(tx.amount_cents)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className={cn(cardClass, 'h-fit space-y-4 p-4')}>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">Informe anual de contribuições</h3>
          </div>
          <p className="text-sm text-slate-600">
            Documento com o total doado no ano, o CNPJ da igreja e a assinatura da tesouraria, para
            o membro guardar ou declarar no imposto de renda.
          </p>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">Ano</p>
            <Select value={String(chosenYear)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger aria-label="Ano do informe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-slate-600">Total de {chosenYear}</span>
            <b className="tabular-nums text-slate-900">{formatCents(statement?.total || 0)}</b>
          </div>
          <Button
            className={cn(primaryButtonClass, 'w-full')}
            disabled={!statement}
            onClick={print}
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir ou salvar PDF
          </Button>
          {!statement && (
            <p className="text-xs text-slate-500">Nenhuma contribuição com nome em {chosenYear}.</p>
          )}
          {!person.document && (
            <p className="flex gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                A ficha está sem CPF e o informe sai sem ele.{' '}
                <Link to={`/membros/${person.id}/editar`} className="font-semibold underline">
                  Completar a ficha
                </Link>
              </span>
            </p>
          )}
          {!settings?.cnpj && (
            <p className="flex gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Falta o CNPJ da igreja.{' '}
                <Link to="/financeiro/cadastros?aba=igreja" className="font-semibold underline">
                  Preencher em Cadastros
                </Link>
              </span>
            </p>
          )}
          <p className="text-xs text-slate-500">
            Os informes de todos os contribuintes saem de uma vez em{' '}
            <Link to="/financeiro/informes" className="font-semibold text-teal-700 underline">
              Financeiro, Informes anuais
            </Link>
            .
          </p>
        </aside>
      </div>

      {statement && (
        <div className="hidden">
          <div ref={sheetRef}>
            <AnnualStatementSheet
              statement={statement}
              person={person}
              churchName={churchName}
              settings={settings}
              signers={activeSigners}
              issuedOn={today}
            />
          </div>
        </div>
      )}
    </div>
  )
}
