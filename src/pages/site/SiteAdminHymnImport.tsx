// Painel Site e App › Hinário › Importar arquivo: lê a exportação do Holyrics (.mufl) ou um JSON,
// mostra a lista para conferir (números faltando, repetidos ou que já existem) e cria os hinos.

import { useMemo, useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { cn } from '@/lib/utils'
import { foldKey, parseHymnFile, type ImportedHymn } from '@/lib/hymnImport'
import { saveHymn, type SiteHymn } from '@/services/site'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from './siteAdminParts'

interface Row extends ImportedHymn {
  key: number
  checked: boolean
}

type Mode = 'skip' | 'replace'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Hinário de cada linha: o próprio (ex.: um HCC) ou o escolhido para o arquivo. */
const hymnalOf = (r: Row, main: string) => (r.hymnal || main).trim()

/** Chave para achar o mesmo hino: hinário + número (ou + título, quando não tem número). */
const keyOf = (r: Row, main: string) =>
  r.number > 0 ? `${hymnalOf(r, main)}|${r.number}` : `${hymnalOf(r, main)}|t:${foldKey(r.title)}`

export default function HymnImportDialog({
  churchId,
  open,
  existing,
  suggestions,
  onClose,
  onDone,
}: {
  churchId: string
  open: boolean
  existing: SiteHymn[]
  suggestions: string[]
  onClose: () => void
  onDone: (hymnal: string) => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [hymnal, setHymnal] = useState('')
  const [mode, setMode] = useState<Mode>('skip')
  const [filter, setFilter] = useState<'all' | 'review'>('all')
  // Linhas mostradas em "Para conferir": fixadas ao abrir o filtro, para não sumirem ao desmarcar
  const [reviewKeys, setReviewKeys] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const reset = () => {
    setFileName('')
    setRows(null)
    setHymnal('')
    setMode('skip')
    setFilter('all')
    setProgress(null)
  }

  const close = () => {
    if (progress) return
    reset()
    onClose()
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    try {
      const r = await parseHymnFile(file)
      if (!r.hymns.length) throw new Error('Nenhum hino encontrado no arquivo.')
      setFileName(file.name)
      setHymnal(r.hymnal || suggestions[0] || 'Cantor Cristão')
      setRows(r.hymns.map((h, i) => ({ ...h, key: i, checked: true })))
      setFilter('all')
    } catch (err) {
      toast({
        title: 'Não foi possível ler o arquivo',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Hinos que já estão cadastrados, por hinário + número (e por título quando não tem número)
  const existingByKey = useMemo(() => {
    const m = new Map<string, SiteHymn>()
    for (const h of existing) {
      m.set(h.number > 0 ? `${h.hymnal}|${h.number}` : `${h.hymnal}|t:${foldKey(h.title)}`, h)
    }
    return m
  }, [existing])

  const info = useMemo(() => {
    const out = new Map<number, { exists?: SiteHymn; repeated: boolean; noNumber: boolean }>()
    if (!rows) return out
    const count = new Map<string, number>()
    for (const r of rows) {
      if (!r.checked || r.number <= 0) continue
      const k = keyOf(r, hymnal)
      count.set(k, (count.get(k) || 0) + 1)
    }
    for (const r of rows) {
      out.set(r.key, {
        exists: existingByKey.get(keyOf(r, hymnal)),
        repeated: r.checked && r.number > 0 && (count.get(keyOf(r, hymnal)) || 0) > 1,
        noNumber: r.number <= 0,
      })
    }
    return out
  }, [rows, hymnal, existingByKey])

  const needsReview = (r: Row) => {
    const i = info.get(r.key)
    return !!i && (i.repeated || i.noNumber || !!i.exists)
  }

  const checked = rows?.filter((r) => r.checked) || []
  const repeated = checked.filter((r) => info.get(r.key)?.repeated).length
  const noNumber = checked.filter((r) => info.get(r.key)?.noNumber).length
  const exists = checked.filter((r) => info.get(r.key)?.exists).length
  const toCreate = checked.filter((r) => !info.get(r.key)?.exists).length
  const toUpdate = mode === 'replace' ? exists : 0
  const reviewCount = rows?.filter(needsReview).length || 0
  const shown = (rows || []).filter((r) => filter === 'all' || reviewKeys.has(r.key))

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const run = async () => {
    if (!rows || !hymnal.trim()) return
    const jobs = checked.filter((r) => !info.get(r.key)?.exists || mode === 'replace')
    if (!jobs.length) {
      toast({ title: 'Nada para importar', description: 'Todos os hinos marcados já existem.' })
      return
    }
    setProgress({ done: 0, total: jobs.length })
    let done = 0
    let failed = 0
    let firstError = ''
    let next = 0
    const worker = async () => {
      while (next < jobs.length) {
        const r = jobs[next++]
        const prev = info.get(r.key)?.exists
        const data = {
          hymnal: hymnalOf(r, hymnal).slice(0, 60),
          number: Math.max(0, Math.min(9999, Math.floor(r.number) || 0)),
          title: r.title.trim().slice(0, 160),
          lyrics: r.lyrics.slice(0, 12000),
          ...(prev ? {} : { active: true }),
        }
        // O servidor aceita no máximo 60 cadastros a cada 5 s: vai devagar e, se passar, espera
        for (let attempt = 0; ; attempt++) {
          try {
            await saveHymn(churchId, prev?.id || null, data)
            break
          } catch (err) {
            if ((err as { status?: number })?.status === 429 && attempt < 6) {
              await sleep(3000 + attempt * 1500)
              continue
            }
            failed++
            if (!firstError)
              firstError = `${r.number ? `${r.number}. ` : ''}${r.title}: ${getErrorMessage(err)}`
            break
          }
        }
        await sleep(200)
        done++
        setProgress({ done, total: jobs.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, worker))
    const ok = jobs.length - failed
    toast({
      title: `${ok} ${ok === 1 ? 'hino importado' : 'hinos importados'}`,
      description: failed ? `${failed} não entraram. ${firstError}` : undefined,
      variant: failed ? 'destructive' : undefined,
    })
    const main = hymnal.trim()
    reset()
    onDone(main)
  }

  const blocked = !!progress || !rows || !hymnal.trim() || repeated > 0 || !checked.length

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar hinos de um arquivo</DialogTitle>
          <DialogDescription>
            Exportação de músicas do Holyrics (.mufl) ou um arquivo JSON com número, título e letra.
            Nada é salvo antes de você conferir e tocar em Importar.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".mufl,.json,application/json,application/octet-stream"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        {!rows ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={reading}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-slate-600 hover:border-teal-600 hover:bg-teal-50/40"
          >
            {reading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <FileUp className="h-8 w-8" />
            )}
            <span className="font-semibold">
              {reading ? 'Lendo o arquivo...' : 'Escolher arquivo'}
            </span>
            <span className="text-sm text-slate-500">
              No Holyrics: Arquivo › Exportar › Músicas. Depois escolha o arquivo .mufl aqui.
            </span>
          </button>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Hinário">
                <Input
                  value={hymnal}
                  onChange={(e) => setHymnal(e.target.value)}
                  list="site-hymnals-import"
                  maxLength={60}
                  disabled={!!progress}
                />
                <datalist id="site-hymnals-import">
                  {suggestions.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field label="Hinos que já existem (mesmo número)">
                <div className="flex gap-1.5">
                  {(
                    [
                      ['skip', 'Manter os atuais'],
                      ['replace', 'Trocar pela do arquivo'],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      disabled={!!progress}
                      onClick={() => setMode(v)}
                      className={cn(
                        'flex-1 rounded-lg border px-2 py-2 text-sm font-medium',
                        mode === v
                          ? 'border-teal-700 bg-teal-700 text-white'
                          : 'border-slate-200 bg-white text-slate-700',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <p className="text-sm text-slate-600">
              <b>{fileName}</b>: {rows.length} hinos. {checked.length} marcados: {toCreate} novos
              {exists > 0 &&
                `, ${exists} já existem (${mode === 'replace' ? 'serão trocados' : 'ficam como estão'})`}
              {noNumber > 0 && `, ${noNumber} sem número`}.
            </p>
            {repeated > 0 && (
              <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-800">
                {repeated} hinos marcados têm o mesmo número de outro. Troque o número ou desmarque
                um deles para poder importar.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(
                [
                  ['all', `Todos (${rows.length})`],
                  ['review', `Para conferir (${reviewCount})`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    if (v === 'review')
                      setReviewKeys(new Set(rows.filter(needsReview).map((r) => r.key)))
                    setFilter(v)
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-1 font-medium',
                    filter === v
                      ? 'border-slate-800 bg-slate-800 text-white'
                      : 'border-slate-200 bg-white',
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="ml-auto text-teal-700 underline-offset-2 hover:underline"
                onClick={() => setRows(rows.map((r) => ({ ...r, checked: !checked.length })))}
                disabled={!!progress}
              >
                {checked.length ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>

            <div className="min-h-[12rem] flex-1 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {shown.map((r) => {
                const i = info.get(r.key)
                return (
                  <label key={r.key} className="flex cursor-pointer items-center gap-2.5 p-2 pl-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-teal-700"
                      checked={r.checked}
                      disabled={!!progress}
                      onChange={(e) => update(r.key, { checked: e.target.checked })}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={9999}
                      aria-label="Número"
                      value={r.number || ''}
                      placeholder="nº"
                      disabled={!!progress}
                      onChange={(e) => update(r.key, { number: Number(e.target.value) || 0 })}
                      className={cn(
                        'h-8 w-[4.5rem] shrink-0 px-2 text-center font-bold',
                        (i?.repeated || i?.noNumber) && 'border-red-400 bg-red-50',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn('block truncate font-medium', !r.checked && 'text-slate-400')}
                      >
                        {r.title}
                      </span>
                      <span className="flex flex-wrap gap-1 text-[11px] font-semibold">
                        {r.hymnal && (
                          <span className="rounded bg-violet-100 px-1.5 text-violet-800">
                            {r.hymnal}
                          </span>
                        )}
                        {!r.lyrics && (
                          <span className="rounded bg-slate-100 px-1.5 text-slate-600">
                            sem letra
                          </span>
                        )}
                        {i?.noNumber && (
                          <span className="rounded bg-red-100 px-1.5 text-red-800">sem número</span>
                        )}
                        {i?.repeated && (
                          <span className="rounded bg-red-100 px-1.5 text-red-800">
                            número repetido
                          </span>
                        )}
                        {i?.exists && (
                          <span className="rounded bg-amber-100 px-1.5 text-amber-900">
                            já existe: {i.exists.title}
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                )
              })}
              {shown.length === 0 && (
                <p className="p-4 text-center text-sm text-slate-500">Nada para conferir.</p>
              )}
            </div>

            {progress && (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-teal-600 transition-all"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-center text-xs text-slate-500">
                  Importando {progress.done} de {progress.total}... Deixe esta janela aberta (leva
                  uns 2 minutos a cada 500 hinos).
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {rows && !progress && (
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Outro arquivo
            </Button>
          )}
          <Button variant="outline" onClick={close} disabled={!!progress}>
            Cancelar
          </Button>
          {rows && (
            <Button
              onClick={run}
              disabled={blocked}
              className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
            >
              {progress && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar {toCreate + toUpdate} {toCreate + toUpdate === 1 ? 'hino' : 'hinos'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
