import React, { useState } from 'react'
import { ListTodo, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { cn } from '@/lib/utils'
import { formatCalendarDateDisplay } from '@/lib/dateUtils'
import { deleteTask, saveEventTask, updateTaskStatus } from '@/services/tasks'
import type { ChurchMember, EventItem, EventTask, TaskPriority, TeamArea } from '@/types'
import type { EventCenter } from './useEventCenter'
import {
  Chip,
  EmptyState,
  SectionCard,
  TASK_PRIORITY,
  TEAM_AREAS,
  areaLabel,
  churchMemberName,
} from './shared'

interface TasksTabProps {
  event: EventItem
  tasks: EventTask[]
  churchMembers: ChurchMember[]
  /** Áreas que a pessoa enxerga; null = todas. */
  allowedAreas: TeamArea[] | null
  initialArea?: TeamArea | null
  canCreate: boolean
  canDelete: boolean
  patch: EventCenter['patch']
  reload: () => Promise<void>
}

export function TasksTab({
  event,
  tasks,
  churchMembers,
  allowedAreas,
  initialArea,
  canCreate,
  canDelete,
  patch,
  reload,
}: TasksTabProps) {
  const { toast } = useToast()
  const [area, setArea] = useState<TeamArea | 'ALL'>(initialArea || 'ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<EventTask | null>(null)

  const areas = TEAM_AREAS.filter((a) => !allowedAreas || allowedAreas.includes(a.value))
  const visible = tasks
    .filter((t) => !allowedAreas || allowedAreas.includes(t.team_area))
    .filter((t) => area === 'ALL' || t.team_area === area)
  const open = visible.filter((t) => t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA')
  const done = visible.filter((t) => t.status === 'CONCLUIDA')

  const toggle = async (task: EventTask) => {
    const status = task.status === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA'
    patch((prev) => ({ tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) }))
    try {
      await updateTaskStatus(task.id, event.church_id, status)
    } catch (err: any) {
      toast({
        title: 'Não foi possível atualizar a tarefa',
        description: err?.message,
        variant: 'destructive',
      })
      reload()
    }
  }

  const remove = async (task: EventTask) => {
    await deleteTask(task.id)
    toast({ title: 'Tarefa excluída' })
    await reload()
  }

  const renderTask = (task: EventTask) => {
    const isDone = task.status === 'CONCLUIDA'
    const priority = TASK_PRIORITY[task.priority]
    return (
      <li key={task.id} className="flex items-start gap-3 px-5 py-3">
        <Checkbox
          checked={isDone}
          onCheckedChange={() => toggle(task)}
          aria-label={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
          className="mt-0.5 h-[18px] w-[18px] rounded-[5px] data-[state=checked]:border-teal-700 data-[state=checked]:bg-teal-700"
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'text-sm font-medium',
              isDone ? 'text-slate-400 line-through' : 'text-slate-900',
            )}
          >
            {task.title}
          </div>
          {task.description && !isDone && (
            <p className="mt-0.5 text-xs text-slate-500">{task.description}</p>
          )}
          <div className="mt-0.5 text-xs text-slate-500">
            {[
              areaLabel(task.team_area),
              task.assigned_user?.name || 'Sem responsável',
              task.due_date ? `até ${formatCalendarDateDisplay(task.due_date, 'numeric')}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        {!isDone && (task.priority === 'ALTA' || task.priority === 'URGENTE') && (
          <Chip tone={priority.tone}>{priority.label}</Chip>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setToDelete(task)}
            aria-label={`Excluir tarefa ${task.title}`}
            title="Excluir tarefa"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {areas.length > 1 && (
          <FilterChip active={area === 'ALL'} onClick={() => setArea('ALL')}>
            Todas
          </FilterChip>
        )}
        {areas.map((a) => (
          <FilterChip key={a.value} active={area === a.value} onClick={() => setArea(a.value)}>
            {a.label}
          </FilterChip>
        ))}
        {canCreate && (
          <Button
            onClick={() => setDialogOpen(true)}
            className="ml-auto gap-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            Nova tarefa
          </Button>
        )}
      </div>

      <SectionCard title="A fazer" subtitle={open.length ? String(open.length) : undefined}>
        {open.length === 0 ? (
          visible.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="Nenhuma tarefa"
              description="Crie checklists para louvor, som, projeção, mídia ou iluminação."
            />
          ) : (
            <p className="px-5 py-4 text-sm text-slate-500">Tudo feito por aqui.</p>
          )
        ) : (
          <ul className="divide-y divide-slate-100">{open.map(renderTask)}</ul>
        )}
      </SectionCard>

      {done.length > 0 && (
        <SectionCard title="Concluídas" subtitle={String(done.length)}>
          <ul className="divide-y divide-slate-100">{done.map(renderTask)}</ul>
        </SectionCard>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={event}
        defaultArea={area === 'ALL' ? areas[0]?.value || 'LOUVOR' : area}
        areas={areas.map((a) => a.value)}
        churchMembers={churchMembers}
        onSaved={reload}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir esta tarefa?"
        description={toDelete?.title}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => toDelete && remove(toDelete)}
      />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-slate-900 text-white'
          : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}

const NO_ASSIGNEE = '__none__'

function TaskDialog({
  open,
  onOpenChange,
  event,
  defaultArea,
  areas,
  churchMembers,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: EventItem
  defaultArea: TeamArea
  areas: TeamArea[]
  churchMembers: ChurchMember[]
  onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [area, setArea] = useState<TeamArea>(defaultArea)
  const [assignee, setAssignee] = useState(NO_ASSIGNEE)
  const [priority, setPriority] = useState<TaskPriority>('NORMAL')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setArea(defaultArea)
    setAssignee(NO_ASSIGNEE)
    setPriority('NORMAL')
    setDueDate('')
  }, [open, defaultArea])

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await saveEventTask({
        church_id: event.church_id,
        event_id: event.id,
        title: title.trim(),
        description,
        team_area: area,
        assigned_to: assignee === NO_ASSIGNEE ? null : assignee,
        priority,
        due_date: dueDate || null,
        status: 'PENDENTE',
      })
      toast({ title: 'Tarefa criada' })
      onOpenChange(false)
      await onSaved()
    } catch (err: any) {
      toast({
        title: 'Não foi possível criar a tarefa',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>Algo que precisa estar pronto antes do culto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">O que fazer</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Testar pilhas dos microfones sem fio"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select value={area} onValueChange={(v) => setArea(v as TeamArea)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a} value={a}>
                      {areaLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_PRIORITY).map(([value, p]) => (
                    <SelectItem key={value} value={value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
                  {churchMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {churchMemberName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Prazo</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Detalhes</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[70px]"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={!title.trim() || saving}
            className="bg-teal-700 text-white hover:bg-teal-800"
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
