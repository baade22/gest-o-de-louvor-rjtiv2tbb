import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  createPersonEvent,
  createRelation,
  deletePersonEvent,
  deleteRelation,
  getPerson,
  listPeople,
  listPersonEvents,
  listPersonScales,
  listRelations,
  updatePerson,
} from '@/services/people'
import { listMusicians } from '@/services/musicians'
import { listGroups, listPersonGroupMembers } from '@/services/groups'
import { GROUP_KIND_LABELS, GROUP_ROLE_LABELS, groupsOfPerson } from '@/lib/groups'
import type {
  ChurchGroup,
  GroupMember,
  Person,
  PersonEvent,
  PersonEventKind,
  PersonRelation,
  PersonSkill,
  RelationKind,
} from '@/types'
import {
  ADMISSION_TYPE_LABELS,
  EVENT_KIND_LABELS,
  MARITAL_STATUS_LABELS,
  RELATION_KIND_LABELS,
  SKILL_LABELS,
  SKILL_ORDER,
  ageOn,
  areRelated,
  buildTimeline,
  familyOf,
  missingEssentials,
  profileCompleteness,
  yearsSince,
  type ScaleEntry,
  type TimelineEntry,
  type TimelineKind,
} from '@/lib/membership'
import { formatCalendarDateDisplay, getLocalTodayYMD } from '@/lib/dateUtils'
import { waLink } from '@/lib/whatsapp'
import { FOLLOWUP_LABELS, effectiveStage } from '@/lib/followup'
import {
  ArrowLeft,
  Award,
  Cake,
  CalendarHeart,
  DoorOpen,
  Droplets,
  Edit,
  FileText,
  Flame,
  Footprints,
  Heart,
  History,
  Home,
  KeyRound,
  Link2,
  MessageCircle,
  MessageSquareText,
  Music2,
  NotebookPen,
  Phone,
  Plus,
  Trash2,
  UserRound,
  Users,
  HandHeart,
  Contact,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
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
import { useConfirm } from '@/components/ConfirmDialog'
import { PersonAvatar, StatusBadge, errorMessage, usePhotoToken } from './shared'

const TIMELINE_STYLE: Record<TimelineKind, { icon: LucideIcon; className: string }> = {
  SITUACAO: { icon: UserRound, className: 'bg-emerald-50 text-emerald-700' },
  CARGO: { icon: Award, className: 'bg-violet-50 text-violet-700' },
  VISITA: { icon: Home, className: 'bg-amber-50 text-amber-700' },
  CONTATO: { icon: MessageSquareText, className: 'bg-sky-50 text-sky-700' },
  NOTA: { icon: NotebookPen, className: 'bg-slate-100 text-slate-600' },
  CONVERSAO: { icon: Flame, className: 'bg-orange-50 text-orange-700' },
  BATISMO: { icon: Droplets, className: 'bg-cyan-50 text-cyan-700' },
  ADMISSAO: { icon: DoorOpen, className: 'bg-emerald-50 text-emerald-700' },
  CASAMENTO: { icon: Heart, className: 'bg-rose-50 text-rose-700' },
  ESCALA: { icon: Music2, className: 'bg-teal-50 text-teal-700' },
}

function Meta({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      {children}
    </span>
  )
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export default function PersonProfile() {
  const { id } = useParams<{ id: string }>()
  const { currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const photoToken = usePhotoToken()
  const today = getLocalTodayYMD()

  const [person, setPerson] = useState<Person | null>(null)
  const [events, setEvents] = useState<PersonEvent[]>([])
  const [scales, setScales] = useState<ScaleEntry[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [relations, setRelations] = useState<PersonRelation[]>([])
  const [groups, setGroups] = useState<ChurchGroup[]>([])
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [accounts, setAccounts] = useState<Array<{ user_id: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [eventDialog, setEventDialog] = useState(false)
  const [familyDialog, setFamilyDialog] = useState(false)

  const loadAll = async () => {
    if (!id || !currentChurch) return
    try {
      const p = await getPerson(id)
      const [ev, ppl, rel] = await Promise.all([
        listPersonEvents(id),
        listPeople(currentChurch.id),
        listRelations(currentChurch.id),
      ])
      setPerson(p)
      setEvents(ev)
      setPeople(ppl)
      setRelations(rel)
      // Grupos são opcionais: sem a coleção no servidor, a aba só fica vazia
      const [g, gm] = await Promise.all([
        listGroups(currentChurch.id).catch(() => []),
        listPersonGroupMembers(id).catch(() => []),
      ])
      setGroups(g)
      setGroupMembers(gm)
      setScales(
        p.user_id ? await listPersonScales(currentChurch.id, p.user_id).catch(() => []) : [],
      )
    } catch (err) {
      toast({
        title: 'Ficha não encontrada',
        description: errorMessage(err, 'Não foi possível abrir esta ficha.'),
        variant: 'destructive',
      })
      navigate('/membros')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setIsLoading(true)
    loadAll()
  }, [id, currentChurch])

  useEffect(() => {
    if (!currentChurch) return
    listMusicians(currentChurch.id)
      .then((list) =>
        setAccounts(list.map((m) => ({ user_id: m.user_id, name: m.name || m.email }))),
      )
      .catch(() => setAccounts([]))
  }, [currentChurch])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const family = useMemo(
    () => (person ? familyOf(person.id, relations, peopleById) : []),
    [person, relations, peopleById],
  )
  const myGroups = useMemo(
    () => (person ? groupsOfPerson(person.id, groups, groupMembers) : []),
    [person, groups, groupMembers],
  )
  const timeline = useMemo(
    () => (person ? buildTimeline(person, events, scales) : []),
    [person, events, scales],
  )

  if (isLoading || !person) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  const age = ageOn(person.birth_date, today)
  const tenure = person.status === 'MEMBRO' ? yearsSince(person.admission_date, today) : null
  const filled = profileCompleteness(person)
  const missing = missingEssentials(person)
  const wa = waLink(person.phone)
  const followStage = effectiveStage(person)
  const linkedAccount = accounts.find((a) => a.user_id === person.user_id)

  const savePerson = async (data: Partial<Person>, okMessage: string) => {
    try {
      const updated = await updatePerson(person.id, data)
      setPerson(updated)
      toast({ title: okMessage })
      if ('user_id' in data && currentChurch) {
        setScales(
          updated.user_id
            ? await listPersonScales(currentChurch.id, updated.user_id).catch(() => [])
            : [],
        )
      }
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: errorMessage(err, 'Não foi possível salvar.'),
        variant: 'destructive',
      })
    }
  }

  const toggleSkill = (skill: PersonSkill) => {
    const current = person.skills || []
    const next = current.includes(skill) ? current.filter((s) => s !== skill) : [...current, skill]
    setPerson({ ...person, skills: next })
    savePerson({ skills: next }, 'Habilidades atualizadas')
  }

  const removeEntry = (entry: TimelineEntry) => {
    if (!entry.eventId) return
    confirm({
      title: 'Apagar este registro?',
      description: `"${entry.title}" sai da linha do tempo. A ficha não muda.`,
      confirmLabel: 'Apagar registro',
      destructive: true,
      onConfirm: async () => {
        await deletePersonEvent(entry.eventId!)
        setEvents((prev) => prev.filter((e) => e.id !== entry.eventId))
      },
    })
  }

  const removeRelation = (relation: PersonRelation, name: string) => {
    confirm({
      title: `Desfazer o vínculo com ${name}?`,
      description: 'As duas fichas continuam existindo; só a ligação de família é apagada.',
      confirmLabel: 'Desfazer vínculo',
      destructive: true,
      onConfirm: async () => {
        await deleteRelation(relation.id)
        setRelations((prev) => prev.filter((r) => r.id !== relation.id))
      },
    })
  }

  const fichaRows: Array<[string, string | undefined]> = [
    ['Nascimento', person.birth_date && formatCalendarDateDisplay(person.birth_date, 'numeric')],
    ['Sexo', person.gender === 'F' ? 'Feminino' : person.gender === 'M' ? 'Masculino' : undefined],
    [
      'Estado civil',
      person.marital_status ? MARITAL_STATUS_LABELS[person.marital_status] : undefined,
    ],
    ['Casamento', person.wedding_date && formatCalendarDateDisplay(person.wedding_date, 'numeric')],
    ['Telefone', person.phone],
    ['E-mail', person.email],
    [
      'Endereço',
      [
        person.address,
        person.neighborhood,
        person.city && `${person.city}${person.state ? `/${person.state}` : ''}`,
        person.zip_code,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    ['Congregação', person.congregation],
    ['Nº do rol', person.roll_number],
    ['Cargo', person.church_office],
    [
      'Conversão',
      person.conversion_date && formatCalendarDateDisplay(person.conversion_date, 'numeric'),
    ],
    ['Batismo', person.baptism_date && formatCalendarDateDisplay(person.baptism_date, 'numeric')],
    [
      'Admissão',
      person.admission_date &&
        `${formatCalendarDateDisplay(person.admission_date, 'numeric')}${
          person.admission_type ? ` · ${ADMISSION_TYPE_LABELS[person.admission_type]}` : ''
        }`,
    ],
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link
        to="/membros"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Membros
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 flex flex-col md:flex-row gap-5 md:items-center">
        <PersonAvatar person={person} token={photoToken} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{person.name}</h1>
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 mt-2">
            {age !== null && (
              <Meta icon={Cake}>
                {formatCalendarDateDisplay(person.birth_date, 'numeric')} · {age} anos
              </Meta>
            )}
            {person.phone && <Meta icon={Phone}>{person.phone}</Meta>}
            {person.baptism_date && (
              <Meta icon={Droplets}>
                Batismo em {formatCalendarDateDisplay(person.baptism_date, 'numeric')}
              </Meta>
            )}
            {tenure !== null && (
              <Meta icon={CalendarHeart}>
                Membro há {tenure} {tenure === 1 ? 'ano' : 'anos'}
              </Meta>
            )}
            {followStage && followStage !== 'ENCERRADO' && (
              <Meta icon={Footprints}>
                <Link to="/membros/acompanhamento" className="hover:underline">
                  Acompanhamento: {FOLLOWUP_LABELS[followStage]}
                </Link>
              </Meta>
            )}
            {person.user_id && <Meta icon={KeyRound}>Tem login no LouvorFlow</Meta>}
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-amber-700 mt-2">Falta na ficha: {missing.join(', ')}.</p>
          )}
        </div>
        <div className="flex flex-col gap-3 md:w-48 shrink-0">
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Ficha preenchida</span>
              <b className="text-slate-800">{filled}%</b>
            </div>
            <Progress value={filled} className="h-1.5" />
          </div>
          <div className="flex gap-2">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" size="sm" className="w-full rounded-xl gap-1.5">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  WhatsApp
                </Button>
              </a>
            )}
            <Link to={`/membros/${person.id}/documentos`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full rounded-xl gap-1.5">
                <FileText className="h-4 w-4 text-slate-500" />
                Documentos
              </Button>
            </Link>
            <Link to={`/membros/${person.id}/editar`} className="flex-1">
              <Button
                size="sm"
                className="w-full rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800 text-white"
              >
                <Edit className="h-4 w-4" />
                Editar
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <Tabs defaultValue="linha">
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-full min-w-max justify-start gap-1 rounded-none border-b border-slate-200 bg-transparent p-0">
            {[
              ['linha', 'Linha do tempo', History, timeline.length],
              ['familia', 'Família', Users, family.length],
              ['servir', 'Servir', HandHeart, myGroups.length + (person.skills || []).length],
              ['ficha', 'Ficha', Contact, 0],
            ].map(([value, label, Icon, count]) => {
              const I = Icon as LucideIcon
              return (
                <TabsTrigger
                  key={value as string}
                  value={value as string}
                  className="gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-slate-500 data-[state=active]:border-teal-600 data-[state=active]:text-teal-800 data-[state=active]:shadow-none"
                >
                  <I className="h-4 w-4" />
                  {label as string}
                  {(count as number) > 0 && (
                    <span className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-1.5">
                      {count as number}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <TabsContent value="linha" className="mt-4">
          <Panel
            title="Linha do tempo"
            description="Mudanças de situação, datas da ficha, contatos e escalas, do mais recente ao mais antigo"
            action={
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={() => setEventDialog(true)}
              >
                <Plus className="h-4 w-4" />
                Registrar
              </Button>
            }
          >
            {timeline.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500 text-center">
                Nada registrado ainda. Datas de batismo e admissão da ficha aparecem aqui sozinhas.
              </p>
            ) : (
              <ol className="px-5 py-3">
                {timeline.map((entry) => {
                  const style = TIMELINE_STYLE[entry.kind]
                  const Icon = style.icon
                  return (
                    <li
                      key={entry.key}
                      className="group grid grid-cols-[5.5rem_1.75rem_1fr_auto] gap-3 py-2.5 items-start"
                    >
                      <span className="text-xs text-slate-400 text-right pt-1">
                        {formatCalendarDateDisplay(entry.date, 'numeric')}
                      </span>
                      <span
                        className={`h-7 w-7 rounded-full grid place-items-center ${style.className}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                        {entry.description && (
                          <p className="text-xs text-slate-500 whitespace-pre-line">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      {entry.eventId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Apagar registro"
                          onClick={() => removeEntry(entry)}
                          className="h-7 w-7 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span />
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="familia" className="mt-4">
          <Panel
            title="Família"
            description="Vínculos com outras fichas da igreja"
            action={
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={() => setFamilyDialog(true)}
              >
                <Link2 className="h-4 w-4" />
                Vincular
              </Button>
            }
          >
            {family.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500 text-center">
                Nenhum familiar vinculado. Cadastre o cônjuge e os filhos como fichas e ligue aqui.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {family.map((f) => {
                  const relAge = ageOn(f.relative.birth_date, today)
                  return (
                    <li key={f.relation.id} className="flex items-center gap-3 px-5 py-3">
                      <PersonAvatar person={f.relative} token={photoToken} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/membros/${f.relative.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-teal-800"
                        >
                          {f.relative.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {[
                            f.label,
                            relAge !== null ? `${relAge} anos` : '',
                            f.relation.lives_together ? 'mora junto' : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <StatusBadge status={f.relative.status} />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Desfazer vínculo com ${f.relative.name}`}
                        onClick={() => removeRelation(f.relation, f.relative.name)}
                        className="h-8 w-8 text-slate-300 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="servir" className="mt-4 space-y-4">
          <Panel
            title="Grupos e ministérios"
            description="Onde a pessoa serve ou participa, além do louvor"
            action={
              <Link to="/membros/grupos">
                <Button size="sm" variant="outline" className="rounded-xl">
                  Ver grupos
                </Button>
              </Link>
            }
          >
            {myGroups.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500 text-center">
                Não participa de nenhum grupo ainda. Adicione pela página do grupo.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 p-5">
                {myGroups.map(({ group, role }) => (
                  <Link
                    key={group.id}
                    to={`/membros/grupos/${group.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 hover:border-teal-300"
                  >
                    <p className="text-sm font-semibold text-slate-900">{group.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {GROUP_KIND_LABELS[group.kind]} · {GROUP_ROLE_LABELS[role]}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
          <Panel
            title="Habilidades"
            description="Toque para marcar o que a pessoa sabe ou gosta de fazer"
          >
            <div className="flex flex-wrap gap-2 p-5">
              {SKILL_ORDER.map((skill) => {
                const on = (person.skills || []).includes(skill)
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      on
                        ? 'bg-teal-50 border-teal-300 text-teal-800'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {SKILL_LABELS[skill]}
                  </button>
                )
              })}
            </div>
          </Panel>
          <Panel
            title="Conta de acesso"
            description="Ligue a ficha à conta da pessoa no LouvorFlow para ver as escalas dela aqui"
          >
            <div className="p-5 flex flex-col sm:flex-row gap-3 sm:items-center">
              <Select
                value={person.user_id || '__none__'}
                onValueChange={(v) =>
                  savePerson({ user_id: v === '__none__' ? '' : v }, 'Conta de acesso atualizada')
                }
              >
                <SelectTrigger className="rounded-xl border-slate-200 sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem conta vinculada</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {linkedAccount
                  ? `${scales.length} ${scales.length === 1 ? 'escala recente aparece' : 'escalas recentes aparecem'} na linha do tempo.`
                  : 'Quem ainda não tem conta pode ser convidado em Convites.'}
              </p>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="ficha" className="mt-4">
          <Panel
            title="Ficha"
            action={
              <Link to={`/membros/${person.id}/editar`}>
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5">
                  <Edit className="h-4 w-4" />
                  Editar ficha
                </Button>
              </Link>
            }
          >
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-5 text-sm">
              {fichaRows.map(([label, value]) => (
                <div key={label} className="flex gap-3 border-b border-slate-50 pb-2">
                  <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
                  <dd className={value ? 'text-slate-900' : 'text-slate-300'}>{value || '—'}</dd>
                </div>
              ))}
            </dl>
            {person.notes && (
              <div className="px-5 pb-5">
                <p className="text-xs font-semibold text-slate-500 mb-1">Observações</p>
                <p className="text-sm text-slate-700 whitespace-pre-line">{person.notes}</p>
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <EventDialog
        open={eventDialog}
        onOpenChange={setEventDialog}
        onSave={async (data) => {
          const created = await createPersonEvent({
            ...data,
            church_id: person.church_id,
            person_id: person.id,
          })
          setEvents((prev) => [created, ...prev])
          toast({ title: 'Registrado na linha do tempo' })
        }}
      />
      <FamilyDialog
        open={familyDialog}
        onOpenChange={setFamilyDialog}
        person={person}
        people={people}
        relations={relations}
        onSave={async (relativeId, kind, livesTogether) => {
          const created = await createRelation({
            church_id: person.church_id,
            person_id: person.id,
            relative_id: relativeId,
            kind,
            lives_together: livesTogether,
          })
          setRelations((prev) => [...prev, created])
          toast({ title: 'Familiar vinculado' })
        }}
      />
      {confirmDialog}
    </div>
  )
}

function EventDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    kind: PersonEventKind
    date: string
    title: string
    description: string
  }) => Promise<void>
}) {
  const { toast } = useToast()
  const [kind, setKind] = useState<Exclude<PersonEventKind, 'SITUACAO'>>('CONTATO')
  const [date, setDate] = useState(getLocalTodayYMD())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setKind('CONTATO')
      setDate(getLocalTodayYMD())
      setTitle('')
      setDescription('')
    }
  }, [open])

  const placeholder: Record<typeof kind, string> = {
    CONTATO: 'Ex: Ligação, conversa pelo WhatsApp',
    VISITA: 'Ex: Visita em casa',
    CARGO: 'Ex: Nomeado(a) diácono(isa)',
    NOTA: 'Ex: Pediu oração pela família',
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date) return
    setSaving(true)
    try {
      await onSave({
        kind,
        date: `${date} 00:00:00.000Z`,
        title: title.trim(),
        description: description.trim(),
      })
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Erro ao registrar',
        description: errorMessage(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar na linha do tempo</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVENT_KIND_LABELS) as Array<typeof kind>).map((k) => (
                    <SelectItem key={k} value={k}>
                      {EVENT_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-date" className="text-xs font-semibold text-slate-700">
                Data
              </Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border-slate-200"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-title" className="text-xs font-semibold text-slate-700">
              O que aconteceu
            </Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={placeholder[kind]}
              className="rounded-xl border-slate-200"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-desc" className="text-xs font-semibold text-slate-700">
              Detalhes (opcional)
            </Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-xl border-slate-200"
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white"
            >
              {saving ? 'Salvando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FamilyDialog({
  open,
  onOpenChange,
  person,
  people,
  relations,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person
  people: Person[]
  relations: PersonRelation[]
  onSave: (relativeId: string, kind: RelationKind, livesTogether: boolean) => Promise<void>
}) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [relativeId, setRelativeId] = useState('')
  const [kind, setKind] = useState<RelationKind>('CONJUGE')
  const [livesTogether, setLivesTogether] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setSearch('')
      setRelativeId('')
      setKind('CONJUGE')
      setLivesTogether(true)
    }
  }, [open])

  const candidates = useMemo(() => {
    const q = search
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
    return people
      .filter((p) => p.id !== person.id && !areRelated(person.id, p.id, relations))
      .filter(
        (p) =>
          !q ||
          p.name
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .includes(q),
      )
      .slice(0, 8)
  }, [people, person.id, relations, search])

  const selected = people.find((p) => p.id === relativeId)

  const submit = async () => {
    if (!relativeId) return
    setSaving(true)
    try {
      await onSave(relativeId, kind, livesTogether)
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Erro ao vincular',
        description: errorMessage(err, 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular familiar de {person.name.split(/\s+/)[0]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="family-search" className="text-xs font-semibold text-slate-700">
              Quem é
            </Label>
            {selected ? (
              <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
                <span className="font-semibold text-teal-900">{selected.name}</span>
                <button
                  type="button"
                  className="text-xs text-teal-700 underline"
                  onClick={() => setRelativeId('')}
                >
                  trocar
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="family-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar ficha pelo nome"
                  className="rounded-xl border-slate-200"
                />
                <ul className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100">
                  {candidates.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-slate-500">
                      Nenhuma ficha encontrada. Cadastre a pessoa antes em Membros.
                    </li>
                  ) : (
                    candidates.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setRelativeId(p.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              {selected ? `${selected.name.split(/\s+/)[0]} é…` : 'Parentesco'}
            </Label>
            <Select value={kind} onValueChange={(v) => setKind(v as RelationKind)}>
              <SelectTrigger className="rounded-xl border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RELATION_KIND_LABELS) as RelationKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {RELATION_KIND_LABELS[k]} de {person.name.split(/\s+/)[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            Moram juntos
            <Switch checked={livesTogether} onCheckedChange={setLivesTogether} />
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!relativeId || saving}
            onClick={submit}
            className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white"
          >
            {saving ? 'Salvando...' : 'Vincular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
