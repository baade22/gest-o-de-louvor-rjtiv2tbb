import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { EventItem, EventMember, Song } from '@/types'
import {
  CalendarDays,
  Music2,
  Users,
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Send,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default function Dashboard() {
  const { currentChurch, currentMember, user, isAdmin, isLeader } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSongs: 0,
    scheduledMusicians: 0,
    pendingConfirmations: 0,
    upcomingEventsCount: 0,
  })
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null)
  const [myUpcomingScales, setMyUpcomingScales] = useState<EventMember[]>([])
  const [recentActivities, setRecentActivities] = useState<EventMember[]>([])

  // Modal recusa
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [selectedScaleToDecline, setSelectedScaleToDecline] = useState<EventMember | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [isUpdatingScale, setIsUpdatingScale] = useState(false)

  const fetchDashboardData = async () => {
    if (!currentChurch) return
    setIsLoading(true)

    try {
      // 1. Total de músicas
      const songsRes = await pb.collection('songs').getList(1, 1, {
        filter: `church_id = "${currentChurch.id}"`,
      })

      // 2. Eventos futuros
      const now = new Date().toISOString()
      const eventsRes = await pb.collection('events').getList<EventItem>(1, 5, {
        filter: `church_id = "${currentChurch.id}"`,
        sort: 'date',
      })

      const upcoming = eventsRes.items.filter((e) => e.status !== 'Cancelado')
      const firstUpcoming = upcoming[0] || null
      setNextEvent(firstUpcoming)

      // 3. Se houver próximo evento, pega contagem de músicos e confirmações pendentes
      let totalMembersScheduled = 0
      let pendingCount = 0

      if (firstUpcoming) {
        const membersList = await pb.collection('event_members').getFullList<EventMember>({
          filter: `church_id = "${currentChurch.id}" && event_id = "${firstUpcoming.id}"`,
        })
        totalMembersScheduled = membersList.length
        pendingCount = membersList.filter((m) => m.status === 'PENDENTE').length
      }

      setStats({
        totalSongs: songsRes.totalItems,
        scheduledMusicians: totalMembersScheduled,
        pendingConfirmations: pendingCount,
        upcomingEventsCount: upcoming.length,
      })

      // 4. Próximas escalas do usuário logado
      if (currentMember) {
        const myScales = await pb.collection('event_members').getList<EventMember>(1, 5, {
          filter: `church_id = "${currentChurch.id}" && member_id = "${currentMember.id}"`,
          expand: 'event_id,role_id',
          sort: '-created',
        })
        setMyUpcomingScales(myScales.items)
      }

      // 5. Atividades recentes (últimas confirmações ou escalas na igreja)
      const activities = await pb.collection('event_members').getList<EventMember>(1, 5, {
        filter: `church_id = "${currentChurch.id}"`,
        expand: 'event_id,member_id.user_id,role_id',
        sort: '-updated',
      })
      setRecentActivities(activities.items)
    } catch (err) {
      console.error('Erro ao carregar dados do Dashboard:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [currentChurch, currentMember])

  const handleConfirmScale = async (scaleId: string) => {
    try {
      setIsUpdatingScale(true)
      await pb.collection('event_members').update(scaleId, {
        status: 'CONFIRMADO',
        response_at: new Date().toISOString(),
      })
      toast({
        title: 'Escala confirmada!',
        description: 'Sua presença no culto foi confirmada com sucesso.',
      })
      fetchDashboardData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao confirmar',
        description: 'Não foi possível registrar sua confirmação.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdatingScale(false)
    }
  }

  const handleOpenDeclineModal = (scale: EventMember) => {
    setSelectedScaleToDecline(scale)
    setDeclineReason('')
    setDeclineModalOpen(true)
  }

  const handleConfirmDecline = async () => {
    if (!selectedScaleToDecline) return
    try {
      setIsUpdatingScale(true)
      await pb.collection('event_members').update(selectedScaleToDecline.id, {
        status: 'RECUSADO',
        response_at: new Date().toISOString(),
        decline_reason: declineReason || 'Sem motivo informado',
      })
      toast({
        title: 'Escala recusada',
        description: 'Sua resposta foi registrada e o líder informado.',
      })
      setDeclineModalOpen(false)
      fetchDashboardData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao recusar',
        description: 'Não foi possível registrar a recusa.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdatingScale(false)
    }
  }

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

  const todayDisplay = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="space-y-8">
      {/* Header com boas-vindas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
            <Sparkles className="h-4 w-4" />
            <span>{todayDisplay}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Olá, {user?.name?.split(' ')[0] || 'Músico'}! 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Bem-vindo ao painel da {currentChurch?.name || 'sua igreja'}.
          </p>
        </div>

        {(isAdmin || isLeader) && (
          <div className="flex items-center gap-2">
            <Link to="/events/new">
              <Button className="h-10 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs sm:text-sm gap-2 shadow-sm">
                <Calendar className="h-4 w-4" />
                Novo Culto / Evento
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Próximo Evento em Destaque */}
      {isLoading ? (
        <Skeleton className="h-44 w-full rounded-2xl" />
      ) : nextEvent ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-800 via-teal-700 to-slate-900 text-white p-6 sm:p-8 shadow-xl">
          <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 backdrop-blur-xs border border-teal-400/30">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Próximo Culto Programado</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {nextEvent.title}
              </h2>
              <p className="text-sm text-teal-100/80 line-clamp-2">
                {nextEvent.description || 'Culto de louvor e adoração congregacional.'}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-teal-100 pt-2">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-teal-300" />
                  <span>{formatDateDisplay(nextEvent.date)}</span>
                </div>
                {nextEvent.start_time && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-teal-300" />
                    <span>
                      {nextEvent.start_time}
                      {nextEvent.end_time ? ` às ${nextEvent.end_time}` : ''}
                    </span>
                  </div>
                )}
                <Badge variant="outline" className="border-teal-400/40 text-teal-200">
                  {nextEvent.status}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link to={`/events/${nextEvent.id}/escala`}>
                <Button className="h-11 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-2 shadow-lg shadow-violet-900/30 hover:scale-105 transition-transform">
                  Ver Escala & Repertório
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 bg-white/50 p-8 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">
            Nenhum evento futuro agendado
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Crie novos cultos e ensaios para montar repertórios e escalar sua equipe.
          </p>
          {(isAdmin || isLeader) && (
            <Link to="/events/new" className="mt-4 inline-block">
              <Button size="sm" className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white">
                Criar Primeiro Evento
              </Button>
            </Link>
          )}
        </Card>
      )}

      {/* Row de 4 estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Músicas */}
        <Card className="rounded-2xl border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Total de Músicas</p>
              <h4 className="text-2xl font-extrabold text-slate-900 mt-1">
                {isLoading ? <Skeleton className="h-8 w-12" /> : stats.totalSongs}
              </h4>
              <p className="text-[11px] text-teal-700 font-medium mt-1">Acervo cadastrado</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
              <Music2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Músicos Escalados */}
        <Card className="rounded-2xl border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Músicos no Próx. Culto</p>
              <h4 className="text-2xl font-extrabold text-slate-900 mt-1">
                {isLoading ? <Skeleton className="h-8 w-12" /> : stats.scheduledMusicians}
              </h4>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Instrumentos / voz</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center text-violet-700 shrink-0">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Confirmações Pendentes */}
        <Card className="rounded-2xl border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Confirmações Pendentes</p>
              <h4 className="text-2xl font-extrabold text-amber-600 mt-1">
                {isLoading ? <Skeleton className="h-8 w-12" /> : stats.pendingConfirmations}
              </h4>
              <p className="text-[11px] text-amber-600 font-medium mt-1">Aguardando resposta</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <AlertCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Próximos Eventos */}
        <Card className="rounded-2xl border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Próximos Cultos</p>
              <h4 className="text-2xl font-extrabold text-slate-900 mt-1">
                {isLoading ? <Skeleton className="h-8 w-12" /> : stats.upcomingEventsCount}
              </h4>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Planejados na agenda</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
              <CalendarDays className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid com Minhas Escalas e Notificações Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Minhas Próximas Escalas */}
        <Card className="rounded-2xl border-slate-200 shadow-xs flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Minhas Próximas Escalas
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Escalas designadas para você neste ministério
              </CardDescription>
            </div>
            <Link to="/minhas-escalas">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50"
              >
                Ver todas <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 flex-1">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : myUpcomingScales.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <CheckCircle2 className="mx-auto h-8 w-8 text-teal-600/60 mb-2" />
                <p className="text-sm font-semibold text-slate-700">Nenhuma escala pendente</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Você não possui escalas ativas no momento.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {myUpcomingScales.map((scale) => {
                  const ev = scale.expand?.event_id
                  const ro = scale.expand?.role_id
                  return (
                    <div
                      key={scale.id}
                      className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:border-teal-200 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-bold text-slate-900 truncate">
                            {ev?.title || 'Culto'}
                          </h5>
                          {ro && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-semibold bg-teal-50 text-teal-800 border-teal-200"
                            >
                              {ro.name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{ev ? formatDateDisplay(ev.date) : ''}</span>
                          {ev?.start_time && <span>• {ev.start_time}</span>}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {scale.status === 'PENDENTE' ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleConfirmScale(scale.id)}
                              disabled={isUpdatingScale}
                              className="h-8 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold gap-1"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Confirmar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDeclineModal(scale)}
                              disabled={isUpdatingScale}
                              className="h-8 px-3 rounded-lg border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold gap-1"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Recusar
                            </Button>
                          </>
                        ) : scale.status === 'CONFIRMADO' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-xs">
                            Confirmado
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 text-xs">
                            Recusado
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notificações Recentes / Atividades da Igreja */}
        <Card className="rounded-2xl border-slate-200 shadow-xs flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-900">
              Atividades Recentes
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Últimas atualizações e respostas de escala na equipe
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 flex-1">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <p className="text-sm">Nenhuma atividade registrada ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((act) => {
                  const musicianName =
                    act.expand?.member_id?.expand?.user_id?.name || 'Músico da equipe'
                  const eventName = act.expand?.event_id?.title || 'Culto'
                  const roleName = act.expand?.role_id?.name || 'Escala'

                  return (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3 text-xs"
                    >
                      <div className="mt-0.5">
                        {act.status === 'CONFIRMADO' ? (
                          <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </div>
                        ) : act.status === 'RECUSADO' ? (
                          <div className="h-6 w-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                            <XCircle className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                            <AlertCircle className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">
                          {musicianName}{' '}
                          <span className="font-normal text-slate-600">
                            {act.status === 'CONFIRMADO'
                              ? 'confirmou participação como'
                              : act.status === 'RECUSADO'
                                ? 'recusou a escala de'
                                : 'foi escalado(a) como'}{' '}
                            <strong className="text-slate-900">{roleName}</strong> no {eventName}.
                          </span>
                        </p>
                        {act.decline_reason && (
                          <p className="text-[11px] text-red-600 mt-1 italic">
                            Motivo: "{act.decline_reason}"
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {new Date(act.updated).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Motivo da Recusa */}
      <Dialog open={declineModalOpen} onOpenChange={setDeclineModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Recusar Escala</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informe ao líder da equipe o motivo pelo qual você não poderá participar deste culto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="reason" className="text-xs font-semibold text-slate-700">
              Motivo da ausência
            </Label>
            <Textarea
              id="reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Ex: Viagem de trabalho, compromisso familiar, imprevisto..."
              className="rounded-xl border-slate-200 min-h-[90px]"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeclineModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDecline}
              disabled={isUpdatingScale}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
            >
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
