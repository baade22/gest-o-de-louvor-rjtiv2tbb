// Informes anuais de contribuições de todos os contribuintes com nome, para imprimir de uma vez.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileSpreadsheet, Printer, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { brtDay } from '@/lib/bankStatement'
import { annualStatements, type AnnualStatement } from '@/lib/memberGiving'
import { centsToText, toCsv } from '@/lib/financeReports'
import {
  getFinSettings,
  listCategories,
  listPeople,
  listSigners,
  listYearGiving,
} from '@/services/finance'
import type { FinCategory, FinSettings, FinSigner, FinTransaction, Person } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AnnualStatementSheet, formatCpf } from './AnnualStatementSheet'
import { download, printSheet } from './print'
import { PageHeader, cardClass, errorMessage, primaryButtonClass, useFinanceAccess } from './shared'

const today = () => brtDay(new Date().toISOString())

interface Row extends AnnualStatement {
  person: Person | { id: string; name: string; document?: string }
}

export default function FinanceStatements() {
  const { currentChurch, isMaster, isAdmin } = useAuth()
  // A ficha do membro só abre para MASTER e ADMIN
  const canOpenProfile = isMaster || isAdmin
  const churchId = currentChurch?.id
  const { canView } = useFinanceAccess()
  const { toast } = useToast()
  const printRef = useRef<HTMLDivElement>(null)

  const currentYear = Number(today().slice(0, 4))
  const [year, setYear] = useState(currentYear - 1)
  const [people, setPeople] = useState<Person[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [signers, setSigners] = useState<FinSigner[]>([])
  const [settings, setSettings] = useState<FinSettings | null>(null)
  const [txs, setTxs] = useState<FinTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingYear, setLoadingYear] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [toPrint, setToPrint] = useState<Row[] | null>(null)

  useEffect(() => {
    if (!churchId) return
    setLoading(true)
    Promise.all([
      listPeople(churchId),
      listCategories(churchId),
      listSigners(churchId),
      getFinSettings(churchId).catch(() => null),
    ])
      .then(([p, c, s, st]) => {
        setPeople(p)
        setCategories(c)
        setSigners(s)
        setSettings(st)
      })
      .catch((err) =>
        toast({
          title: 'Não foi possível carregar os cadastros',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        }),
      )
      .finally(() => setLoading(false))
  }, [churchId, toast])

  useEffect(() => {
    if (!churchId) return
    let alive = true
    setLoadingYear(true)
    setSelected(null)
    listYearGiving(churchId, year)
      .then((t) => alive && setTxs(t))
      .catch((err) =>
        toast({
          title: 'Não foi possível carregar as contribuições',
          description: errorMessage(err, 'Tente de novo.'),
          variant: 'destructive',
        }),
      )
      .finally(() => alive && setLoadingYear(false))
    return () => {
      alive = false
    }
  }, [churchId, year, toast])

  // Depois que as folhas escolhidas aparecem (escondidas), manda imprimir.
  useEffect(() => {
    if (!toPrint || !printRef.current) return
    printSheet(
      printRef.current,
      toPrint.length === 1
        ? `Informe ${year} - ${toPrint[0].person.name}`
        : `Informes de contribuições ${year}`,
    )
    setToPrint(null)
  }, [toPrint, year])

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(people.map((p) => [p.id, p]))
    return [...annualStatements(txs, categories, year).values()]
      .map((s) => ({ ...s, person: byId.get(s.personId) || { id: s.personId, name: 'Pessoa' } }))
      .sort((a, b) => a.person.name.localeCompare(b.person.name, 'pt-BR'))
  }, [txs, categories, people, year])

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    return q ? rows.filter((r) => r.person.name.toLocaleLowerCase('pt-BR').includes(q)) : rows
  }, [rows, query])

  if (!canView || !currentChurch) return null

  const chosen = selected ?? new Set(rows.map((r) => r.personId))
  const chosenRows = rows.filter((r) => chosen.has(r.personId))
  const total = rows.reduce((s, r) => s + r.total, 0)
  const withoutCpf = rows.filter((r) => !r.person.document).length
  const activeSigners = signers.filter((s) => s.is_active !== false)
  const allShownChosen = shown.length > 0 && shown.every((r) => chosen.has(r.personId))
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i)

  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }
  const toggleShown = (on: boolean) => {
    const next = new Set(chosen)
    for (const r of shown) {
      if (on) next.add(r.personId)
      else next.delete(r.personId)
    }
    setSelected(next)
  }

  const exportCsv = () => {
    const months = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]
    const csv = toCsv([
      ['Nome', 'CPF', 'Lançamentos', 'Total', ...months],
      ...chosenRows.map((r) => [
        r.person.name,
        formatCpf(r.person.document),
        r.count,
        centsToText(r.total),
        ...r.byMonth.map((c) => centsToText(c)),
      ]),
    ])
    download(`informes-contribuicoes-${year}.csv`, csv)
  }

  const busy = loading || loadingYear

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Informes anuais"
        subtitle="O total que cada pessoa doou no ano, com o CNPJ da igreja e a assinatura da tesouraria."
      />

      {!loading && (!settings?.cnpj || activeSigners.length === 0) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {!settings?.cnpj && (
              <>
                Falta o CNPJ da igreja.{' '}
                <Link to="/financeiro/cadastros?aba=igreja" className="font-semibold underline">
                  Preencher os dados da igreja
                </Link>
                .{' '}
              </>
            )}
            {activeSigners.length === 0 && (
              <>Ninguém assina os informes ainda; cadastre em Cadastros, aba “Quem assina”.</>
            )}
          </p>
        </div>
      )}

      <div className={cn(cardClass, 'flex flex-wrap items-end gap-3 p-4')}>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Ano-calendário</span>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]" aria-label="Ano-calendário">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pessoa"
            aria-label="Buscar pessoa"
            className="pl-9"
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !chosenRows.length} onClick={exportCsv}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Planilha
          </Button>
          <Button
            className={primaryButtonClass}
            disabled={busy || !chosenRows.length}
            onClick={() => setToPrint(chosenRows)}
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir {chosenRows.length === rows.length ? 'todos' : 'escolhidos'} (
            {chosenRows.length})
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Contribuintes com nome', busy ? '…' : String(rows.length)],
          [`Total doado em ${year}`, busy ? '…' : formatCents(total)],
          ['Sem CPF na ficha', busy ? '…' : String(withoutCpf)],
        ].map(([label, value]) => (
          <div key={label} className={cn(cardClass, 'p-4')}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <section className={cn(cardClass, 'overflow-hidden')}>
        {busy ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            Nenhuma contribuição com nome em {year}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-4 py-2">
                    <Checkbox
                      aria-label="Escolher todos"
                      checked={allShownChosen}
                      onCheckedChange={(on) => toggleShown(on === true)}
                    />
                  </th>
                  <th className="px-2 py-2 font-semibold">Pessoa</th>
                  <th className="px-2 py-2 font-semibold">CPF</th>
                  <th className="px-2 py-2 text-right font-semibold">Lanç.</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.personId} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      <Checkbox
                        aria-label={`Escolher ${r.person.name}`}
                        checked={chosen.has(r.personId)}
                        onCheckedChange={(on) => toggle(r.personId, on === true)}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {canOpenProfile ? (
                        <Link to={`/membros/${r.personId}`} className="hover:underline">
                          {r.person.name}
                        </Link>
                      ) : (
                        r.person.name
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {r.person.document ? (
                        formatCpf(r.person.document)
                      ) : (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                          Falta CPF
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.count}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {formatCents(r.total)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Imprimir o informe de ${r.person.name}`}
                        onClick={() => setToPrint([r])}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toPrint && (
        <div className="hidden">
          <div ref={printRef}>
            {toPrint.map((r) => (
              <AnnualStatementSheet
                key={r.personId}
                statement={r}
                person={r.person}
                churchName={currentChurch.name}
                settings={settings}
                signers={activeSigners}
                issuedOn={today()}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
