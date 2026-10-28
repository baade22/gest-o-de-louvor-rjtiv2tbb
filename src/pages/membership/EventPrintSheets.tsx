// Impressões do evento (lista de assinatura, lista de chamada e crachás com o QR de
// check-in) e a planilha dos inscritos. A folha aparece na tela e "Imprimir" manda só ela.

import React, { useMemo, useRef, useState } from 'react'
import type { ChurchEvent, EventRegistration } from '@/types'
import { eventDateLabel } from '@/lib/churchEvents'
import { checkinUrl, registrationsTable } from '@/lib/eventPage'
import { toCsv } from '@/lib/financeReports'
import { download, printSheet } from '@/pages/finance/print'
import { PixQr } from '@/pages/finance/PixQr'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SheetKind = 'assinatura' | 'chamada' | 'crachas'

const SHEETS: Array<[SheetKind, string]> = [
  ['assinatura', 'Lista de assinatura'],
  ['chamada', 'Lista de chamada'],
  ['crachas', 'Crachás com QR'],
]

function slug(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const th = 'border border-slate-400 px-2 py-1.5 text-left font-semibold bg-slate-100'
const td = 'border border-slate-400 px-2 py-2 align-top'

export function EventPrintTab({
  event,
  regs,
  churchName,
}: {
  event: ChurchEvent
  regs: EventRegistration[]
  churchName: string
}) {
  const [kind, setKind] = useState<SheetKind>('assinatura')
  const sheetRef = useRef<HTMLDivElement>(null)
  const sorted = useMemo(
    () => [...regs].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [regs],
  )
  const paidEvent = (event.price || 0) > 0
  // Na chamada cabem as duas primeiras perguntas do questionário
  const questions = (event.questions || []).slice(0, 2)
  const label = SHEETS.find(([k]) => k === kind)![1]
  const who = (r: EventRegistration) => (r.partner_name ? `${r.name} e ${r.partner_name}` : r.name)

  const header = (
    <div className="mb-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{churchName}</p>
      <h2 className="text-lg font-bold text-slate-900">
        {event.title} · {label}
      </h2>
      <p className="text-xs text-slate-600">
        {eventDateLabel(event)}
        {event.location ? ` · ${event.location}` : ''} · {regs.length} inscrições
      </p>
    </div>
  )

  let sheet: React.ReactNode
  if (kind === 'crachas') {
    sheet = (
      <div className="grid grid-cols-2 gap-3">
        {sorted.map((r) => (
          <div
            key={r.id}
            className="border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 break-inside-avoid"
            style={{ borderTopColor: event.color || '#0f766e', borderTopWidth: 6 }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 truncate">
                {event.title}
              </p>
              <p className="text-lg font-extrabold leading-tight text-slate-900">{r.name}</p>
              {r.partner_name && <p className="text-sm text-slate-700">e {r.partner_name}</p>}
            </div>
            {r.checkin_code && (
              <PixQr
                payload={checkinUrl(r.checkin_code)}
                label={`QR de ${r.name}`}
                className="h-20 w-20 shrink-0"
              />
            )}
          </div>
        ))}
      </div>
    )
  } else {
    sheet = (
      <>
        {header}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={`${th} w-8`}>#</th>
              <th className={th}>Nome</th>
              <th className={`${th} w-32`}>Telefone</th>
              {kind === 'assinatura' ? (
                <th className={`${th} w-[38%]`}>Assinatura</th>
              ) : (
                <>
                  {paidEvent && <th className={`${th} w-16`}>Pago</th>}
                  {questions.map((q) => (
                    <th key={q.id} className={th}>
                      {q.label}
                    </th>
                  ))}
                  <th className={`${th} w-20`}>Presente</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id}>
                <td className={td}>{i + 1}</td>
                <td className={td}>{who(r)}</td>
                <td className={td}>{r.phone}</td>
                {kind === 'assinatura' ? (
                  <td className={td} />
                ) : (
                  <>
                    {paidEvent && (
                      <td className={td}>
                        {r.paid ? (r.payment_method === 'ISENTO' ? 'Isento' : 'Sim') : 'Não'}
                      </td>
                    )}
                    {questions.map((q) => (
                      <td key={q.id} className={td}>
                        {r.answers?.[q.id] || ''}
                      </td>
                    ))}
                    <td className={`${td} text-center`}>{r.attended ? '✔' : '☐'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {(event.staff || []).length > 0 && (
          <p className="mt-3 text-[11px] text-slate-600">
            Equipe de apoio:{' '}
            {(event.staff || [])
              .map((m) => [m.name, m.task].filter(Boolean).join(' – '))
              .join(' · ')}
          </p>
        )}
      </>
    )
  }

  const exportCsv = () =>
    download(`inscritos-${slug(event.title)}.csv`, toCsv(registrationsTable(event, regs)))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {SHEETS.map(([k, text]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`h-8 px-3 rounded-lg border text-xs font-medium ${
              kind === k
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {text}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="rounded-xl gap-1.5" onClick={exportCsv}>
            <FileSpreadsheet className="h-4 w-4" />
            Planilha (CSV)
          </Button>
          <Button
            className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
            disabled={!regs.length}
            onClick={() =>
              sheetRef.current && printSheet(sheetRef.current, `${event.title} - ${label}`)
            }
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs overflow-x-auto">
        {regs.length ? (
          <div ref={sheetRef}>{sheet}</div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-6">Ninguém inscrito ainda.</p>
        )}
      </div>
      {kind === 'crachas' && (
        <p className="text-xs text-slate-500">
          O QR do crachá é o mesmo do comprovante: a equipe aponta a câmera do celular para ele e
          registra a entrada.
        </p>
      )}
    </div>
  )
}
