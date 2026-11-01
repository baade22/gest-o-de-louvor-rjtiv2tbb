import { useMemo, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import {
  eklesiaMark,
  importedCodes,
  matchByName,
  normalizeName,
  onlyDigits,
  parseEklesiaCsv,
  type EklesiaRow,
} from '@/lib/eklesiaImport'
import { createTransaction, listEklesiaImported, listLedger } from '@/services/finance'
import type { FinTransaction } from '@/types/finance'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FinanceLookups } from './TransactionSheet'
import { primaryButtonClass, shortDate } from './shared'

type RowState = 'NOVO' | 'IMPORTADO' | 'PARECIDO'
const NONE = '__none__'
const catKey = (r: Pick<EklesiaRow, 'type' | 'category'>) => `${r.type}|${r.category}`

interface Loaded {
  fileName: string
  rows: EklesiaRow[]
  errors: { line: number; reason: string }[]
  imported: Set<string>
  ledger: FinTransaction[]
}

/**
 * Importa o CSV da exportação contábil do Eklesia (ex.: movimentos do caixa em espécie).
 * Cada conta e categoria do Eklesia é ligada a uma do LouvorFlow; o código do movimento fica
 * nas observações, então importar o mesmo arquivo de novo não duplica.
 */
export function EklesiaImportDialog({
  open,
  onOpenChange,
  churchId,
  lookups,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  lookups: FinanceLookups
  onImported: () => void
}) {
  const [data, setData] = useState<Loaded | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState('')
  const [accountMap, setAccountMap] = useState<Record<string, string>>({})
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})
  const [centerMap, setCenterMap] = useState<Record<string, string>>({})
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{
    ok: number
    failed: { row: EklesiaRow; reason: string }[]
  } | null>(null)

  const accounts = lookups.accounts.filter((a) => a.is_active !== false)
  const categories = lookups.categories.filter((c) => c.is_active !== false)
  const centers = lookups.costCenters.filter((c) => c.is_active !== false)

  const reset = () => {
    setData(null)
    setReadError('')
    setAccountMap({})
    setCategoryMap({})
    setCenterMap({})
    setSkip(new Set())
    setProgress(null)
    setResult(null)
  }

  const readFile = async (file: File) => {
    reset()
    setReading(true)
    try {
      const text = await file.text()
      const parsed = parseEklesiaCsv(text)
      if (!parsed.rows.length) {
        setReadError('Não achei movimentos do Eklesia neste arquivo. Use a exportação em CSV.')
        return
      }
      const [already, ledger] = await Promise.all([
        listEklesiaImported(churchId),
        listLedger(churchId),
      ])
      const imported = importedCodes(already.map((t) => t.notes))
      // Ligações sugeridas pelo nome
      const cash = accounts.filter((a) => a.kind === 'CAIXA')
      const accMap: Record<string, string> = {}
      for (const name of new Set(parsed.rows.map((r) => r.account))) {
        accMap[name] =
          (matchByName(name, accounts) || (cash.length === 1 ? cash[0] : undefined))?.id || ''
      }
      const catMap: Record<string, string> = {}
      for (const r of parsed.rows) {
        const k = catKey(r)
        if (k in catMap) continue
        catMap[k] =
          matchByName(
            r.category,
            categories.filter((c) => c.direction === r.type),
          )?.id || ''
      }
      const ccMap: Record<string, string> = {}
      for (const name of new Set(parsed.rows.map((r) => r.costCenter).filter(Boolean))) {
        ccMap[name] = matchByName(name, centers)?.id || NONE
      }
      setAccountMap(accMap)
      setCategoryMap(catMap)
      setCenterMap(ccMap)
      setData({ fileName: file.name, ...parsed, imported, ledger })
    } catch (err) {
      console.error(err)
      setReadError('Não foi possível ler o arquivo.')
    } finally {
      setReading(false)
    }
  }

  // Situação de cada linha: já importada, parecida com um lançamento existente, ou nova
  const states = useMemo(() => {
    const out = new Map<string, RowState>()
    if (!data) return out
    const pool = new Map<string, number>()
    for (const tx of data.ledger) {
      if (tx.status === 'ESTORNADO' || tx.type === 'TRANSFERENCIA') continue
      const k = `${tx.account_id}|${tx.type}|${tx.date.slice(0, 10)}|${tx.amount_cents}`
      pool.set(k, (pool.get(k) || 0) + 1)
    }
    for (const r of data.rows) {
      if (data.imported.has(r.code)) {
        out.set(r.code, 'IMPORTADO')
        continue
      }
      const k = `${accountMap[r.account] || ''}|${r.type}|${r.date}|${r.amount_cents}`
      const n = pool.get(k) || 0
      if (n > 0) {
        pool.set(k, n - 1)
        out.set(r.code, 'PARECIDO')
      } else out.set(r.code, 'NOVO')
    }
    return out
  }, [data, accountMap])

  const selected = (r: EklesiaRow) => {
    const st = states.get(r.code)
    if (st === 'IMPORTADO') return false
    // Parecido começa desmarcado; o clique inverte o padrão
    return st === 'PARECIDO' ? skip.has(r.code) : !skip.has(r.code)
  }
  const toggle = (code: string) =>
    setSkip((s) => {
      const n = new Set(s)
      if (n.has(code)) n.delete(code)
      else n.add(code)
      return n
    })

  const chosen = data ? data.rows.filter(selected) : []
  const missing =
    chosen.some((r) => !accountMap[r.account]) || chosen.some((r) => !categoryMap[catKey(r)])
  const totalIn = chosen.filter((r) => r.type === 'ENTRADA').reduce((s, r) => s + r.amount_cents, 0)
  const totalOut = chosen.filter((r) => r.type === 'SAIDA').reduce((s, r) => s + r.amount_cents, 0)

  const findPerson = (r: EklesiaRow) => {
    if (!r.personName) return undefined
    const doc = r.personDocument
    return (
      (doc && lookups.people.find((p) => onlyDigits(p.document || '') === doc)) ||
      lookups.people.find((p) => normalizeName(p.name) === normalizeName(r.personName))
    )
  }
  const findSupplier = (r: EklesiaRow) => {
    if (!r.personName) return undefined
    const doc = r.personDocument
    return (
      (doc && lookups.suppliers.find((s) => onlyDigits(s.document || '') === doc)) ||
      lookups.suppliers.find((s) => normalizeName(s.name) === normalizeName(r.personName))
    )
  }

  const runImport = async () => {
    if (!data || missing || !chosen.length) return
    const failed: { row: EklesiaRow; reason: string }[] = []
    let ok = 0
    setProgress({ done: 0, total: chosen.length })
    for (const r of chosen) {
      const account = accounts.find((a) => a.id === accountMap[r.account])
      const category = categories.find((c) => c.id === categoryMap[catKey(r)])
      const isContribution = !!category?.is_contribution && r.type === 'ENTRADA'
      const supplier = r.type === 'SAIDA' ? findSupplier(r) : undefined
      const person = !supplier ? findPerson(r) : undefined
      const linked = !!(supplier || person)
      const base = r.description || category?.name || r.category
      const description = r.personName && !linked ? `${base} · ${r.personName}` : base
      const center = centerMap[r.costCenter]
      try {
        await createTransaction(churchId, {
          type: r.type,
          date: r.date,
          amount_cents: r.amount_cents,
          description,
          account_id: accountMap[r.account],
          category_id: categoryMap[catKey(r)],
          cost_center_id: center && center !== NONE ? center : undefined,
          payment_method: account?.kind === 'CAIXA' ? 'DINHEIRO' : undefined,
          person_id: person?.id,
          is_anonymous: isContribution && !person,
          supplier_id: supplier?.id,
          notes: eklesiaMark(r.code),
        })
        ok++
      } catch (err) {
        const msg =
          (err as { response?: { message?: string } })?.response?.message ||
          'Não foi possível lançar.'
        failed.push({ row: r, reason: msg })
      }
      setProgress({ done: ok + failed.length, total: chosen.length })
    }
    setProgress(null)
    setResult({ ok, failed })
    if (ok) onImported()
  }

  const close = (o: boolean) => {
    if (progress) return
    if (!o) reset()
    onOpenChange(o)
  }

  const eklesiaAccounts = data ? [...new Set(data.rows.map((r) => r.account))] : []
  const eklesiaCategories = data ? [...new Map(data.rows.map((r) => [catKey(r), r])).values()] : []
  const eklesiaCenters = Object.keys(centerMap)

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar do Eklesia</DialogTitle>
          <DialogDescription>
            No Eklesia, exporte os movimentos em CSV (exportação contábil) e escolha o arquivo aqui.
            Importar o mesmo arquivo de novo não duplica.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-emerald-700">
              {result.ok} {result.ok === 1 ? 'lançamento importado' : 'lançamentos importados'}.
            </p>
            {result.failed.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                <p className="font-semibold text-rose-800">
                  {result.failed.length} não {result.failed.length === 1 ? 'entrou' : 'entraram'}:
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-rose-800">
                  {result.failed.slice(0, 50).map(({ row, reason }) => (
                    <li key={row.code}>
                      {shortDate(row.date, true)} · {formatCents(row.amount_cents)}: {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Importar outro arquivo
              </Button>
              <Button className={primaryButtonClass} onClick={() => close(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : !data ? (
          <div className="space-y-3">
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-10 text-center hover:border-teal-400',
                reading && 'pointer-events-none opacity-60',
              )}
            >
              {reading ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              ) : (
                <FileUp className="h-6 w-6 text-slate-400" />
              )}
              <span className="text-sm font-semibold text-slate-700">Escolher arquivo CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Arquivo do Eklesia"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) readFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            {readError && <p className="text-sm font-medium text-rose-700">{readError}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              {data.fileName}: {data.rows.length} movimentos
              {data.errors.length > 0 && `, ${data.errors.length} linha(s) ignorada(s) por formato`}
              .
            </p>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Contas</h3>
              {eklesiaAccounts.map((name) => (
                <MapRow
                  key={name}
                  label={name}
                  value={accountMap[name] || ''}
                  onChange={(v) => setAccountMap((m) => ({ ...m, [name]: v }))}
                  options={accounts.map((a) => ({ id: a.id, name: a.name }))}
                  placeholder="Escolha a conta"
                />
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Categorias</h3>
              {eklesiaCategories.map((r) => (
                <MapRow
                  key={catKey(r)}
                  label={`${r.category} (${r.type === 'ENTRADA' ? 'entrada' : 'saída'})`}
                  value={categoryMap[catKey(r)] || ''}
                  onChange={(v) => setCategoryMap((m) => ({ ...m, [catKey(r)]: v }))}
                  options={categories
                    .filter((c) => c.direction === r.type)
                    .map((c) => ({ id: c.id, name: c.name }))}
                  placeholder="Escolha a categoria"
                />
              ))}
            </section>

            {eklesiaCenters.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Centros de custo</h3>
                {eklesiaCenters.map((name) => (
                  <MapRow
                    key={name}
                    label={name}
                    value={centerMap[name] || NONE}
                    onChange={(v) => setCenterMap((m) => ({ ...m, [name]: v }))}
                    options={[
                      { id: NONE, name: 'Sem centro de custo' },
                      ...centers.map((c) => ({ id: c.id, name: c.name })),
                    ]}
                    placeholder="Centro de custo"
                  />
                ))}
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Movimentos</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {data.rows.map((r) => {
                  const st = states.get(r.code)
                  const on = selected(r)
                  return (
                    <li
                      key={r.code}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-xs',
                        !on && 'bg-slate-50 text-slate-400',
                      )}
                    >
                      <Checkbox
                        checked={on}
                        disabled={st === 'IMPORTADO'}
                        onCheckedChange={() => toggle(r.code)}
                        aria-label={`Importar movimento ${r.code}`}
                      />
                      <span className="w-[70px] shrink-0 tabular-nums">
                        {shortDate(r.date, true)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">
                          {r.description || r.category}
                        </span>
                        <span className="block truncate text-slate-500">
                          {r.description ? r.category : r.type === 'ENTRADA' ? 'Entrada' : 'Saída'}
                          {st === 'IMPORTADO' && (
                            <span className="text-emerald-700"> · já importado</span>
                          )}
                          {st === 'PARECIDO' && (
                            <span className="text-amber-700">
                              {' '}
                              · já há lançamento igual nesta data
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 font-semibold tabular-nums',
                          on && (r.type === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'),
                        )}
                      >
                        {r.type === 'SAIDA' ? '− ' : ''}
                        {formatCents(r.amount_cents)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>

            <DialogFooter className="items-center gap-2 sm:justify-between">
              <span className="text-xs text-slate-600">
                {chosen.length} a importar · entradas {formatCents(totalIn)} · saídas{' '}
                {formatCents(totalOut)}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={!!progress}>
                  Outro arquivo
                </Button>
                <Button
                  className={primaryButtonClass}
                  onClick={runImport}
                  disabled={!!progress || missing || !chosen.length}
                >
                  {progress ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {progress.done} de {progress.total}
                    </>
                  ) : (
                    `Importar ${chosen.length}`
                  )}
                </Button>
              </div>
            </DialogFooter>
            {missing && (
              <p className="text-right text-xs font-medium text-amber-700">
                Escolha a conta e a categoria de todos os movimentos marcados.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MapRow({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { id: string; name: string }[]
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs font-medium text-slate-600 sm:w-1/2">{label}</span>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          className={cn('h-9 rounded-lg sm:w-1/2', !value && 'border-amber-300')}
          aria-label={label}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
