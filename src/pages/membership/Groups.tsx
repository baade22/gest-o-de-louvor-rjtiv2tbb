import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listAllGroupMembers, listGroups } from '@/services/groups'
import { listPeople } from '@/services/people'
import type { ChurchGroup, GroupKind, GroupMember, Person } from '@/types'
import { GROUP_KIND_LABELS, countByGroup, filterGroups, suggestVolunteers } from '@/lib/groups'
import { CONGREGATIONS } from '@/lib/membership'
import { Clock, Crown, Lightbulb, Plus, Search, Users, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { GroupFormDialog } from './GroupFormDialog'
import { errorMessage } from './shared'

const KIND_STYLE: Record<GroupKind, string> = {
  MINISTERIO: 'bg-teal-50 text-teal-800',
  DEPARTAMENTO: 'bg-violet-50 text-violet-800',
  GRUPO: 'bg-amber-50 text-amber-800',
}

function chip(active: boolean) {
  return `h-9 px-3 rounded-xl border text-sm font-medium ${
    active
      ? 'bg-teal-50 border-teal-300 text-teal-800'
      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
  }`
}

export default function Groups() {
  const { currentChurch } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<ChurchGroup[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [kind, setKind] = useState<GroupKind | 'TODOS'>('TODOS')
  const [congregation, setCongregation] = useState('TODAS')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    if (!currentChurch) return
    Promise.all([
      listGroups(currentChurch.id),
      listAllGroupMembers(currentChurch.id),
      listPeople(currentChurch.id),
    ])
      .then(([g, m, p]) => {
        setGroups(g)
        setMembers(m)
        setPeople(p)
      })
      .catch((err) => setLoadError(errorMessage(err, 'Não foi possível carregar os grupos.')))
      .finally(() => setIsLoading(false))
  }, [currentChurch])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const counts = useMemo(() => countByGroup(members), [members])
  const shown = filterGroups(groups, { kind, congregation, search, showInactive })
  // Quantas pessoas ativas não estão em nenhum grupo (inclusive o louvor fica de fora daqui)
  const inSomeGroup = new Set(members.map((m) => m.person_id))
  const withoutGroup = people.filter(
    (p) => (p.status === 'MEMBRO' || p.status === 'CONGREGADO') && !inSomeGroup.has(p.id),
  ).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Grupos e ministérios
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Infantil, recepção, mídia, jovens, casais: quem participa e quem pode ajudar.
          </p>
        </div>
        <Button
          className="sm:ml-auto rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800"
          onClick={() => setFormOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Novo grupo
        </Button>
      </div>

      {!isLoading && !loadError && groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(['TODOS', 'MINISTERIO', 'DEPARTAMENTO', 'GRUPO'] as const).map((k) => (
            <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)}>
              {k === 'TODOS' ? 'Todos' : GROUP_KIND_LABELS[k]}
            </button>
          ))}
          <span className="w-px h-6 bg-slate-200 mx-1" />
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
          <label className="flex items-center gap-2 text-sm text-slate-600 ml-1">
            <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(v === true)} />
            Mostrar inativos
          </label>
          <div className="relative sm:ml-auto w-full sm:w-56">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar grupo"
              className="rounded-xl h-9 pl-9"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {loadError}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-2">
          <UsersRound className="h-10 w-10 text-slate-400 mx-auto" />
          <p className="font-semibold text-slate-800">Nenhum grupo ainda</p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Crie os ministérios e departamentos da igreja. Há modelos prontos (infantil, recepção,
            mídia, jovens, casais) e as habilidades das fichas viram sugestões de voluntários.
          </p>
          <Button
            className="rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800 mt-2"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Criar o primeiro
          </Button>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shown.map((g) => {
              const leader = g.leader_id ? peopleById.get(g.leader_id) : undefined
              const memberIds = new Set(
                members.filter((m) => m.group_id === g.id).map((m) => m.person_id),
              )
              const suggestions = suggestVolunteers(g, people, memberIds).length
              return (
                <Link
                  key={g.id}
                  to={`/membros/grupos/${g.id}`}
                  className={`group bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-teal-300 transition-colors space-y-2.5 ${
                    g.active ? '' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <h3 className="font-bold text-slate-900 group-hover:text-teal-800 flex-1 min-w-0 truncate">
                      {g.name}
                    </h3>
                    <span
                      className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${KIND_STYLE[g.kind]}`}
                    >
                      {GROUP_KIND_LABELS[g.kind]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1">
                    <p className="flex items-center gap-1.5">
                      <Crown className="h-3.5 w-3.5 text-slate-400" />
                      {leader ? (
                        leader.name
                      ) : (
                        <span className="text-amber-700">Sem líder definido</span>
                      )}
                    </p>
                    {g.meeting_info && (
                      <p className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {g.meeting_info}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700 pt-0.5">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <strong>{counts.get(g.id) || 0}</strong> participantes
                    </span>
                    {suggestions > 0 && (
                      <span className="flex items-center gap-1 text-teal-800">
                        <Lightbulb className="h-3.5 w-3.5" />
                        {suggestions} {suggestions === 1 ? 'sugestão' : 'sugestões'}
                      </span>
                    )}
                    {g.congregation && (
                      <span className="ml-auto text-slate-400">{g.congregation}</span>
                    )}
                    {!g.active && <span className="ml-auto text-slate-500">Inativo</span>}
                  </div>
                </Link>
              )
            })}
          </div>
          {shown.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum grupo com esse filtro.</p>
          )}
          {withoutGroup > 0 && (
            <p className="text-xs text-slate-500">
              {withoutGroup}{' '}
              {withoutGroup === 1
                ? 'membro ou congregado ainda não participa'
                : 'membros e congregados ainda não participam'}{' '}
              de nenhum grupo daqui.
            </p>
          )}
        </>
      )}

      {currentChurch && (
        <GroupFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          churchId={currentChurch.id}
          people={people}
          existingNames={groups.map((g) => g.name)}
          onSaved={(g) => navigate(`/membros/grupos/${g.id}`)}
        />
      )}
    </div>
  )
}
