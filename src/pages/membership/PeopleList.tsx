import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { deletePerson, listPeople } from '@/services/people'
import type { Person, PersonSkill, PersonStatus } from '@/types'
import {
  CONGREGATIONS,
  PERSON_STATUS_LABELS,
  PERSON_STATUS_ORDER,
  SKILL_LABELS,
  SKILL_ORDER,
  ageOn,
  missingEssentials,
  filterPeople,
  summarizePeople,
} from '@/lib/membership'
import { getLocalTodayYMD } from '@/lib/dateUtils'
import {
  Cake,
  Edit,
  IdCard,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { PersonAvatar, StatusBadge, SummaryCard, errorMessage, usePhotoToken } from './shared'

export default function PeopleList() {
  const { currentChurch } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const photoToken = usePhotoToken()

  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PersonStatus | 'TODOS'>('TODOS')
  const [congregation, setCongregation] = useState('TODAS')
  const [skill, setSkill] = useState<PersonSkill | 'TODAS'>('TODAS')
  // ?incompletas=1 vem do painel: só fichas sem nascimento, telefone ou batismo
  const [params, setParams] = useSearchParams()
  const onlyIncomplete = params.get('incompletas') === '1'

  const fetchPeople = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    setLoadError('')
    try {
      setPeople(await listPeople(currentChurch.id))
    } catch (err) {
      console.error('Erro ao buscar membros:', err)
      setLoadError(errorMessage(err, 'Não foi possível carregar os membros.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPeople()
  }, [currentChurch])

  const today = getLocalTodayYMD()
  const summary = useMemo(() => summarizePeople(people), [people])
  const filtered = useMemo(
    () =>
      filterPeople(people, { search, status, congregation }).filter(
        (p) =>
          (skill === 'TODAS' || (p.skills || []).includes(skill)) &&
          (!onlyIncomplete || missingEssentials(p).length > 0),
      ),
    [people, search, status, congregation, skill, onlyIncomplete],
  )

  // Congregações sugeridas + as que já aparecem nas fichas
  const congregationOptions = useMemo(() => {
    const set = new Set(CONGREGATIONS)
    people.forEach((p) => p.congregation && set.add(p.congregation))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [people])

  const handleDelete = (person: Person) => {
    confirm({
      title: `Excluir a ficha de ${person.name}?`,
      description:
        'A ficha e a foto serão apagadas de vez. Se a pessoa saiu da igreja, prefira mudar a situação para Transferido ou Afastado e manter o histórico.',
      confirmLabel: 'Excluir ficha',
      destructive: true,
      onConfirm: async () => {
        try {
          await deletePerson(person.id)
          toast({ title: 'Ficha excluída', description: `${person.name} foi removido(a).` })
          fetchPeople()
        } catch (err) {
          toast({
            title: 'Erro ao excluir',
            description: errorMessage(err, 'Não foi possível excluir a ficha.'),
            variant: 'destructive',
          })
        }
      },
    })
  }

  const hasFilters =
    !!search ||
    status !== 'TODOS' ||
    congregation !== 'TODAS' ||
    skill !== 'TODAS' ||
    onlyIncomplete

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Membros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Fichas de membros, congregados e visitantes da {currentChurch?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/membros/aniversarios">
            <Button
              variant="outline"
              className="h-10 rounded-xl border-slate-200 font-semibold gap-2"
            >
              <Cake className="h-4 w-4" />
              Aniversariantes
            </Button>
          </Link>
          <Link to="/membros/carteirinhas">
            <Button
              variant="outline"
              className="h-10 rounded-xl border-slate-200 font-semibold gap-2"
            >
              <IdCard className="h-4 w-4" />
              Carteirinhas
            </Button>
          </Link>
          <Link to="/membros/novo">
            <Button className="h-10 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Novo membro
            </Button>
          </Link>
        </div>
      </div>

      {!isLoading && !loadError && people.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Membros" value={summary.byStatus.MEMBRO} />
          <SummaryCard label="Congregados" value={summary.byStatus.CONGREGADO} />
          <SummaryCard label="Visitantes" value={summary.byStatus.VISITANTE} />
          <SummaryCard
            label="Por congregação"
            value={
              <span className="flex flex-wrap gap-x-3 text-base font-bold">
                {Object.entries(summary.byCongregation).map(([name, count]) => (
                  <span key={name}>
                    {name}: {count}
                  </span>
                ))}
              </span>
            }
            hint="Membros, congregados e visitantes"
          />
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="pl-10 h-10 rounded-xl border-slate-200 focus-visible:ring-teal-700 bg-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap">
          <Select value={status} onValueChange={(v) => setStatus(v as PersonStatus | 'TODOS')}>
            <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white md:w-44">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas as situações</SelectItem>
              {PERSON_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {PERSON_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={congregation} onValueChange={setCongregation}>
            <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white md:w-48">
              <SelectValue placeholder="Congregação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Toda a igreja</SelectItem>
              {congregationOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={skill} onValueChange={(v) => setSkill(v as PersonSkill | 'TODAS')}>
            <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white md:w-48">
              <SelectValue placeholder="Habilidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Qualquer habilidade</SelectItem>
              {SKILL_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {SKILL_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {onlyIncomplete && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Mostrando só fichas sem nascimento, telefone ou batismo.
          <button
            type="button"
            className="text-xs font-semibold underline"
            onClick={() => {
              params.delete('incompletas')
              setParams(params)
            }}
          >
            Ver todas
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <Card className="rounded-2xl border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {loadError}
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-3 text-lg font-bold text-slate-900">
            {hasFilters ? 'Ninguém encontrado' : 'Nenhum membro cadastrado ainda'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {hasFilters
              ? 'Tente outro termo ou limpe os filtros.'
              : 'Cadastre as pessoas da igreja para acompanhar situação, congregação e aniversários.'}
          </p>
          {!hasFilters && (
            <Link to="/membros/novo" className="mt-5 inline-block">
              <Button className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold">
                Cadastrar primeiro membro
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {filtered.length} de {people.length} {people.length === 1 ? 'pessoa' : 'pessoas'}
          </p>
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((person) => {
              const age = ageOn(person.birth_date, today)
              const place = [person.neighborhood, person.city].filter(Boolean).join(', ')
              return (
                <div
                  key={person.id}
                  onClick={() => navigate(`/membros/${person.id}`)}
                  className="group bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:border-teal-300 hover:shadow-md transition-all flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <PersonAvatar person={person} token={photoToken} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-teal-800 transition-colors truncate">
                          {person.name}
                        </h3>
                        <StatusBadge status={person.status} />
                        {person.congregation && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                            {person.congregation}
                          </span>
                        )}
                        {person.church_office && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-100">
                            {person.church_office}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                        {age !== null && <span>{age} anos</span>}
                        {person.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {person.phone}
                          </span>
                        )}
                        {person.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {person.email}
                          </span>
                        )}
                        {place && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {place}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Opções de ${person.name}`}
                        className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-lg shrink-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/membros/${person.id}/editar`)
                        }}
                        className="gap-2 text-xs"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar ficha
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(person)
                        }}
                        className="gap-2 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir ficha
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        </>
      )}
      {confirmDialog}
    </div>
  )
}
