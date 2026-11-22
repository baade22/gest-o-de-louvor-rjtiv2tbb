import React, { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople } from '@/services/people'
import { getChurchForDocs } from '@/services/churchDocs'
import { getAssembly, listAttendees, listCandidates, listItems } from '@/services/assemblies'
import {
  ASSEMBLY_KIND_LABELS,
  ataParagraphs,
  buildSnapshot,
  dateNumeric,
  editalParagraphs,
  electedList,
  posseParagraphs,
  requerimentoParagraphs,
  type AtaSnapshot,
} from '@/lib/assemblies'
import { longDate } from '@/lib/documents'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

type DocKind = 'edital' | 'presenca' | 'ata' | 'posse' | 'requerimento'
const LABELS: Record<DocKind, string> = {
  edital: 'Edital de convocação',
  presenca: 'Lista de presença',
  ata: 'Ata',
  posse: 'Termo de posse',
  requerimento: 'Requerimento',
}
const KINDS = Object.keys(LABELS) as DocKind[]

function Sheet({ children, draft }: { children: React.ReactNode; draft: boolean }) {
  return (
    <div className="print-sheet relative bg-white shadow-lg border border-slate-200 mx-auto w-[210mm] min-h-[297mm] px-[22mm] py-[20mm] text-slate-900 font-serif text-[3.9mm] leading-[1.55]">
      {draft && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="rotate-[-30deg] text-[22mm] font-bold text-slate-200/70 select-none">
            RASCUNHO
          </span>
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  )
}

function Head({ s, title }: { s: AtaSnapshot; title: string }) {
  const line = [s.church.address, s.church.cnpj && `CNPJ ${s.church.cnpj}`].filter(Boolean).join(' · ')
  return (
    <div className="text-center mb-[8mm]">
      <p className="text-[5mm] font-extrabold uppercase">{s.church.name}</p>
      {line && <p className="text-[3.2mm] text-slate-600">{line}</p>}
      <p className="mt-[6mm] text-[4.4mm] font-bold uppercase">{title}</p>
    </div>
  )
}

function Sign({ name, role }: { name: string; role: string }) {
  return (
    <div className="w-[75mm] border-t border-slate-800 pt-[1.5mm] text-center">
      <p className="font-semibold text-[3.6mm]">{name || ' '}</p>
      <p className="text-[3.2mm] text-slate-600">{role}</p>
    </div>
  )
}

function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="space-y-[3mm] text-justify">
      {items.map((p, i) => (
        <p key={i} className="indent-[10mm]">
          {p}
        </p>
      ))}
    </div>
  )
}

function placeDate(s: AtaSnapshot, ymd: string) {
  return `${s.church.city || '[cidade]'}, ${longDate(ymd) || '[data]'}.`
}

