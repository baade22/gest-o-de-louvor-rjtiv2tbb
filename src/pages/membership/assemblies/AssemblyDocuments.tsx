import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople } from '@/services/people'
import { getChurchForDocs } from '@/services/churchDocs'
import {
  getAssembly,
  listAttendees,
  listCandidates,
  listItems,
  listOnlineVoters,
  updateAssembly,
} from '@/services/assemblies'
import { onlineVoterRows, presenceRows, type OnlineVoterRow } from './onlineVoters'
import {
  DOC_BODY_KINDS,
  DOC_SCALE_MAX,
  DOC_SCALE_MIN,
  autoDocBody,
  autoDocTitle,
  buildSnapshot,
  clampScale,
  customDocBody,
  electedList,
  type Assembly,
  type AssemblyDocKind,
  type AtaSnapshot,
  type DocBodyKind,
  type DocTexts,
} from '@/lib/assemblies'
import { longDate } from '@/lib/documents'
import { churchDocLogo, churchLegalName } from '@/services/churchDocs'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { AArrowDown, AArrowUp, ArrowLeft, Pencil, Printer, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { RichText } from '@/pages/site/RichText'
import { RichTextEditor } from '@/pages/site/RichTextEditor'
import { errorMessage } from '../shared'

type DocKind = AssemblyDocKind
const LABELS: Record<DocKind, string> = {
  edital: 'Edital de convocação',
  presenca: 'Lista de presença',
  votantes: 'Votantes on-line',
  ata: 'Ata',
  posse: 'Termo de posse',
  requerimento: 'Requerimento',
}
const KINDS = Object.keys(LABELS) as DocKind[]

function Sheet({
  children,
  draft,
  scale,
}: {
  children: React.ReactNode
  draft: boolean
  scale: number
}) {
  return (
    <div
      style={{ fontSize: `${(3.9 * scale).toFixed(2)}mm` }}
      className="print-sheet print-fluid relative bg-white shadow-lg border border-slate-200 mx-auto w-[210mm] min-h-[297mm] px-[22mm] py-[20mm] text-slate-900 font-serif leading-[1.55]"
    >
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

/** Timbre: logo à esquerda, nome completo e CNPJ, como na ata de 2022. */
function Head({ s, title }: { s: AtaSnapshot; title: string }) {
  const { name, cnpj, address } = s.church
  const logo = s.church.logo || ''
  return (
    <div className="mb-[8mm]">
      <div className="flex items-center gap-[5mm] border-b border-slate-400 pb-[4mm]">
        {logo && <img src={logo} alt="" className="h-[22mm] w-[22mm] object-contain" />}
        <div className="flex-1 text-center">
          <p className="text-[5.4mm] font-bold leading-tight">{name}</p>
          {cnpj && <p className="text-[3.4mm] text-slate-700">CNPJ {cnpj}</p>}
          {address && <p className="text-[3mm] text-slate-600">{address}</p>}
        </div>
        {logo && <div className="w-[22mm]" />}
      </div>
      {title && <p className="mt-[6mm] text-center text-[1.13em] font-bold uppercase">{title}</p>}
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

/** Corpo do documento: texto formatado, parágrafos justificados com recuo. */
function DocBody({ text }: { text: string }) {
  return (
    <RichText
      text={text}
      defaultAlign="justify"
      className="space-y-[3mm] [&_.hyphens-auto]:hyphens-manual [&_p.text-justify]:indent-[10mm] [&_h2]:pt-0 [&_h2]:text-[1.25em] [&_h3]:pt-0 [&_h3]:text-[1.1em] [&_li]:pl-[1mm] [&_ol]:pl-[14mm] [&_ul]:pl-[14mm]"
    />
  )
}

type Draft = { title: string; body: string; scale: number }

function placeDate(s: AtaSnapshot, ymd: string) {
  return `${s.church.city || '[cidade]'}, ${longDate(ymd) || '[data]'}.`
}

const isBody = (k: DocKind): k is DocBodyKind => (DOC_BODY_KINDS as string[]).includes(k)

export default function AssemblyDocuments() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const kind = (KINDS.includes(params.get('doc') as DocKind) ? params.get('doc') : 'ata') as DocKind
  const { currentChurch, can } = useAuth()
  const { toast } = useToast()
  const [snap, setSnap] = useState<AtaSnapshot | null>(null)
  const [rec, setRec] = useState<Assembly | null>(null)
  const [draft, setDraft] = useState(true)
  const [error, setError] = useState('')
  const [voters, setVoters] = useState<OnlineVoterRow[]>([])
  const [edit, setEdit] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const autoOpened = useRef(false)

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
        setRec(a)
        const frozen = a.status === 'FINALIZADA' && a.minutes ? a.minutes : null
        setDraft(!frozen)
        const base =
          frozen || buildSnapshot({ church, assembly: a, items, candidates, attendees, people })
        // Timbre sempre com os dados atuais da igreja (nome completo, CNPJ, endereço e logo)
        setSnap({
          ...base,
          church: {
            ...base.church,
            name: churchLegalName(church),
            cnpj: church.doc_cnpj || base.church.cnpj,
            address: church.doc_address || base.church.address,
          },
        })
        churchDocLogo(church).then((logo) =>
          setSnap((cur) => (cur ? { ...cur, church: { ...cur.church, logo } } : cur)),
        )
        if (a.vote_key)
          listOnlineVoters(id)
            .then((v) => setVoters(onlineVoterRows(v, new Map(people.map((p) => [p.id, p])))))
            .catch(() => setVoters([]))
      })
      .catch(() => setError('Não foi possível abrir a assembleia.'))
  }, [id, currentChurch])

  useEffect(() => {
    if (snap) document.title = `${LABELS[kind]} - ${snap.assembly.title}`
    return () => {
      document.title = 'LouvorFlow'
    }
  }, [kind, snap])

  const locked = rec?.status === 'FINALIZADA'
  // Mesma regra do servidor: quem finaliza a ata edita sempre; quem altera, só antes de finalizar
  const canEditDocs =
    can('membresia.assembleias.ata') || (!locked && can('membresia.assembleias.alterar'))
  const presName = snap?.president?.name || ''

  const autoBody = (k: DocKind) => (snap && isBody(k) ? autoDocBody(k, snap, presName) : '')
  const autoTitle = (k: DocKind) => (snap ? autoDocTitle(k, snap) : '')

  const startEdit = () => {
    if (!snap || !rec) return
    setEdit({
      title: rec.doc_texts?.title?.[kind]?.trim() || autoTitle(kind),
      body: isBody(kind) ? customDocBody(kind, rec) || autoBody(kind) : '',
      scale: clampScale(rec.doc_texts?.scale?.[kind]),
    })
  }

  // Vindo de "Editar texto" na aba Ata e cartório, abre o editor direto
  useEffect(() => {
    if (autoOpened.current || !snap || !rec || params.get('editar') !== '1') return
    autoOpened.current = true
    if (canEditDocs) startEdit()
    const next = new URLSearchParams(params)
    next.delete('editar')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, rec])

  const save = async () => {
    if (!edit || !rec) return
    setSaving(true)
    try {
      const body =
        isBody(kind) && edit.body.trim() !== autoBody(kind).trim() ? edit.body.trim() : ''
      const title = edit.title.trim() !== autoTitle(kind) ? edit.title.trim() : ''
      const cur = rec.doc_texts || {}
      const texts: DocTexts = {
        body: { ...cur.body },
        title: { ...cur.title },
        scale: { ...cur.scale },
      }
      if (title) texts.title![kind] = title
      else delete texts.title![kind]
      if (edit.scale !== 1) texts.scale![kind] = edit.scale
      else delete texts.scale![kind]
      const payload: { doc_texts: DocTexts; minutes_text?: string } = { doc_texts: texts }
      if (kind === 'ata') payload.minutes_text = body
      else if (isBody(kind)) {
        if (body) texts.body![kind] = body
        else delete texts.body![kind]
      }
      const updated = await updateAssembly(rec.id, payload)
      setRec(updated)
      setEdit(null)
      toast({ title: `${LABELS[kind]} salvo(a)` })
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (error) return <p className="p-6 text-red-700">{error}</p>
  if (!snap || !rec) return <p className="p-6 text-slate-500">Carregando...</p>

  const a = snap.assembly
  const secName = snap.secretary?.name || ''
  // O que sai na folha: o rascunho em edição, o texto salvo à mão ou o automático
  const title = edit ? edit.title : rec.doc_texts?.title?.[kind]?.trim() || autoTitle(kind)
  const text = edit ? edit.body : isBody(kind) ? customDocBody(kind, rec) || autoBody(kind) : ''
  const scale = edit ? edit.scale : clampScale(rec.doc_texts?.scale?.[kind])
  const custom =
    !!rec.doc_texts?.title?.[kind]?.trim() ||
    !!rec.doc_texts?.scale?.[kind] ||
    (isBody(kind) && !!customDocBody(kind, rec))

  let body: React.ReactNode
  if (kind === 'edital') {
    body = (
      <>
        <Head s={snap} title={title} />
        <DocBody text={text} />
        <p className="mt-[12mm] text-right">{placeDate(snap, a.call_date || getLocalTodayYMD())}</p>
        <div className="mt-[18mm] flex justify-center">
          <Sign name={presName} role="Presidente" />
        </div>
      </>
    )
  } else if (kind === 'presenca') {
    const rows = presenceRows(snap.attendees, voters)
    const digital = rows.filter((r) => r.signed).length
    // Com votação on-line a lista já vem completa; sem ela, sobram linhas para assinar no papel
    const blanks = voters.length ? 0 : Math.max(0, 25 - rows.length)
    body = (
      <>
        <Head s={snap} title={title} />
        <table className="w-full border-collapse text-[0.87em]">
          <thead>
            <tr>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] w-[10mm]">Nº</th>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] text-left">Nome</th>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] w-[32mm]">CPF</th>
              <th className="border border-slate-500 px-[2mm] py-[1.5mm] w-[62mm]">Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border border-slate-500 px-[2mm] py-[2.5mm] text-center">{i + 1}</td>
                <td className="border border-slate-500 px-[2mm]">{r.name}</td>
                <td className="border border-slate-500 px-[2mm] text-center whitespace-nowrap">
                  {r.cpf}
                </td>
                <td className="border border-slate-500 px-[2mm] text-[0.88em] leading-tight">
                  {r.signed && (
                    <>
                      <span className="italic">{r.signed}</span>
                      {r.ip && (
                        <span className="block text-[0.87em] text-slate-600">IP {r.ip}</span>
                      )}
                    </>
                  )}
                </td>
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
        <p className="mt-[4mm] text-[0.87em]">
          Total de presentes: {rows.length}
          {digital > 0 ? ` (${digital} com assinatura digital pelo link de votação on-line)` : ''}
        </p>
        <div className="mt-[16mm] flex justify-between gap-[10mm]">
          <Sign name={presName} role="Presidente da assembleia" />
          <Sign name={secName} role="Secretário(a)" />
        </div>
      </>
    )
  } else if (kind === 'votantes') {
    body = (
      <>
        <Head s={snap} title={title} />
        {voters.length === 0 ? (
          <p>Nenhum voto on-line registrado (ou sem permissão para ver os votantes).</p>
        ) : (
          <>
            <div className="mb-[4mm]">
              <DocBody text={text} />
            </div>
            <table className="w-full border-collapse text-[0.82em]">
              <thead>
                <tr>
                  <th className="border border-slate-500 px-[1.5mm] py-[1.5mm] w-[8mm]">Nº</th>
                  <th className="border border-slate-500 px-[1.5mm] py-[1.5mm] text-left">Nome</th>
                  <th className="border border-slate-500 px-[1.5mm] py-[1.5mm]">CPF</th>
                  <th className="border border-slate-500 px-[1.5mm] py-[1.5mm]">Nascimento</th>
                  <th className="border border-slate-500 px-[1.5mm] py-[1.5mm]">Data e hora</th>
                  <th className="border border-slate-500 px-[1.5mm] py-[1.5mm]">IP</th>
                </tr>
              </thead>
              <tbody>
                {voters.map((r, i) => (
                  <tr key={r.id}>
                    <td className="border border-slate-500 px-[1.5mm] py-[1.5mm] text-center">
                      {i + 1}
                    </td>
                    <td className="border border-slate-500 px-[1.5mm]">{r.name}</td>
                    <td className="border border-slate-500 px-[1.5mm] text-center whitespace-nowrap">
                      {r.cpf || '—'}
                    </td>
                    <td className="border border-slate-500 px-[1.5mm] text-center">
                      {r.birth || '—'}
                    </td>
                    <td className="border border-slate-500 px-[1.5mm] text-center whitespace-nowrap">
                      {r.when}
                    </td>
                    <td className="border border-slate-500 px-[1.5mm] text-center">
                      {r.ip || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-[4mm] text-[0.87em]">Total de votantes on-line: {voters.length}</p>
            <div className="mt-[16mm] flex justify-between gap-[10mm]">
              <Sign name={secName} role="Secretário(a)" />
              <Sign name={presName} role="Presidente" />
            </div>
          </>
        )}
      </>
    )
  } else if (kind === 'ata') {
    const board = electedList(snap)
    body = (
      <>
        <Head s={snap} title={title} />
        <DocBody text={text} />
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
        <Head s={snap} title={title} />
        {list.length === 0 && !text.trim() ? (
          <p>Nenhum eleito ou reconduzido registrado.</p>
        ) : (
          <>
            <DocBody text={text} />
            <p className="mt-[10mm] text-right">
              {placeDate(snap, list[0]?.office_date || a.date)}
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
        <Head s={snap} title={title} />
        <DocBody text={text} />
        <p className="mt-[10mm] text-right">{placeDate(snap, getLocalTodayYMD())}</p>
        <div className="mt-[18mm] flex justify-center">
          <Sign name={presName} role="Representante legal (firma reconhecida)" />
        </div>
      </>
    )
  }

  const step = (d: number) =>
    setEdit((e) => (e ? { ...e, scale: clampScale(Math.round((e.scale + d) * 20) / 20) } : e))

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
          <div className="ml-auto flex flex-wrap gap-2">
            {canEditDocs && !edit && (
              <Button variant="outline" onClick={startEdit} className="rounded-xl gap-1.5">
                <Pencil className="h-4 w-4" />
                Editar documento
              </Button>
            )}
            <Button
              onClick={() => window.print()}
              disabled={!!edit}
              className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
            >
              <Printer className="h-4 w-4" />
              Imprimir ou salvar PDF
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={!!edit && k !== kind}
              onClick={() => setParams({ doc: k })}
              className={`h-9 px-3 rounded-xl border text-sm font-medium disabled:opacity-40 ${
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
        {!edit && custom && (
          <p className="text-xs text-slate-500">
            Este documento foi ajustado à mão. Mudanças na pauta, presença ou votação não entram
            sozinhas no texto: edite de novo ou use "Voltar ao automático".
          </p>
        )}
        {edit && (
          <div className="rounded-2xl border border-teal-200 bg-white p-4 space-y-3 shadow-sm">
            <div>
              <p className="font-bold text-slate-900">Editar {LABELS[kind].toLowerCase()}</p>
              <p className="text-xs text-slate-500">
                A folha abaixo mostra como vai sair. Timbre, local e data e assinaturas continuam
                automáticos. Deixe uma linha em branco entre um parágrafo e outro.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title" className="text-sm font-semibold text-slate-700">
                Título
              </Label>
              <Input
                id="doc-title"
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                className="rounded-xl"
              />
            </div>
            {isBody(kind) && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-700">Texto</p>
                <RichTextEditor
                  value={edit.body}
                  onChange={(body) => setEdit({ ...edit, body })}
                  rows={16}
                  defaultAlign="justify"
                  previewClassName="font-serif font-normal text-slate-900"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="font-semibold">Letra do documento</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Diminuir a letra"
                disabled={edit.scale <= DOC_SCALE_MIN}
                onClick={() => step(-0.05)}
                className="h-8 w-8 rounded-lg"
              >
                <AArrowDown className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center tabular-nums">{Math.round(edit.scale * 100)}%</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Aumentar a letra"
                disabled={edit.scale >= DOC_SCALE_MAX}
                onClick={() => step(0.05)}
                className="h-8 w-8 rounded-lg"
              >
                <AArrowUp className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setEdit(null)}
                disabled={saving}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={() => setEdit({ title: autoTitle(kind), body: autoBody(kind), scale: 1 })}
                disabled={saving}
                className="rounded-xl gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Voltar ao automático
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="pb-10 print:pb-0 overflow-x-auto print:overflow-visible">
        <Sheet draft={draft && ['ata', 'posse', 'requerimento'].includes(kind)} scale={scale}>
          {body}
        </Sheet>
      </div>
    </div>
  )
}
