import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople, listStatusChanges } from '@/services/people'
import type { Person, PersonEvent, PersonStatus } from '@/types'
import { REPORTS, buildReport, reportTitle, toCSV, type ReportId } from '@/lib/reports'
import {
  CONGREGATIONS,
  MONTH_NAMES,
  PERSON_STATUS_LABELS,
  PERSON_STATUS_ORDER,
} from '@/lib/membership'
import { getLocalTodayYMD, parseCalendarDate } from '@/lib/dateUtils'
import { Download, FileBarChart, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage } from './shared'

// Relatórios que usam o filtro de situação
const USES_STATUS: ReportId[] = ['membros', 'contatos', 'aniversariantes', 'incompletas']

export default function Reports() {
  const { currentChurch } = useAuth()
  const today = getLocalTodayYMD()
  const now = parseCalendarDate(today)!
  const [people, setPeople] = useState<Person[]>([])
  const [events, setEvents] = useState<PersonEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [report, setReport] = useState<ReportId>('membros')
  const [congregation, setCongregation] = useState('TODAS')
  const [statuses, setStatuses] = useState<PersonStatus[]>(['MEMBRO', 'CONGREGADO'])
  const [month, setMonth] = useState(now.month)
  const [year, setYear] = useState(now.year)

  useEffect(() => {
    if (!currentChurch) return
    listPeople(currentChurch.id)
      .then(setPeople)
      .catch((err) => setLoadError(errorMessage(err, 'Não foi possível carregar as fichas.')))
      .finally(() => setIsLoading(false))
  }, [currentChurch])

  useEffect(() => {
    if (!currentChurch) return
    listStatusChanges(currentChurch.id, year)
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [currentChurch, year])

  const opts = { congregation, statuses, month, year, todayYMD: today }
  const table = useMemo(
    () =>
      buildReport(report, people, events, { congregation, statuses, month, year, todayYMD: today }),
    [report, people, events, congregation, statuses, month, year, today],
  )
  const title = reportTitle(report, opts)
  // Tabela larga (rol de membros) não cabe em retrato
  const wide = table.columns.length > 7
  const years = Array.from({ length: 6 }, (_, i) => now.year - i)

  const download = () => {
    const blob = new Blob([toCSV(table)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const cong = congregation === 'TODAS' ? '' : `-${congregation}`
    a.href = url
    a.download = `${title}${cong}.csv`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9.]+/g, '-')
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleStatus = (s: PersonStatus) =>
    setStatuses((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]))

  return (
    <div className="space-y-6 print:space-y-3">
      {wide && <style>{'@media print { @page { size: A4 landscape; margin: 0; } }'}</style>}
      <div className="no-print">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Relatórios
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Escolha o relatório, filtre, e imprima ou baixe para o Excel.
        </p>
      </div>

      <div className="no-print grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setReport(r.id)}
            className={`text-left rounded-2xl border p-3 transition-colors ${
              report === r.id
                ? 'bg-teal-50 border-teal-300'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <p
              className={`text-sm font-semibold ${report === r.id ? 'text-teal-900' : 'text-slate-900'}`}
            >
              {r.label}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{r.hint}</p>
          </button>
        ))}
      </div>

      <div className="no-print bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        <Select value={congregation} onValueChange={setCongregation}>
          <SelectTrigger className="h-9 w-44 rounded-xl" aria-label="Congregação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Toda a igreja</SelectItem>
            {CONGREGATIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {report === 'aniversariantes' && (
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-9 w-40 rounded-xl" aria-label="Mês">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(report === 'aniversariantes' || report === 'movimentacao' || report === 'visitantes') && (
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-28 rounded-xl" aria-label="Ano">
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
        )}
        {USES_STATUS.includes(report) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {PERSON_STATUS_ORDER.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm text-slate-700">
                <Checkbox checked={statuses.includes(s)} onCheckedChange={() => toggleStatus(s)} />
                {PERSON_STATUS_LABELS[s]}
              </label>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl gap-1.5"
            onClick={() => window.print()}
            disabled={!table.rows.length}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button
            className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
            onClick={download}
            disabled={!table.rows.length}
          >
            <Download className="h-4 w-4" />
            Baixar CSV (Excel)
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {loadError}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs print:border-0 print:shadow-none print:p-[10mm]">
          <div className="px-4 py-3 border-b border-slate-100 flex items-baseline gap-3 print:px-0">
            <h2 className="font-bold text-slate-900">{title}</h2>
            <span className="text-xs text-slate-500">
              {currentChurch?.name}
              {congregation !== 'TODAS' && ` · ${congregation}`} · {table.rows.length}{' '}
              {table.rows.length === 1 ? 'linha' : 'linhas'}
            </span>
          </div>
          {table.rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              <FileBarChart className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              Nada para mostrar com esses filtros.
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className={`w-full text-sm ${wide ? 'print:text-[7pt]' : 'print:text-[9pt]'}`}>
                <thead>
                  <tr className="bg-slate-50 text-left">
                    {table.columns.map((c) => (
                      <th
                        key={c}
                        className="px-3 py-2 print:px-1.5 print:py-1 font-semibold text-slate-600 whitespace-nowrap"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {table.rows.map((row, i) => (
                    <tr key={i} className="break-inside-avoid">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={`px-3 py-1.5 print:px-1.5 print:py-0.5 text-slate-800 ${j === 0 ? 'font-medium' : ''} ${
                            j > 0 && j < row.length - 1 ? 'print:whitespace-nowrap' : ''
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
