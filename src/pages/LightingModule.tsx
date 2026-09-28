import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sun, ArrowLeft, CalendarDays, Clock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { EventItem, EventTask, EventMember } from '@/types'
import { listEventTasks, updateTaskStatus } from '@/services/tasks'
import { useToast } from '@/hooks/use-toast'

export default function LightingModule() {
  const { currentChurch, currentMember } = useAuth()
  const { toast } = useToast()
  const [backendAllowed, setBackendAllowed] = useState<boolean | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null)
  const [myScale, setMyScale] = useState<EventMember | null>(null)
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadData = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const evs = await pb.collection('events').getFullList<EventItem>({
        filter: `church_id = "${currentChurch.id}" && date >= "${today}"`,
        sort: 'date',
        batch: 1,
      })

      if (evs.length > 0) {
        const ev = evs[0]
        setNextEvent(ev)

        if (currentMember) {
          const scales = await pb.collection('event_members').getFullList<EventMember>({
            filter: `event_id = "${ev.id}" && member_id = "${currentMember.id}"`,
            batch: 1,
          })
          if (scales.length > 0) setMyScale(scales[0])
        }

        const tList = await listEventTasks(currentChurch.id, ev.id, 'ILUMINACAO')
        setTasks(tList)
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const churchId = currentChurch?.id || ''
        const res = await pb.send<{ allowed: boolean; message?: string }>(
          `/backend/v1/modules/access?module=lighting&church_id=${churchId}`,
          { method: 'GET' },
        )
        setBackendAllowed(res.allowed)
        if (res.allowed) {
          loadData()
        }
      } catch (err: any) {
        setBackendAllowed(false)
        setErrorMsg(err.data?.message || err.message || 'Acesso negado pelo backend')
        setIsLoading(false)
      }
    }
    checkBackend()
  }, [currentChurch?.id])

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

  const handleToggleTask = async (task: EventTask) => {
    if (!currentChurch) return
    const next = task.status === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA'
    try {
      await updateTaskStatus(task.id, currentChurch.id, next)
      toast({ title: next === 'CONCLUIDA' ? 'Tarefa concluída!' : 'Tarefa reaberta' })
      if (nextEvent) {
        const list = await listEventTasks(currentChurch.id, nextEvent.id, 'ILUMINACAO')
        setTasks(list)
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Início
        </Link>
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          Módulo Técnico • Iluminação Cênica
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Sun className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Operação de Iluminação
          </h1>
          <p className="text-sm text-slate-500">
            Painel da equipe de iluminação, cenas e momentos litúrgicos de{' '}
            <strong>{currentChurch?.name}</strong>.
          </p>
        </div>
      </div>

      {nextEvent ? (
        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200 p-5 bg-white shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                  Próximo Culto
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{nextEvent.title}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <CalendarDays className="h-3.5 w-3.5 text-amber-600" />
                    {nextEvent.date.slice(0, 10)}
                  </span>
                  {nextEvent.start_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {nextEvent.start_time}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {myScale ? (
                  <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                    Você está escalado ({myScale.status})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Não escalado
                  </Badge>
                )}
                <Link to={`/events/${nextEvent.id}/escala?tab=iluminacao`}>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs"
                  >
                    Abrir no Culto
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* Tarefas de Iluminação */}
          <Card className="rounded-2xl border-slate-200 shadow-xs">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                Checklist de Cenas & Iluminação ({tasks.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Ajuste de refletores, lâmpadas, presets e momentos de oração e pregação
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {tasks.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Nenhuma tarefa de iluminação registrada para este culto.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={t.status === 'CONCLUIDA'}
                          onChange={() => handleToggleTask(t)}
                          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <div>
                          <p
                            className={`text-sm font-semibold ${
                              t.status === 'CONCLUIDA'
                                ? 'line-through text-slate-400'
                                : 'text-slate-900'
                            }`}
                          >
                            {t.title}
                          </p>
                          {t.description && (
                            <p className="text-xs text-slate-500">{t.description}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="rounded-2xl border-slate-200 p-8 text-center text-slate-400">
          Nenhum culto agendado no momento.
        </Card>
      )}
    </div>
  )
}
