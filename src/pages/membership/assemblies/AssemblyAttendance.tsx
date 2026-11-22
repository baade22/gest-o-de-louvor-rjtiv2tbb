import React, { useMemo, useState } from 'react'
import { addAttendee, removeAttendee, updateAttendee } from '@/services/assemblies'
import { isEligibleVoter, quorumStatus } from '@/lib/assemblies'
import { filterPeople, PERSON_STATUS_LABELS } from '@/lib/membership'
import { Check, CheckCircle2, Search, Undo2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { SummaryCard, errorMessage } from '../shared'
import { Panel, type AssemblyCtx } from './common'

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AssemblyAttendance({ ctx }: { ctx: AssemblyCtx }) {
  const { assembly, attendees, people, peopleById, canTally, reload } = ctx
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string>('')

  const eligible = useMemo(
    () => people.filter((p) => isEligibleVoter(p, assembly)),
    [people, assembly],
  )
  const presentIds = new Set(attendees.map((a) => a.person_id))
  const presentVoters = attendees.filter((a) => a.voter).length
  const q = quorumStatus(assembly, eligible.length, presentVoters)

  const list = useMemo(() => {
    const base = search.trim()
      ? filterPeople(people, { search })
      : eligible.filter((p) => !presentIds.has(p.id))
    return base.filter((p) => p.status !== 'FALECIDO').slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, eligible, search, attendees])

  const fail = (err: unknown) =>
    toast({
      title: 'Não foi possível salvar',
      description: errorMessage(err, 'Tente de novo.'),
      variant: 'destructive',
    })

  const mark = async (personId: string) => {
    const p = peopleById.get(personId)
    if (!p) return
    setBusy(personId)
    try {
      await addAttendee(assembly, personId, isEligibleVoter(p, assembly), nowHHMM())
      setSearch('')
      await reload()
    } catch (err) {
      fail(err)
    } finally {
      setBusy('')
    }
  }

  const present = attendees
    .map((a) => ({ a, p: peopleById.get(a.person_id) }))
    .filter((x) => x.p)
    .sort((x, y) => x.p!.name.localeCompare(y.p!.name, 'pt-BR'))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Membros votantes" value={q.eligible} hint="pelas regras da convocação" />
        <SummaryCard label="Votantes presentes" value={q.present} />
        <SummaryCard
          label="Quórum 1ª convocação"
          value={q.first == null ? 'livre' : q.first}
        />
        <SummaryCard
          label="Quórum 2ª convocação"
          value={q.second == null ? 'livre' : q.second}
        />
      </div>
      <div
        className={`rounded-2xl border p-3 text-sm flex items-center gap-2 ${
          q.reachedOn
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        {q.reachedOn ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {q.reachedOn === 'PRIMEIRA'
          ? 'Quórum atingido para a 1ª convocação.'
          : q.reachedOn === 'SEGUNDA'
            ? 'Quórum só para a 2ª convocação: aguarde o horário dela para instalar.'
            : 'Quórum ainda não atingido.'}
      </div>

      {canTally && (
        <Panel
          title="Marcar presença"
          description="Sem busca, aparecem os membros votantes que ainda não chegaram. Visitantes podem ser marcados, mas não votam."
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pelo nome"
              className="pl-9 rounded-xl"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
            {list.length === 0 && (
              <li className="px-3 py-3 text-sm text-slate-500">Ninguém para marcar.</li>
            )}
            {list.map((p) => {
              const here = presentIds.has(p.id)
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {PERSON_STATUS_LABELS[p.status]}
                      {isEligibleVoter(p, assembly) ? ' · vota' : ' · não vota'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={here || busy === p.id}
                    onClick={() => mark(p.id)}
                    className="rounded-xl gap-1 bg-teal-700 hover:bg-teal-800"
                  >
                    <Check className="h-4 w-4" />
                    {here ? 'Presente' : 'Chegou'}
                  </Button>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <Panel
        title={`Presentes (${attendees.length})`}
        description="Desmarque “vota” de quem estiver presente sem direito a voto. A lista para assinar sai em Ata e cartório."
      >
        {present.length === 0 ? (
          <p className="text-sm text-slate-500">Ninguém marcado ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {present.map(({ a, p }) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 truncate">{p!.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {a.arrived ? `chegou ${a.arrived}` : ''}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Checkbox
                    checked={a.voter}
                    disabled={!canTally}
                    onCheckedChange={async (v) => {
                      try {
                        await updateAttendee(a.id, { voter: !!v })
                        await reload()
                      } catch (err) {
                        fail(err)
                      }
                    }}
                  />
                  vota
                </label>
                {canTally && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Desfazer presença"
                    onClick={async () => {
                      try {
                        await removeAttendee(a.id)
                        await reload()
                      } catch (err) {
                        fail(err)
                      }
                    }}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
