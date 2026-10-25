import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople } from '@/services/people'
import { getChurchForDocs } from '@/services/churchDocs'
import type { Church, Person } from '@/types'
import { CONGREGATIONS, filterPeople } from '@/lib/membership'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { usePhotoToken } from '../shared'
import { MemberCardBack, MemberCardFront } from './MemberCard'
import { ChurchDocSettingsPanel } from './ChurchDocSettingsPanel'

// Cinco carteirinhas (frente + verso lado a lado) cabem numa folha A4
const PER_SHEET = 5

export default function MemberCards() {
  const { currentChurch } = useAuth()
  const token = usePhotoToken()
  const [people, setPeople] = useState<Person[]>([])
  const [church, setChurch] = useState<Church | null>(null)
  const [congregation, setCongregation] = useState('TODAS')
  const [withCongregados, setWithCongregados] = useState(false)
  const [search, setSearch] = useState('')
  const [unselected, setUnselected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!currentChurch) return
    Promise.all([listPeople(currentChurch.id), getChurchForDocs(currentChurch.id)]).then(
      ([p, c]) => {
        setPeople(p)
        setChurch(c)
      },
    )
  }, [currentChurch])

  const candidates = useMemo(
    () =>
      filterPeople(people, { congregation, search }).filter(
        (p) => p.status === 'MEMBRO' || (withCongregados && p.status === 'CONGREGADO'),
      ),
    [people, congregation, search, withCongregados],
  )
  const chosen = candidates.filter((p) => !unselected.has(p.id))
  const sheets: Person[][] = []
  for (let i = 0; i < chosen.length; i += PER_SHEET) sheets.push(chosen.slice(i, i + PER_SHEET))

  const toggle = (id: string) =>
    setUnselected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!church) return <p className="p-6 text-slate-500">Carregando...</p>

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">
      <div className="no-print max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/membros"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Membros
          </Link>
          <h1 className="text-xl font-extrabold text-slate-900">Carteirinhas em lote</h1>
          <Button
            onClick={() => window.print()}
            disabled={chosen.length === 0}
            className="ml-auto rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
          >
            <Printer className="h-4 w-4" />
            Imprimir {chosen.length} {chosen.length === 1 ? 'carteirinha' : 'carteirinhas'}
          </Button>
        </div>
        <ChurchDocSettingsPanel church={church} onSaved={setChurch} />
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {['TODAS', ...CONGREGATIONS].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCongregation(c)}
                className={`h-9 px-3 rounded-xl border text-sm font-medium ${
                  congregation === c
                    ? 'bg-teal-50 border-teal-300 text-teal-800'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {c === 'TODAS' ? 'Toda a igreja' : c}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-slate-700 ml-2">
              <Checkbox
                checked={withCongregados}
                onCheckedChange={(v) => setWithCongregados(v === true)}
              />
              Incluir congregados
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar"
              className="rounded-xl h-9 w-48 ml-auto"
            />
          </div>
          <div className="max-h-48 overflow-y-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
            {candidates.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 py-0.5">
                <Checkbox checked={!unselected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
            {candidates.length === 0 && (
              <p className="text-sm text-slate-500">Ninguém com esse filtro.</p>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Cada linha é uma carteirinha: frente à esquerda, verso à direita. Recorte, dobre no meio e
          plastifique.
        </p>
      </div>

      <div className="space-y-6 pb-10 print:space-y-0 print:pb-0">
        {sheets.map((group, i) => (
          <div
            key={i}
            className="print-sheet bg-white shadow-lg mx-auto w-[210mm] h-[297mm] px-[19mm] py-[8mm] flex flex-col gap-[2.5mm]"
          >
            {group.map((p) => (
              <div key={p.id} className="flex w-max mx-auto border border-dashed border-slate-300">
                <MemberCardFront person={p} church={church} token={token} />
                <MemberCardBack person={p} church={church} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
