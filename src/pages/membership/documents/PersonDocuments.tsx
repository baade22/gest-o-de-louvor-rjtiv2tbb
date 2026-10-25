import React, { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getPerson } from '@/services/people'
import { getChurchForDocs } from '@/services/churchDocs'
import type { Church, Person } from '@/types'
import {
  DOCUMENT_LABELS,
  baptismCertificateText,
  placeAndDate,
  recommendationLetterBody,
  transferLetterBody,
  type DocumentKind,
} from '@/lib/documents'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePhotoToken } from '../shared'
import { MemberCardBack, MemberCardFront } from './MemberCard'
import { ChurchDocSettingsPanel } from './ChurchDocSettingsPanel'

const KINDS: DocumentKind[] = ['carteirinha', 'transferencia', 'recomendacao', 'batismo']

function Letterhead({ church }: { church: Church }) {
  const line = [church.doc_address, church.doc_city, church.doc_cnpj && `CNPJ ${church.doc_cnpj}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="text-center border-b-2 border-teal-700 pb-[5mm]">
      <p className="text-[6mm] font-extrabold text-teal-800 tracking-tight">{church.name}</p>
      {line && <p className="text-[3.2mm] text-slate-600 mt-[1mm]">{line}</p>}
    </div>
  )
}

function Signature({ church, today }: { church: Church; today: string }) {
  return (
    <div className="mt-[14mm] space-y-[16mm]">
      <p className="text-right text-[4mm]">{placeAndDate(church.doc_city, today)}</p>
      <div className="mx-auto w-[85mm] border-t border-slate-800 pt-[1.5mm] text-center">
        <p className="text-[4mm] font-semibold">{church.doc_signer_name || ' '}</p>
        <p className="text-[3.4mm] text-slate-600">{church.doc_signer_title || 'Pastor'}</p>
      </div>
    </div>
  )
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-sheet bg-white shadow-lg border border-slate-200 mx-auto w-[210mm] min-h-[297mm] px-[22mm] py-[20mm] text-slate-900 font-serif">
      {children}
    </div>
  )
}

export default function PersonDocuments() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const kind = (
    KINDS.includes(params.get('tipo') as DocumentKind) ? params.get('tipo') : 'carteirinha'
  ) as DocumentKind
  const { currentChurch } = useAuth()
  const token = usePhotoToken()
  const today = getLocalTodayYMD()
  const [person, setPerson] = useState<Person | null>(null)
  const [church, setChurch] = useState<Church | null>(null)
  const [destination, setDestination] = useState('')
  const [extra, setExtra] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentChurch) return
    Promise.all([getPerson(id), getChurchForDocs(currentChurch.id)])
      .then(([p, c]) => {
        setPerson(p)
        setChurch(c)
      })
      .catch(() => setError('Não foi possível abrir a ficha.'))
  }, [id, currentChurch])

  useEffect(() => {
    if (person) document.title = `${DOCUMENT_LABELS[kind]} - ${person.name}`
    return () => {
      document.title = 'LouvorFlow'
    }
  }, [kind, person])

  if (error) return <p className="p-6 text-red-700">{error}</p>
  if (!person || !church) return <p className="p-6 text-slate-500">Carregando...</p>

  const letter =
    kind === 'transferencia'
      ? transferLetterBody({ person, church, destination, extra })
      : kind === 'recomendacao'
        ? recommendationLetterBody({ person, church, destination, extra })
        : null

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">
      {/* O certificado sai em paisagem; esta regra vem depois da padrão (retrato) e a substitui */}
      {kind === 'batismo' && (
        <style>{'@media print { @page { size: A4 landscape; margin: 0; } }'}</style>
      )}
      <div className="no-print max-w-[210mm] mx-auto px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/membros/${person.id}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {person.name}
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
              onClick={() => setParams({ tipo: k })}
              className={`h-9 px-3 rounded-xl border text-sm font-medium ${
                kind === k
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {DOCUMENT_LABELS[k]}
            </button>
          ))}
        </div>
        {letter && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="doc-dest" className="text-xs font-semibold">
                {kind === 'transferencia' ? 'Igreja de destino' : 'Recomendado à (opcional)'}
              </Label>
              <Input
                id="doc-dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Ex: Igreja Batista Central do Recife"
                className="rounded-xl h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="doc-extra" className="text-xs font-semibold">
                Frase a mais (opcional)
              </Label>
              <Textarea
                id="doc-extra"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="Ex: Muda-se por motivo de trabalho."
                className="rounded-xl min-h-9 h-9"
              />
            </div>
          </div>
        )}
        <ChurchDocSettingsPanel church={church} onSaved={setChurch} />
        {kind === 'carteirinha' && (
          <p className="text-xs text-slate-500">
            Imprima em papel mais grosso, recorte e dobre no meio (frente e verso) ou plastifique.
          </p>
        )}
      </div>

      <div className="pb-10 print:pb-0 overflow-x-auto print:overflow-visible">
        {kind === 'carteirinha' ? (
          <Sheet>
            <div className="flex justify-center gap-0 border border-dashed border-slate-300 w-max mx-auto">
              <MemberCardFront person={person} church={church} token={token} />
              <MemberCardBack person={person} church={church} />
            </div>
          </Sheet>
        ) : kind === 'batismo' ? (
          <div className="print-sheet bg-white shadow-lg mx-auto w-[297mm] h-[210mm] overflow-hidden">
            <div className="h-full p-[10mm]">
              <div className="h-full border-[1.5mm] border-double border-teal-700 rounded-[3mm] flex flex-col items-center justify-center text-center px-[25mm] font-serif text-slate-900">
                <p className="text-[4mm] uppercase tracking-[0.35em] text-teal-800">
                  {church.name}
                </p>
                <h1 className="text-[13mm] font-bold mt-[6mm] text-teal-900">
                  Certificado de Batismo
                </h1>
                <p className="text-[5mm] leading-relaxed mt-[8mm] max-w-[210mm]">
                  {baptismCertificateText(person, church)}
                </p>
                <p className="text-[4mm] italic text-slate-600 mt-[6mm]">
                  "Portanto, ide, fazei discípulos de todas as nações, batizando-os em nome do Pai,
                  e do Filho, e do Espírito Santo." Mateus 28:19
                </p>
                <div className="mt-[14mm] w-[90mm] border-t border-slate-800 pt-[1.5mm]">
                  <p className="text-[4mm] font-semibold">{church.doc_signer_name || ' '}</p>
                  <p className="text-[3.4mm] text-slate-600">
                    {church.doc_signer_title || 'Pastor'}
                  </p>
                </div>
                <p className="text-[3.4mm] text-slate-500 mt-[4mm]">
                  {placeAndDate(church.doc_city, today)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <Sheet>
            <Letterhead church={church} />
            <h1 className="text-center text-[6mm] font-bold mt-[12mm] mb-[10mm] uppercase tracking-wide">
              {DOCUMENT_LABELS[kind]}
            </h1>
            <div className="space-y-[5mm] text-[4.3mm] leading-[1.7] text-justify">
              {letter!.map((p, i) => (
                <p key={i} className={i === letter!.length - 1 ? 'text-left' : 'indent-[12mm]'}>
                  {p}
                </p>
              ))}
            </div>
            <Signature church={church} today={today} />
          </Sheet>
        )}
      </div>
    </div>
  )
}
