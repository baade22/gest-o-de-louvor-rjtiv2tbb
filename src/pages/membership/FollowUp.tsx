import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listPeople, updateFollowup } from '@/services/people'
import type { FollowupStage, Person } from '@/types'
import {
  FOLLOWUP_LABELS,
  FOLLOWUP_STAGES,
  STALE_DAYS,
  boardColumns,
  daysInStage,
  effectiveStage,
  isStale,
  nextStage,
} from '@/lib/followup'
import { CONGREGATIONS } from '@/lib/membership'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import { waLink } from '@/lib/whatsapp'
import {
  AlarmClock,
  ArrowRight,
  Archive,
  MessageCircle,
  Settings2,
  UserRound,
  UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
import { useToast } from '@/hooks/use-toast'
import { PersonAvatar, StatusBadge, errorMessage, usePhotoToken } from './shared'

const NONE = '__none__'

const COLUMN_STYLE: Record<string, string> = {
  PRIMEIRA_VISITA: 'border-t-amber-400',
  CONTATO: 'border-t-sky-400',
  RETORNO: 'border-t-violet-400',
  INTEGRADO: 'border-t-emerald-500',
}

function chip(active: boolean) {
  return `h-9 px-3 rounded-xl border text-sm font-medium transition-colors ${
    active
      ? 'bg-teal-50 border-teal-300 text-teal-800'
      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
  }`
}

function FollowCard({
  person,
  owner,
  today,
  token,
  onAdvance,
  onEdit,
}: {
  person: Person
  owner?: Person
  today: string
  token: string
  onAdvance?: () => void
  onEdit: () => void
}) {
  const days = daysInStage(person, today)
  const stale = isStale(person, today)
  const wa = waLink(person.phone)
  return (
    <div
      className={`bg-white rounded-xl border p-3 space-y-2.5 shadow-xs ${
        stale ? 'border-red-200' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <PersonAvatar person={person} token={token} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/membros/${person.id}`}
            className="text-sm font-semibold text-slate-900 hover:underline block truncate"
          >
            {person.name}
          </Link>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {person.status !== 'VISITANTE' && <StatusBadge status={person.status} />}
            {person.congregation && (
              <span className="text-[11px] text-slate-500">{person.congregation}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        {stale ? (
          <span className="flex items-center gap-1 font-semibold text-red-700">
            <AlarmClock className="h-3.5 w-3.5" />
            parado há {days} dias
          </span>
        ) : (
          <span className="text-slate-500">
            {days === 0 ? 'desde hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        {owner ? (
          <>
            <UserRound className="h-3.5 w-3.5 text-slate-400" />
            <span className="truncate">{owner.name}</span>
          </>
        ) : (
          <>
            <UserX className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-amber-700">sem responsável</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 pt-0.5">
        {wa && (
          <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" asChild>
            <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${person.name}`}>
              <MessageCircle className="h-4 w-4 text-emerald-600" />
            </a>
          </Button>
        )}
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 rounded-lg"
          onClick={onEdit}
          aria-label="Atualizar acompanhamento"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        {onAdvance && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg ml-auto gap-1 text-teal-800 border-teal-200 hover:bg-teal-50"
            onClick={onAdvance}
          >
            Avançar
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

export default function FollowUp() {
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const token = usePhotoToken()
  const today = getLocalTodayYMD()

  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [congregation, setCongregation] = useState('TODAS')
  const [ownerFilter, setOwnerFilter] = useState('TODOS')
  const [onlyStale, setOnlyStale] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const [editing, setEditing] = useState<Person | null>(null)
  const [editStage, setEditStage] = useState<FollowupStage>('PRIMEIRA_VISITA')
  const [editOwner, setEditOwner] = useState(NONE)
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!currentChurch) return
    try {
      setPeople(await listPeople(currentChurch.id))
    } catch (err) {
      toast({
        title: 'Erro ao carregar',
        description: errorMessage(err, 'Não foi possível abrir o acompanhamento.'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentChurch, toast])

  useEffect(() => {
    load()
  }, [load])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  // Quem pode acompanhar: membros e congregados
  const helpers = useMemo(
    () => people.filter((p) => p.status === 'MEMBRO' || p.status === 'CONGREGADO'),
    [people],
  )
  const all = useMemo(() => boardColumns(people, today), [people, today])
  const columns = useMemo(
    () =>
      boardColumns(people, today, {
        congregation,
        ownerId: ownerFilter === 'TODOS' ? undefined : ownerFilter,
        onlyStale,
      }),
    [people, today, congregation, ownerFilter, onlyStale],
  )
  const active = FOLLOWUP_STAGES.flatMap((s) => all[s.id])
  const staleCount = active.filter((p) => isStale(p, today)).length
  const noOwnerCount = active.filter(
    (p) => p.id && !p.followup_owner && effectiveStage(p) !== 'INTEGRADO',
  ).length
  const owners = useMemo(() => {
    const ids = new Set(active.map((p) => p.followup_owner).filter(Boolean) as string[])
    return Array.from(ids)
      .map((id) => peopleById.get(id))
      .filter((p): p is Person => !!p)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [active, peopleById])

  const save = async (person: Person, stage: FollowupStage, ownerId: string, note: string) => {
    setSaving(true)
    try {
      const saved = await updateFollowup(person, { stage, ownerId, note }, FOLLOWUP_LABELS[stage])
      setPeople((list) => list.map((p) => (p.id === saved.id ? saved : p)))
      return true
    } catch (err) {
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err, 'Tente de novo.'),
        variant: 'destructive',
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  const advance = async (p: Person) => {
    const stage = effectiveStage(p)
    const next = stage && nextStage(stage)
    if (!next) return
    if (await save(p, next, p.followup_owner || '', '')) {
      toast({ title: `${p.name}: ${FOLLOWUP_LABELS[next]}` })
    }
  }

  const openEdit = (p: Person) => {
    setEditing(p)
    setEditStage(effectiveStage(p) || 'PRIMEIRA_VISITA')
    setEditOwner(p.followup_owner || NONE)
    setEditNote('')
  }

  const submitEdit = async () => {
    if (!editing) return
    if (await save(editing, editStage, editOwner === NONE ? '' : editOwner, editNote))
      setEditing(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Acompanhamento de visitantes
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ninguém que visitou fica sem contato. Quem passa de {STALE_DAYS} dias parado aparece em
            vermelho.
          </p>
        </div>
        <div className="lg:ml-auto flex flex-wrap items-center gap-2">
          {['TODAS', ...CONGREGATIONS].map((c) => (
            <button
              key={c}
              type="button"
              className={chip(congregation === c)}
              onClick={() => setCongregation(c)}
            >
              {c === 'TODAS' ? 'Toda a igreja' : c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(onlyStale)} onClick={() => setOnlyStale((v) => !v)}>
          <span className="flex items-center gap-1.5">
            <AlarmClock className="h-4 w-4 text-red-600" />
            Parados <strong>{staleCount}</strong>
          </span>
        </button>
        <button
          type="button"
          className={chip(ownerFilter === 'NINGUEM')}
          onClick={() => setOwnerFilter((v) => (v === 'NINGUEM' ? 'TODOS' : 'NINGUEM'))}
        >
          <span className="flex items-center gap-1.5">
            <UserX className="h-4 w-4 text-amber-600" />
            Sem responsável <strong>{noOwnerCount}</strong>
          </span>
        </button>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger
            className="h-9 w-auto min-w-48 rounded-xl bg-white"
            aria-label="Responsável"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os responsáveis</SelectItem>
            <SelectItem value="NINGUEM">Sem responsável</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {FOLLOWUP_STAGES.map((stage) => {
            const list = columns[stage.id]
            return (
              <section
                key={stage.id}
                className={`bg-slate-100/70 rounded-2xl border border-slate-200 border-t-4 ${COLUMN_STYLE[stage.id]} p-3 space-y-3`}
              >
                <div className="px-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">{stage.label}</h2>
                    <span className="text-xs bg-white border border-slate-200 rounded-full px-2 text-slate-600">
                      {list.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{stage.hint}</p>
                </div>
                {list.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">Ninguém aqui</p>
                )}
                {list.map((p) => (
                  <FollowCard
                    key={p.id}
                    person={p}
                    owner={p.followup_owner ? peopleById.get(p.followup_owner) : undefined}
                    today={today}
                    token={token}
                    onEdit={() => openEdit(p)}
                    onAdvance={stage.id !== 'INTEGRADO' && !saving ? () => advance(p) : undefined}
                  />
                ))}
              </section>
            )
          })}
        </div>
      )}

      {all.ENCERRADO.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
            onClick={() => setShowClosed((v) => !v)}
          >
            <Archive className="h-4 w-4" />
            {showClosed ? 'Esconder' : 'Ver'} acompanhamentos encerrados ({all.ENCERRADO.length})
          </button>
          {showClosed && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {all.ENCERRADO.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Link
                    to={`/membros/${p.id}`}
                    className="text-sm font-medium text-slate-900 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-8 rounded-lg"
                    onClick={() => openEdit(p)}
                  >
                    Reabrir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
            <DialogDescription>
              Mudança de etapa e anotação ficam na linha do tempo da pessoa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fu-stage" className="text-xs font-semibold">
                Etapa
              </Label>
              <Select value={editStage} onValueChange={(v) => setEditStage(v as FollowupStage)}>
                <SelectTrigger id="fu-stage" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="ENCERRADO">
                    Encerrar (parou de vir, mudou de cidade...)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fu-owner" className="text-xs font-semibold">
                Responsável
              </Label>
              <Select value={editOwner} onValueChange={setEditOwner}>
                <SelectTrigger id="fu-owner" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ninguém ainda</SelectItem>
                  {helpers
                    .filter((h) => h.id !== editing?.id)
                    .map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fu-note" className="text-xs font-semibold">
                Anotação
              </Label>
              <Textarea
                id="fu-note"
                placeholder="Ex: liguei, pediu oração pelo emprego; vem domingo com a esposa"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="rounded-xl min-h-20"
                maxLength={2000}
              />
            </div>
            {editStage === 'INTEGRADO' && editing?.status === 'VISITANTE' && (
              <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                Lembre de mudar a situação na ficha para Congregado ou Membro.{' '}
                <Link
                  to={`/membros/${editing.id}/editar`}
                  className="font-semibold text-emerald-800 underline"
                >
                  Editar ficha
                </Link>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={submitEdit}
              disabled={saving}
              className="bg-teal-700 hover:bg-teal-800"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
