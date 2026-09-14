import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { EventItem } from '@/types'
import {
  CalendarDays,
  Plus,
  Clock,
  Calendar,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit,
  Users,
  Music2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'

export default function EventsList() {
  const { currentChurch, canManageContent } = useAuth()
  const { toast } = useToast()

  const [events, setEvents] = useState<EventItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showPastEvents, setShowPastEvents] = useState(false)

  const fetchEvents = async () => {
    if (!currentChurch) return
    setIsLoading(true)
    try {
      const records = await pb.collection('events').getFullList<EventItem>({
        filter: `church_id = "${currentChurch.id}"`,
        sort: 'date',
      })
      setEvents(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar cultos',
        description: 'Não foi possível carregar a lista de eventos.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [currentChurch])

  const handleDeleteEvent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (
      !window.confirm(
        'Tem certeza que deseja excluir este culto/evento e todas as suas escalas associadas?',
      )
    )
      return

    try {
      await pb.collection('events').delete(id)
      toast({
        title: 'Evento excluído',
        description: 'O evento e repertório foram removidos com sucesso.',
      })
      setEvents((prev) => prev.filter((ev) => ev.id !== id))
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o evento.',
        variant: 'destructive',
      })
    }
  }

  const now = new Date()
  const upcomingEvents: EventItem[] = []
  const pastEvents: EventItem[] = []

  events.forEach((ev) => {
    const evDate = new Date(ev.date)
    // Se a data for anterior a ontem, consideramos passado
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)

    if (evDate < yesterday || ev.status === 'Realizado') {
      pastEvents.push(ev)
    } else {
      upcomingEvents.push(ev)
    }
  })

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'Confirmado':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'Planejado':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'Realizado':
        return 'bg-slate-100 text-slate-700 border-slate-200'
      case 'Cancelado':
        return 'bg-red-100 text-red-700 border-red-200'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Eventos & Cultos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Agenda litúrgica, escalas ministeriais e repertórios da {currentChurch?.name}
          </p>
        </div>

        {canManageContent && (
          <Link to="/events/new">
            <Button className="h-10 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Novo Evento
            </Button>
          </Link>
        )}
      </div>

      {/* Próximos Eventos */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Próximos Cultos & Ensaios ({upcomingEvents.length})
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-10 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-400" />
            <h3 className="mt-3 text-base font-bold text-slate-800">
              Nenhum culto futuro agendado
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Crie o próximo culto dominical ou ensaio de louvor da igreja.
            </p>
            {canManageContent && (
              <Link to="/events/new" className="mt-4 inline-block">
                <Button className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs">
                  Agendar Culto
                </Button>
              </Link>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {upcomingEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => (window.location.href = `/events/${ev.id}/escala`)}
                className="group bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:border-teal-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  <div className="h-14 w-14 rounded-xl bg-teal-50 text-teal-800 font-bold flex flex-col items-center justify-center shrink-0 border border-teal-100 group-hover:bg-teal-700 group-hover:text-white transition-colors">
                    <CalendarDays className="h-5 w-5 mb-0.5" />
                    <span className="text-[10px] uppercase font-bold tracking-tight">CULT</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-teal-800 transition-colors truncate">
                        {ev.title}
                      </h3>
                      <Badge
                        className={`text-[10px] font-semibold border ${statusBadgeColor(ev.status)}`}
                      >
                        {ev.status}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <Calendar className="h-3.5 w-3.5 text-teal-700" />
                        {formatDateDisplay(ev.date)}
                      </span>
                      {ev.start_time && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {ev.start_time}
                          {ev.end_time ? ` às ${ev.end_time}` : ''}
                        </span>
                      )}
                    </p>

                    {ev.description && (
                      <p className="text-xs text-slate-400 line-clamp-1 mt-1">{ev.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Link to={`/events/${ev.id}/escala`} onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold gap-1.5 shadow-sm"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Escala & Repertório
                    </Button>
                  </Link>

                  {canManageContent && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Opções do evento"
                          className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-lg"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            window.location.href = `/events/${ev.id}/edit`
                          }}
                          className="gap-2 text-xs"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Editar Detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDeleteEvent(ev.id, e)}
                          className="gap-2 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir Culto
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eventos Anteriores (Colapsável) */}
      {pastEvents.length > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <Button
            variant="ghost"
            onClick={() => setShowPastEvents(!showPastEvents)}
            className="w-full flex items-center justify-between text-slate-500 hover:text-slate-800 p-2 text-xs font-semibold"
          >
            <span>Cultos Anteriores ({pastEvents.length})</span>
            {showPastEvents ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {showPastEvents && (
            <div className="grid grid-cols-1 gap-2.5 mt-3">
              {pastEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => (window.location.href = `/events/${ev.id}/escala`)}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700 truncate">
                        {ev.title}
                      </span>
                      <Badge variant="outline" className="text-[10px] text-slate-500">
                        {ev.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDateDisplay(ev.date)} {ev.start_time ? `• ${ev.start_time}` : ''}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