export default function AssemblyDocuments() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const kind = (KINDS.includes(params.get('doc') as DocKind) ? params.get('doc') : 'ata') as DocKind
  const { currentChurch } = useAuth()
  const [snap, setSnap] = useState<AtaSnapshot | null>(null)
  const [draft, setDraft] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentChurch) return
    Promise.all([
      getAssembly(id),
      listItems(id),
      listCandidates(id),
      listAttendees(id),
      listPeople(currentChurch.id),
      getChurchForDocs(currentChurch.id),
    ])
      .then(([a, items, candidates, attendees, people, church]) => {
        const frozen = a.status === 'FINALIZADA' && a.minutes ? a.minutes : null
        setDraft(!frozen)
        setSnap(frozen || buildSnapshot({ church, assembly: a, items, candidates, attendees, people }))
      })
      .catch(() => setError('Não foi possível abrir a assembleia.'))
  }, [id, currentChurch])

  useEffect(() => {
    if (snap) document.title = `${LABELS[kind]} - ${snap.assembly.title}`
    return () => {
      document.title = 'LouvorFlow'
    }
  }, [kind, snap])

  if (error) return <p className="p-6 text-red-700">{error}</p>
  if (!snap) return <p className="p-6 text-slate-500">Carregando...</p>

  const a = snap.assembly
  const kindLabel = a.kind ? ` ${ASSEMBLY_KIND_LABELS[a.kind]}` : ''
  const presName = snap.president?.name || ''
  const secName = snap.secretary?.name || ''

  let body: React.ReactNode
  if (kind === 'edital') {
    const [first, ...rest] = editalParagraphs(snap, presName)
    const quorum = rest.pop() || ''
    body = (
      <>
        <Head s={snap} title={`Edital de convocação da Assembleia Geral${kindLabel}`} />
        <div className="space-y-[3mm] text-justify">
          <p className="indent-[10mm]">{first}</p>
          <ol className="pl-[14mm] space-y-[1mm]">
            {rest.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
          <p className="indent-[10mm]">{quorum}</p>
        </div>
        <p className="mt-[12mm] text-right">{placeDate(snap, a.call_date || getLocalTodayYMD())}</p>
        <div className="mt-[18mm] flex justify-center">
          <Sign name={presName} role="Presidente" />
        </div>
      </>
    )
  } else if (kind === 'presenca') {
    const rows = snap.attendees.length ? snap.attendees : []
    const blanks = Math.max(0, 25 - rows.length)
    body = (
      <>
        <Head
          s={snap}
          title={`Lista de presença · Assembleia Geral${kindLabel} de ${dateNumeric(a.date)}`}
        />
        <table className="w-full border-collapse text-[3.4mm]">
          <thead>
            <tr>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] w-[10mm]">Nº</th>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] text-left">Nome</th>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] w-[16mm]">Vota</th>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] w-[70mm]">Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border border-slate-500 px-[2mm] py-[2.5mm] text-center">{i + 1}</td>
                <td className="border border-slate-500 px-[2mm]">{r.name}</td>
                <td className="border border-slate-500 px-[2mm] text-center">{r.voter ? 'sim' : 'não'}</td>
                <td className="border border-slate-500" />
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`b${i}`}>
                <td className="border border-slate-500 px-[2mm] py-[3mm] text-center">
                  {rows.length + i + 1}
                </td>
                <td className="border border-slate-500" />
                <td className="border border-slate-500" />
                <td className="border border-slate-500" />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-[4mm] text-[3.4mm]">
          Presentes: {snap.presentTotal} · com direito a voto: {snap.presentVoters} · membros
          votantes: {snap.eligible}
        </p>
        <div className="mt-[16mm] flex justify-between gap-[10mm]">
          <Sign name={presName} role="Presidente da assembleia" />
          <Sign name={secName} role="Secretário(a)" />
        </div>
      </>
    )
  } else if (kind === 'ata') {
    const board = electedList(snap)
    body = (
      <>
        <Head s={snap} title={`Ata da Assembleia Geral${kindLabel} de ${dateNumeric(a.date)}`} />
        <Paragraphs items={ataParagraphs(snap)} />
        <p className="mt-[10mm] text-right">{placeDate(snap, a.date)}</p>
        <div className="mt-[18mm] flex justify-between gap-[10mm] break-inside-avoid">
          <Sign name={secName} role="Secretário(a)" />
          <Sign name={presName} role="Presidente" />
        </div>
        {board.length > 0 && (
          <div className="mt-[12mm] break-inside-avoid">
            <p className="font-bold uppercase">
              {board.length > 1 ? 'Nova diretoria:' : 'Eleito(a):'}
            </p>
            <div className="mt-[14mm] grid grid-cols-2 gap-x-[10mm] gap-y-[16mm] justify-items-center">
              {board.map((e) => (
                <Sign key={`${e.office}-${e.person.id}`} name={e.person.name} role={e.office} />
              ))}
            </div>
          </div>
        )}
        <p className="mt-[10mm] text-[3mm] text-slate-600">
          Todas as assinaturas com firma reconhecida em cartório.
        </p>
      </>
    )
  } else if (kind === 'posse') {
    const list = electedList(snap)
    body = (
      <>
        <Head s={snap} title="Termo de posse" />
        {list.length === 0 ? (
          <p>Nenhum eleito ou reconduzido registrado.</p>
        ) : (
          <>
            <Paragraphs items={posseParagraphs(snap)} />
            <p className="mt-[10mm] text-right">
              {placeDate(snap, list[0].office_date || a.date)}
            </p>
            <div className="mt-[14mm] grid grid-cols-2 gap-x-[10mm] gap-y-[16mm] justify-items-center">
              {list.map((e) => (
                <Sign key={`${e.office}-${e.person.id}`} name={e.person.name} role={e.office} />
              ))}
              <Sign name={presName} role="Presidente da assembleia" />
            </div>
          </>
        )}
      </>
    )
  } else {
    body = (
      <>
        <p className="mb-[10mm]">
          Ilmo(a). Sr(a). Oficial do Registro Civil das Pessoas Jurídicas
          {snap.church.city ? ` de ${snap.church.city.split('/')[0]}` : ''}
        </p>
        <Paragraphs items={requerimentoParagraphs(snap)} />
        <p className="mt-[10mm] text-right">{placeDate(snap, getLocalTodayYMD())}</p>
        <div className="mt-[18mm] flex justify-center">
          <Sign name={presName} role="Representante legal (firma reconhecida)" />
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">
      <div className="no-print max-w-[210mm] mx-auto px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/membros/assembleias/${id}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {a.title}
          </Link>
          <Button
            onClick={() => window.print()}
            className="ml-auto rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
          >
            <Printer className="h-4 w-4" />
            Imprimir ou salvar PDF
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setParams({ doc: k })}
              className={`h-9 px-3 rounded-xl border text-sm font-medium ${
                kind === k
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {LABELS[k]}
            </button>
          ))}
        </div>
        {draft && ['ata', 'posse', 'requerimento'].includes(kind) && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Rascunho: a ata ainda não foi finalizada. A versão para o cartório sai depois de
            finalizar, sem a marca d'água.
          </p>
        )}
      </div>
      <div className="pb-10 print:pb-0 overflow-x-auto">
        <Sheet draft={draft && ['ata', 'posse', 'requerimento'].includes(kind)}>{body}</Sheet>
      </div>
    </div>
  )
}
