import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, ArrowLeft, Plus, Check, Trash2, CalendarDays, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import type { EventTask, EventItem, ChurchMember, TeamArea, TaskPriority } from '@/types'
import { listEventTasks, saveEventTask, updateTaskStatus, deleteTask } from '@/services/tasks'

export default function TasksModule() {
  const { currentChurch, currentMember, isAdmin, isLeader, isMaster } = useAuth()
  const { toast } = useToast()

  const [backendAllowed, setBackendAllowed] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [members, setMembers] = useState<ChurchMember[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  // Modal nova tarefa
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskArea, setTaskArea] = useState<TeamArea>('LOUVOR')
  const [taskEventTarget, setTaskEventTarget] = useState('')
  const [taskAssignedTo, setTaskAssignedTo] = useState('')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('NORMAL')
  const [taskDueDate, setTaskDueDate] = useState('')

  const loadInitialData = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const evs = await pb.collection('events').getFullList<EventItem>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: '-date',
      })
      setEvents(evs)
      if (evs.length > 0 && !selectedEventId) {
        setSelectedEventId(evs[0].id)
        setTaskEventTarget(evs[0].id)
      }

      const membs = await pb.collection('church_members').getFullList<ChurchMember>({
        filter: `church_id = "${currentChurch.id}" && is_active = true`,
        expand: 'user_id',
      })
      setMembers(membs)
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadTasks = async (evId: string, area?: string) => {
    if (!currentChurch || !evId) return
    try {
      const list = await listEventTasks(currentChurch.id, evId, area || undefined)
      setTasks(list)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const churchId = currentChurch?.id || ''
        const res = await pb.send<{ allowed: boolean; message?: string }>(
          `/backend/v1/modules/access?module=tasks&church_id=${churchId}`,
          { method: 'GET' },
        )
        setBackendAllowed(res.allowed)
        if (res.allowed) {
          loadInitialData()
        }
      } catch (err: any) {
        setBackendAllowed(false)
        setErrorMsg(err.data?.message || err.message || 'Acesso negado pelo backend')
        setIsLoading(false)
      }
    }
    checkBackend()
  }, [currentChurch?.id])

  useEffect(() => {
    if (selectedEventId) {
      loadTasks(selectedEventId, selectedAreaFilter)
    }
  }, [selectedEventId, selectedAreaFilter])

  if (backendAllowed === false) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-red-600">Acesso Bloqueado pelo Servidor</h2>
        <p className="text-sm text-slate-600">{errorMsg}</p>
        <Link to="/dashboard">
          <Button variant="outline">Voltar ao Início</Button>
        </Link>
      </div>
    )
  }

  const handleCreate = async () => {
    if (!taskTitle || !taskEventTarget || !currentChurch) return
    try {
      await saveEventTask({
        church_id: currentChurch.id,
        event_id: taskEventTarget,
        title: taskTitle,
        description: taskDesc,
        team_area: taskArea,
        assigned_to: taskAssignedTo || null,
        priority: taskPriority,
        due_date: taskDueDate || null,
        status: 'PENDENTE',
      })
      toast({ title: 'Tarefa criada com sucesso!' })
      setTaskModalOpen(false)
      setTaskTitle('')
      setTaskDesc('')
      setTaskAssignedTo('')
      loadTasks(selectedEventId, selectedAreaFilter)
    } catch (err: any) {
      toast({
        title: 'Erro ao criar',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleToggle = async (task: EventTask) => {
    if (!currentChurch) return
    const next = task.status === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA'
    try {
      await updateTaskStatus(task.id, currentChurch.id, next)
      toast({ title: next === 'CONCLUIDA' ? 'Tarefa concluída!' : 'Tarefa reaberta' })
      loadTasks(selectedEventId, selectedAreaFilter)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (taskId: string) => {
    if (!window.confirm('Excluir esta tarefa?')) return
    try {
      await deleteTask(taskId)
      toast({ title: 'Tarefa excluída' })
      loadTasks(selectedEventId, selectedAreaFilter)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Início
        </Link>
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
          Módulo Operacional • Tarefas & Checklist
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <CheckSquare className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Tarefas & Checklist Litúrgico
            </h1>
            <p className="text-sm text-slate-500">
              Demandas operacionais organizadas por culto e por equipe de{' '}
              <strong>{currentChurch?.name}</strong>.
            </p>
          </div>
        </div>

        <Button
          onClick={() => setTaskModalOpen(true)}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm gap-2"
        >
          <Plus className="h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      {/* Filtros de Evento e Área */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
        <div className="w-full sm:w-1/2 space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Filtrar por Culto / Evento</Label>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Selecione um culto..." />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.title} ({ev.date.slice(0, 10)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-1/2 space-y-1">
          <Label className="text-xs font-semibold text-slate-600">Filtrar por Área</Label>
          <Select
            value={selectedAreaFilter || 'TODAS'}
            onValueChange={(val) => setSelectedAreaFilter(val === 'TODAS' ? '' : val)}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas as Áreas</SelectItem>
              <SelectItem value="LOUVOR">LOUVOR</SelectItem>
              <SelectItem value="SOM">SOM</SelectItem>
              <SelectItem value="PROJECAO">PROJEÇÃO</SelectItem>
              <SelectItem value="MIDIA">MÍDIA</SelectItem>
              <SelectItem value="ILUMINACAO">ILUMINAÇÃO</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Card da Lista */}
      <Card className="rounded-2xl border-slate-200 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Tarefas do Evento ({tasks.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {tasks.filter((t) => t.status === 'CONCLUIDA').length} de {tasks.length} concluídas
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-xs text-slate-400 py-8 text-center">Carregando tarefas...</p>
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CheckSquare className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm font-semibold text-slate-700">Nenhuma tarefa encontrada</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Crie demandas para testes de cabos, subida de slides, pilhas ou ensaio.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={task.status === 'CONCLUIDA'}
                      onChange={() => handleToggle(task)}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-sm font-bold truncate ${
                            task.status === 'CONCLUIDA'
                              ? 'line-through text-slate-400'
                              : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          Área: {task.team_area}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${
                            task.priority === 'URGENTE'
                              ? 'bg-red-100 text-red-800'
                              : task.priority === 'ALTA'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {task.priority}
                        </Badge>
                      </div>

                      {task.description && (
                        <p className="text-xs text-slate-500 mb-1">{task.description}</p>
                      )}

                      <p className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                        <span>
                          Responsável:{' '}
                          <strong className="text-slate-600">
                            {task.assigned_user?.name || 'Não atribuído'}
                          </strong>
                        </span>
                        {task.due_date && <span>Prazo: {task.due_date.slice(0, 10)}</span>}
                        {task.completed_at && (
                          <span className="text-emerald-600">
                            Concluída em {task.completed_at.slice(0, 10)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      className={`text-xs ${
                        task.status === 'CONCLUIDA'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {task.status}
                    </Badge>

                    {(isAdmin || isMaster) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(task.id)}
                        className="h-8 w-8 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Nova Tarefa */}
      <Dialog open={taskModalOpen} onOpenChange={setTaskModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Nova Tarefa</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Adicione uma tarefa operacional ao evento selecionado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Culto Alvo</Label>
              <Select value={taskEventTarget} onValueChange={setTaskEventTarget}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione o culto..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.title} ({ev.date.slice(0, 10)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Título da Tarefa</Label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ex: Passar som com o vocal principal"
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Área</Label>
                <Select value={taskArea} onValueChange={(val) => setTaskArea(val as TeamArea)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOUVOR">LOUVOR</SelectItem>
                    <SelectItem value="SOM">SOM</SelectItem>
                    <SelectItem value="PROJECAO">PROJEÇÃO</SelectItem>
                    <SelectItem value="MIDIA">MÍDIA</SelectItem>
                    <SelectItem value="ILUMINACAO">ILUMINAÇÃO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Prioridade</Label>
                <Select
                  value={taskPriority}
                  onValueChange={(val) => setTaskPriority(val as TaskPriority)}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA">BAIXA</SelectItem>
                    <SelectItem value="NORMAL">NORMAL</SelectItem>
                    <SelectItem value="ALTA">ALTA</SelectItem>
                    <SelectItem value="URGENTE">URGENTE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Responsável</Label>
              <Select value={taskAssignedTo} onValueChange={setTaskAssignedTo}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Atribuir a..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="">Sem responsável</SelectItem>
                  {members.map((m) => {
                    const u = m.expand?.user_id
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {u?.name || 'Membro'}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Descrição</Label>
              <Textarea
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="Instruções adicionais..."
                className="rounded-xl min-h-[70px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!taskTitle || !taskEventTarget}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              Criar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
