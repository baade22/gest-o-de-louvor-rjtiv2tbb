import React, { useState } from 'react'
import { Check, Loader2, Plus, Trash2, Users } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import type { ChurchMember, EventItem, EventMember, Role, TeamArea } from '@/types'
import {
  Avatar,
  Chip,
  EmptyState,
  MEMBER_STATUS,
  SectionCard,
  TEAM_AREAS,
  areaLabel,
  churchMemberName,
  eventMemberName,
  memberArea,
} from './shared'

interface TeamTabProps {
  event: EventItem
  members: EventMember[]
  churchMembers: ChurchMember[]
  roles: Role[]
  currentMemberId?: string
  canEdit: boolean
  reload: () => Promise<void>
}

export function TeamTab({
  event,
  members,
  churchMembers,
  roles,
  currentMemberId,
  canEdit,
  reload,
}: TeamTabProps) {
  const { toast } = useToast()
  const [addArea, setAddArea] = useState<TeamArea | null>(null)
  const [toRemove, setToRemove] = useState<EventMember | null>(null)
  const [toDecline, setToDecline] = useState<EventMember | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const confirm = async (scale: EventMember) => {
    setBusyId(scale.id)
    try {
      await pb.collection('event_members').update(scale.id, {
        status: 'CONFIRMADO',
        response_at: new Date().toISOString(),
      })
      toast({ title: 'Presença confirmada!' })
      await reload()
    } catch (err: any) {
      toast({
        title: 'Não foi possível confirmar',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (scale: EventMember) => {
    await pb.collection('event_members').delete(scale.id)
    toast({ title: `${eventMemberName(scale)} saiu da escala` })
    await reload()
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="flex justify-end">
          <Button
            onClick={() => setAddArea('LOUVOR')}
            className="gap-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            Escalar pessoa
          </Button>
        </div>
      )}

      {members.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={Users}
            title="Ninguém escalado ainda"
            description="Escale o louvor e as equipes técnicas deste culto."
          />
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {TEAM_AREAS.map(({ value, label, icon: Icon }) => {
          const areaMembers = members.filter((m) => memberArea(m) === value)
          if (members.length === 0 || (areaMembers.length === 0 && !canEdit)) return null
          const confirmed = areaMembers.filter((m) => m.status === 'CONFIRMADO').length
          return (
            <SectionCard
              key={value}
              title={
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 text-slate-500" />
                  {label}
                </span>
              }
              subtitle={
                areaMembers.length
                  ? `${confirmed} de ${areaMembers.length} ${areaMembers.length === 1 ? 'confirmado' : 'confirmados'}`
                  : 'Ninguém escalado'
              }
              actions={
                canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAddArea(value)}
                    className="h-7 gap-1 text-xs font-semibold text-teal-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Escalar
                  </Button>
                )
              }
            >
              <ul className="divide-y divide-slate-100">
                {areaMembers.map((scale) => {
                  const name = eventMemberName(scale)
                  const role = scale.expand?.role_id
                  const status = MEMBER_STATUS[scale.status] || MEMBER_STATUS.PENDENTE
                  const isMe = currentMemberId && scale.member_id === currentMemberId
                  const canRespond = scale.status === 'PENDENTE' && (isMe || canEdit)
                  return (
                    <li key={scale.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar name={name} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {name}
                            {isMe && (
                              <span className="ml-1.5 text-xs font-normal text-slate-500">
                                (você)
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {[role?.name, scale.notes].filter(Boolean).join(' · ') ||
                              areaLabel(value)}
                          </div>
                        </div>
                        <Chip tone={status.tone}>{status.label}</Chip>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setToRemove(scale)}
                            aria-label={`Tirar ${name} da escala`}
                            title="Tirar da escala"
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {scale.status === 'RECUSADO' && scale.decline_reason && (
                        <p className="ml-12 mt-1.5 text-xs italic text-red-600">
                          Motivo: "{scale.decline_reason}"
                        </p>
                      )}
                      {canRespond && (
                        <div className="ml-12 mt-2 flex gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === scale.id}
                            onClick={() => confirm(scale)}
                            className="h-8 gap-1 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
                          >
                            {busyId === scale.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setToDecline(scale)}
                            className="h-8 rounded-lg px-3 text-xs font-semibold"
                          >
                            Não posso
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
                {areaMembers.length === 0 && (
                  <li className="px-5 py-4 text-sm text-slate-400">Ninguém nesta área ainda.</li>
                )}
              </ul>
            </SectionCard>
          )
        })}
      </div>

      <AddMemberDialog
        area={addArea}
        onClose={() => setAddArea(null)}
        event={event}
        members={members}
        churchMembers={churchMembers}
        roles={roles}
        onSaved={reload}
      />
      <DeclineDialog scale={toDecline} onClose={() => setToDecline(null)} onSaved={reload} />
      <ConfirmDialog
        open={Boolean(toRemove)}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={`Tirar ${toRemove ? eventMemberName(toRemove) : ''} da escala?`}
        description="A pessoa deixa de aparecer neste culto. Você pode escalá-la de novo depois."
        confirmLabel="Tirar da escala"
        destructive
        onConfirm={() => toRemove && remove(toRemove)}
      />
    </div>
  )
}

function AddMemberDialog({
  area,
  onClose,
  event,
  members,
  churchMembers,
  roles,
  onSaved,
}: {
  area: TeamArea | null
  onClose: () => void
  event: EventItem
  members: EventMember[]
  churchMembers: ChurchMember[]
  roles: Role[]
  onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [teamArea, setTeamArea] = useState<TeamArea>('LOUVOR')
  const [memberId, setMemberId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    if (!area) return
    setTeamArea(area)
    setMemberId('')
    setRoleId('')
    setNotes('')
  }, [area])

  const alreadyInArea = new Set(
    members.filter((m) => memberArea(m) === teamArea).map((m) => m.member_id),
  )
  const options = churchMembers
    .filter((m) => !alreadyInArea.has(m.id))
    .sort((a, b) => churchMemberName(a).localeCompare(churchMemberName(b)))

  const save = async () => {
    if (!memberId) return
    setSaving(true)
    try {
      await pb.collection('event_members').create({
        church_id: event.church_id,
        event_id: event.id,
        member_id: memberId,
        role_id: roleId || roles[0]?.id || '',
        team_area: teamArea,
        status: 'PENDENTE',
        notes: notes || null,
      })
      toast({
        title: 'Pessoa escalada',
        description: `Adicionada à equipe de ${areaLabel(teamArea)}.`,
      })
      onClose()
      await onSaved()
    } catch (err: any) {
      toast({
        title: 'Não foi possível escalar',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={Boolean(area)} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escalar pessoa</DialogTitle>
          <DialogDescription>
            A pessoa recebe o pedido e confirma se pode participar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Área</Label>
            <Select value={teamArea} onValueChange={(v) => setTeamArea(v as TeamArea)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_AREAS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pessoa</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha quem vai servir" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {options.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {churchMemberName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Função ou instrumento</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Ex: Violão, Vocal, Mesa de som" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scale-notes">Observação</Label>
            <Input
              id="scale-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: chegar às 16h"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={!memberId || saving}
            className="bg-teal-700 text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Escalar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeclineDialog({
  scale,
  onClose,
  onSaved,
}: {
  scale: EventMember | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    if (scale) setReason('')
  }, [scale])

  const save = async () => {
    if (!scale) return
    setSaving(true)
    try {
      await pb.collection('event_members').update(scale.id, {
        status: 'RECUSADO',
        response_at: new Date().toISOString(),
        decline_reason: reason || 'Sem motivo informado',
      })
      toast({ title: 'Resposta registrada', description: 'O líder vai ver que você não pode.' })
      onClose()
      await onSaved()
    } catch (err: any) {
      toast({
        title: 'Não foi possível registrar',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={Boolean(scale)} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Não posso participar</DialogTitle>
          <DialogDescription>Conte o motivo para o líder achar um substituto.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: viagem, compromisso de trabalho…"
          className="min-h-[90px]"
          aria-label="Motivo da ausência"
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Voltar
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirmar recusa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
