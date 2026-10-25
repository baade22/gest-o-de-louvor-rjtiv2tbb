import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  addGroupMember,
  deleteGroup,
  getGroup,
  listGroupMembers,
  removeGroupMember,
  updateGroupMemberRole,
} from '@/services/groups'
import { listPeople } from '@/services/people'
import type { ChurchGroup, GroupMember, GroupRole, Person } from '@/types'
import {
  GROUP_KIND_LABELS,
  GROUP_ROLE_LABELS,
  memberRows,
  phoneList,
  suggestVolunteers,
} from '@/lib/groups'
import { SKILL_LABELS } from '@/lib/membership'
import { waLink } from '@/lib/whatsapp'
import { formatCalendarDateDisplay } from '@/lib/dateUtils'
import {
  ArrowLeft,
  Clock,
  Copy,
  Crown,
  Edit,
  Lightbulb,
  MapPin,
  MessageCircle,
  Printer,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { GroupFormDialog } from './GroupFormDialog'
import { PersonAvatar, PersonPicker, StatusBadge, errorMessage, usePhotoToken } from './shared'

const ROLES = Object.keys(GROUP_ROLE_LABELS) as GroupRole[]

export default function GroupDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const { currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const token = usePhotoToken()
  const [group, setGroup] = useState<ChurchGroup | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const load = async () => {
    if (!currentChurch) return
    try {
      const [g, m, p] = await Promise.all([getGroup(id), listGroupMembers(id), listPeople(currentChurch.id)])
      setGroup(g)
      setMembers(m)
      setPeople(p)
    } catch (err) {
      toast({ title: 'Grupo não encontrado', description: errorMessage(err, 'Tente de novo.'), variant: 'destructive' })
      navigate('/membros/grupos')
    }
  }

  useEffect(() => {
    load()
  }, [id, currentChurch])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const rows = useMemo(() => memberRows(members, peopleById), [members, peopleById])
  const memberIds = useMemo(() => new Set(members.map((m) => m.person_id)), [members])
  const suggestions = useMemo(
    () => (group ? suggestVolunteers(group, people, memberIds).slice(0, 12) : []),
    [group, people, memberIds],
  )

  if (!group) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  const leader = group.leader_id ? peopleById.get(group.leader_id) : undefined

  const add = async (person: Person, role: GroupRole = 'PARTICIPANTE') => {
    try {
      const m = await addGroupMember(group, person.id, role)
      setMembers((list) => [...list, m])
      toast({ title: `${person.name.split(/\s+/)[0]} entrou em ${group.name}` })
    } catch (err) {
      toast({ title: 'Não foi possível adicionar', description: errorMessage(err, 'Tente de novo.'), variant: 'destructive' })
    }
  }

  const changeRole = async (m: GroupMember, role: GroupRole) => {
    try {
      const updated = await updateGroupMemberRole(m.id, role)
      setMembers((list) => list.map((x) => (x.id === m.id ? updated : x)))
    } catch (err) {
      toast({ title: 'Erro ao mudar o papel', description: errorMessage(err, 'Tente de novo.'), variant: 'destructive' })
    }
  }

  const remove = (m: GroupMember, person: Person) =>
    confirm({
      title: `Tirar ${person.name} de ${group.name}?`,
      description: 'A ficha continua na igreja; só deixa de aparecer neste grupo.',
      confirmLabel: 'Tirar do grupo',
      destructive: true,
      onConfirm: async () => {
        await removeGroupMember(m.id)
        setMembers((list) => list.filter((x) => x.id !== m.id))
      },
    })

  const removeGroup = () =>
    confirm({
      title: `Apagar "${group.name}"?`,
      description: `O grupo e a lista de ${members.length} participantes são apagados. As fichas continuam.`,
      confirmLabel: 'Apagar grupo',
      destructive: true,
      onConfirm: async () => {
        await deleteGroup(group.id)
        navigate('/membros/grupos')
      },
    })

  const copyPhones = async () => {
    const text = phoneList(rows)
    if (!text) {
      toast({ title: 'Ninguém do grupo tem telefone na ficha' })
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Telefones copiados', description: 'Cole no WhatsApp para montar a lista ou o grupo.' })
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Link to="/membros/grupos" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Grupos e ministérios
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs print:border-0 print:shadow-none print:p-[10mm] print:pb-0">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{group.name}</h1>
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-700">
                {GROUP_KIND_LABELS[group.kind]}
              </span>
              {!group.active && (
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-800">Inativo</span>
              )}
            </div>
            <div className="text-sm text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <Crown className="h-4 w-4 text-slate-400" />
                {leader ? (
                  <Link to={`/membros/${leader.id}`} className="hover:text-teal-800">
                    {leader.name}
                  </Link>
                ) : (
                  'Sem líder definido'
                )}
              </span>
              {group.meeting_info && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  {group.meeting_info}
                </span>
              )}
              {group.congregation && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {group.congregation}
                </span>
              )}
            </div>
            {group.description && <p className="text-sm text-slate-500 whitespace-pre-line">{group.description}</p>}
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4 text-slate-500" />
              Imprimir lista
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setEditOpen(true)}>
              <Edit className="h-4 w-4 text-slate-500" />
              Editar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Apagar grupo"
              className="h-9 w-9 text-slate-400 hover:text-red-600"
              onClick={removeGroup}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs print:border-0 print:shadow-none print:px-[10mm]">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-slate-100 print:px-0">
          <div className="min-w-0 mr-auto">
            <h2 className="text-base font-bold text-slate-900">Participantes</h2>
            <p className="text-xs text-slate-500">
              {rows.length} {rows.length === 1 ? 'pessoa' : 'pessoas'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="no-print rounded-xl gap-1.5" onClick={copyPhones} disabled={!rows.length}>
            <Copy className="h-4 w-4 text-slate-500" />
            Copiar telefones
          </Button>
          <Button size="sm" className="no-print rounded-xl gap-1.5 bg-teal-700 hover:bg-teal-800" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500 text-center">
            Ninguém no grupo ainda. Adicione pelas fichas{suggestions.length > 0 ? ' ou pelas sugestões abaixo' : ''}.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ member, person }) => {
              const wa = waLink(person.phone)
              return (
                <li key={member.id} className="flex items-center gap-3 px-5 py-2.5 print:px-0 print:py-1.5 break-inside-avoid">
                  <span className="print:hidden">
                    <PersonAvatar person={person} token={token} size="sm" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/membros/${person.id}`} className="text-sm font-semibold text-slate-900 hover:text-teal-800">
                      {person.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {[person.phone, member.since && `desde ${formatCalendarDateDisplay(member.since, 'numeric')}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="hidden sm:inline print:hidden">
                    <StatusBadge status={person.status} />
                  </span>
                  <span className="hidden print:inline text-xs text-slate-700 w-24">
                    {GROUP_ROLE_LABELS[(member.role || 'PARTICIPANTE') as GroupRole]}
                  </span>
                  <div className="no-print flex items-center gap-1">
                    <Select value={member.role || 'PARTICIPANTE'} onValueChange={(v) => changeRole(member, v as GroupRole)}>
                      <SelectTrigger className="h-8 w-32 rounded-lg text-xs" aria-label={`Papel de ${person.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {GROUP_ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp de ${person.name}`}
                        className="h-8 w-8 grid place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="h-8 w-8" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Tirar ${person.name} do grupo`}
                      onClick={() => remove(member, person)}
                      className="h-8 w-8 text-slate-300 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {(group.skills || []).length > 0 && (
        <section className="no-print bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-teal-700" />
              Quem pode ajudar
            </h2>
            <p className="text-xs text-slate-500">
              Membros e congregados que marcaram{' '}
              {(group.skills || []).map((s) => SKILL_LABELS[s].toLowerCase()).join(', ')} na ficha e ainda não estão no grupo
            </p>
          </div>
          {suggestions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500 text-center">
              Ninguém de fora do grupo com essas habilidades. Marque as habilidades na aba Servir de cada ficha.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {suggestions.map(({ person, matched }) => (
                <li key={person.id} className="flex items-center gap-3 px-5 py-2.5">
                  <PersonAvatar person={person} token={token} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/membros/${person.id}`} className="text-sm font-semibold text-slate-900 hover:text-teal-800">
                      {person.name}
                    </Link>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {matched.map((s) => (
                        <span key={s} className="text-[10px] font-semibold rounded-full bg-teal-50 text-teal-800 px-1.5 py-0.5">
                          {SKILL_LABELS[s]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => add(person)}>
                    <UserPlus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {currentChurch && (
        <GroupFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          churchId={currentChurch.id}
          group={group}
          people={people}
          onSaved={() => load()}
        />
      )}
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        groupName={group.name}
        people={people}
        exclude={memberIds}
        onAdd={add}
      />
      {confirmDialog}
    </div>
  )
}

function AddMemberDialog({
  open,
  onOpenChange,
  groupName,
  people,
  exclude,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  people: Person[]
  exclude: Set<string>
  onAdd: (person: Person, role: GroupRole) => Promise<void>
}) {
  const [role, setRole] = useState<GroupRole>('PARTICIPANTE')
  const [picked, setPicked] = useState<Person | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setRole('PARTICIPANTE')
      setPicked(null)
    }
  }, [open])

  const submit = async () => {
    if (!picked) return
    setSaving(true)
    await onAdd(picked, role)
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar em {groupName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="member-search" className="text-xs font-semibold text-slate-700">
              Quem
            </Label>
            {picked ? (
              <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
                <span className="font-semibold text-teal-900">{picked.name}</span>
                <button type="button" className="text-xs text-teal-700 underline" onClick={() => setPicked(null)}>
                  trocar
                </button>
              </div>
            ) : (
              <PersonPicker id="member-search" people={people} exclude={exclude} onPick={setPicked} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Papel no grupo</Label>
            <Select value={role} onValueChange={(v) => setRole(v as GroupRole)}>
              <SelectTrigger className="rounded-xl border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {GROUP_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl bg-teal-700 hover:bg-teal-800" onClick={submit} disabled={!picked || saving}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
