import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { EventItem, EventMember, EventSong } from '@/types'
import { listEventTasks } from '@/services/tasks'
import { listAllChurchMedia } from '@/services/media'
import {
  CalendarDays,
  Music2,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Plus,
  LayoutList,
  ImageIcon,
  CalendarCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { formatCalendarDateDisplay, getLocalTodayYMD, parseCalendarDate } from '@/lib/dateUtils'
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

const MONTHS_SHORT = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
]

interface EventSummary {
  event: EventItem
  totalMembers: number
  confirmedMembers: number
  pendingMembers: number
  songsCount: number
  /** 0–100: metade pela equipe confirmada, metade por ter repertório montado. */
  readiness: number
}

function daysUntil(dateStr: string): number {
  const target = parseCalendarDate(dateStr)
  const today = parseCalendarDate(getLocalTodayYMD())
  if (!target || !today) return 0
  const t = Date.UTC(target.year, target.month - 1, target.day)
  const n = Date.UTC(today.year, today.month - 1, today.day)
  return Math.round((t - n) / 86_400_000)
}

function countdownLabel(days: number): string {
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  return `${days} dias`
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function readinessColor(value: number): string {
  if (value >= 70) return 'bg-teal-600'
  if (value >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function MiniDate({ date }: { date: string }) {
  const parts = parseCalendarDate(date)
  return (
    <div className="w-11 shrink-0 rounded-lg border border-slate-200 bg-slate-50 py-1 text-center">
      <div className="text-[10px] font-bold text-teal-700">
        {parts ? MONTHS_SHORT[parts.month - 1] : '--'}
      </div>
      <div className="text-[17px] font-extrabold leading-tight text-slate-900">
        {parts ? String(parts.day).padStart(2, '0') : '--'}
      </div>
    </div>
  )
}

function Chip({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'danger' | 'teal' | 'neutral'
  children: React.ReactNode
}) {
  const tones = {
    ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warn: 'bg-amber-50 text-amber-700 ring-amber-200',
    danger: 'bg-red-50 text-red-700 ring-red-200',
    teal: 'bg-teal-50 text-teal-700 ring-teal-200',
    neutral: 'bg-white text-slate-600 ring-slate-200',
  }
  const dot = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-red-500',
    teal: 'bg-teal-500',
    neutral: 'bg-slate-400',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[tone])} />
      {children}
    </span>
  )
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  isLoading,
}: {
  icon: React.ElementType
  iconClass: string
  label: string
  value: React.ReactNode
  hint: string
  isLoading: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
      <div className="flex items-center gap-2.5 text-[13px] font-medium text-slate-600">
        <span className={cn('grid h-8 w-8 place-items-center rounded-lg', iconClass)}>
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <div className="mt-3 text-[26px] font-bold tracking-tight text-slate-900">
        {isLoading ? <Skeleton className="h-8 w-12" /> : value}
      </div>
      <div className="text-xs text-slate-500">{hint}</div>
    </div>
  )
}

export default function Dashboard() {
  const { currentChurch, currentMember, user, isAdmin, isLeader, isMaster } = useAuth()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSongs: 0,
    activeMembers: null as number | null,
    eventsThisMonth: 0,
    eventsLeftThisMonth: 0,
    pendingMedias: 0,
    pendingTasks: 0,
  })
  const [upcomingEvents, setUpcomingEvents] = useState<EventSummary[]>([])
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
      const churchFilter = `church_id = "${currentChurch.id}"`
      const today = getLocalTodayYMD()
      const monthStart = `${today.slice(0, 7)}-01`
      const [y, m] = today.split('-').map(Number)
      const nextMonthStart =
        m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

      // 1. Acervo de músicas
      const songsRes = await pb.collection('songs').getList(1, 1, { filter: churchFilter })

      // 2. Próximos cultos (a partir de hoje, sem os cancelados)
      const eventsRes = await pb.collection('events').getList<EventItem>(1, 6, {
        filter: `${churchFilter} && date >= "${today}" && status != "Cancelado"`,
        sort: 'date,start_time',
      })
      const upcoming = eventsRes.items.slice(0, 4)

      // 3. Equipe e repertório dos próximos cultos (uma consulta cada)
      let summaries: EventSummary[] = upcoming.map((event) => ({
        event,
        totalMembers: 0,
        confirmedMembers: 0,
        pendingMembers: 0,
        songsCount: 0,
        readiness: 0,
      }))
      if (upcoming.length > 0) {
        const idsFilter = upcoming.map((e) => `event_id = "${e.id}"`).join(' || ')
        const [members, songs] = await Promise.all([
          pb.collection('event_members').getFullList<EventMember>({
            filter: `${churchFilter} && (${idsFilter})`,
          }),
          pb.collection('event_songs').getFullList<EventSong>({
            filter: `${churchFilter} && (${idsFilter})`,
            fields: 'id,event_id',
          }),
        ])
        summaries = summaries.map((s) => {
          const evMembers = members.filter((mb) => mb.event_id === s.event.id)
          const confirmed = evMembers.filter((mb) => mb.status === 'CONFIRMADO').length
          const pending = evMembers.filter((mb) => mb.status === 'PENDENTE').length
          const songsCount = songs.filter((sg) => sg.event_id === s.event.id).length
          const teamRatio = evMembers.length ? confirmed / evMembers.length : 0
          return {
            ...s,
            totalMembers: evMembers.length,
            confirmedMembers: confirmed,
            pendingMembers: pending,
            songsCount,
            readiness: Math.round(((teamRatio + (songsCount > 0 ? 1 : 0)) / 2) * 100),
          }
        })
      }
      setUpcomingEvents(summaries)

      // 4. Cultos deste mês
      const monthRes = await pb.collection('events').getList<EventItem>(1, 1, {
        filter: `${churchFilter} && date >= "${monthStart}" && date < "${nextMonthStart}" && status != "Cancelado"`,
      })
      const monthLeftRes = await pb.collection('events').getList<EventItem>(1, 1, {
        filter: `${churchFilter} && date >= "${today}" && date < "${nextMonthStart}" && status != "Cancelado"`,
      })

      // 5. Membros ativos (nem todo papel pode ler a lista)
      let activeMembers: number | null = null
      try {
        const membersRes = await pb.collection('church_members').getList(1, 1, {
          filter: `${churchFilter} && is_active = true`,
        })
        activeMembers = membersRes.totalItems
      } catch {
        /* sem permissão: o card mostra "—" */
      }

      let pendingMedias = 0
      let pendingTasks = 0
      try {
        const churchMedias = await listAllChurchMedia(currentChurch.id)
        pendingMedias = churchMedias.filter(
          (md) => md.status !== 'CONCLUIDA' && md.status !== 'IMPORTADA_HOLYRICS',
        ).length
        if (upcoming[0]) {
          const tasks = await listEventTasks(currentChurch.id, upcoming[0].id)
          pendingTasks = tasks.filter(
            (t) => t.status === 'PENDENTE' || t.status === 'EM_ANDAMENTO',
          ).length
        }
      } catch {
        /* intentionally ignored */
      }

      setStats({
        totalSongs: songsRes.totalItems,
        activeMembers,
        eventsThisMonth: monthRes.totalItems,
        eventsLeftThisMonth: monthLeftRes.totalItems,
        pendingMedias,
        pendingTasks,
      })

      // 6. Próximas escalas do usuário logado
      if (currentMember) {
        const myScales = await pb.collection('event_members').getList<EventMember>(1, 5, {
          filter: `${churchFilter} && member_id = "${currentMember.id}" && event_id.date >= "${today}"`,
          expand: 'event_id,role_id',
          sort: 'event_id.date',
        })
        setMyUpcomingScales(myScales.items)
      }

      // 7. Atividades recentes (últimas confirmações ou escalas na igreja)
      const activities = await pb.collection('event_members').getList<EventMember>(1, 5, {
        filter: churchFilter,
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

  const todayDisplay = formatCalendarDateDisplay(getLocalTodayYMD(), 'full')
  const canManage = isAdmin || isLeader
  const next = upcomingEvents[0]
  const nextDays = next ? daysUntil(next.event.date) : 0
  const nextPendencies = next
    ? next.pendingMembers + (next.songsCount === 0 ? 1 : 0) + stats.pendingTasks
    : 0
  const myPendingScales = myUpcomingScales.filter((s) => s.status === 'PENDENTE').length

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {greeting()}, {user?.name?.split(' ')[0] || 'Músico'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {capitalizeFirst(todayDisplay)}
            {currentChurch?.name ? ` · ${currentChurch.name}` : ''}
          </p>
        </div>

        {canManage && (
          <Button
            asChild
            className="h-10 gap-2 self-start rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800 sm:self-auto"
          >
            <Link to="/events/new">
              <Plus className="h-4 w-4" />
              Novo culto
            </Link>
          </Button>
        )}
      </div>

      {/* Próximo culto */}
      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : next ? (
        <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:grid-cols-[1fr_280px]">
          <div className="p-5 sm:p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Próximo culto
            </div>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-[22px]">
              {next.event.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {capitalizeFirst(formatCalendarDateDisplay(next.event.date, 'full'))}
              {next.event.start_time && (
                <span>
                  {' · '}
                  {next.event.start_time}
                  {next.event.end_time ? ` – ${next.event.end_time}` : ''}
                </span>
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {next.totalMembers > 0 ? (
                <Chip tone={next.confirmedMembers === next.totalMembers ? 'ok' : 'warn'}>
                  {next.confirmedMembers} de {next.totalMembers} confirmados
                </Chip>
              ) : (
                <Chip tone="danger">Equipe não escalada</Chip>
              )}
              {next.songsCount > 0 ? (
                <Chip tone="teal">
                  {next.songsCount} {next.songsCount === 1 ? 'música' : 'músicas'}
                </Chip>
              ) : (
                <Chip tone="danger">Repertório vazio</Chip>
              )}
              {stats.pendingTasks > 0 && (
                <Chip tone="warn">
                  {stats.pendingTasks}{' '}
                  {stats.pendingTasks === 1 ? 'tarefa aberta' : 'tarefas abertas'}
                </Chip>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                asChild
                className="h-10 gap-2 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800"
              >
                <Link to={`/events/${next.event.id}/escala`}>
                  <LayoutList className="h-4 w-4" />
                  Abrir central do culto
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-10 rounded-lg font-semibold text-slate-700"
              >
                <Link to="/events">Ver agenda</Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-1.5 bg-gradient-to-br from-teal-700 to-cyan-900 p-5 text-white sm:p-6">
            <div className="text-[13px] text-teal-100">{nextDays <= 0 ? 'É' : 'Começa em'}</div>
            <div className="text-4xl font-extrabold tracking-tight">{countdownLabel(nextDays)}</div>
            <div className="text-[13px] text-teal-100">
              Prontidão {next.readiness}%
              {nextPendencies > 0
                ? ` · ${nextPendencies} ${nextPendencies === 1 ? 'pendência' : 'pendências'}`
                : ' · tudo certo'}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-teal-300 transition-all"
                style={{ width: `${next.readiness}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-800">Nenhum culto agendado</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Crie cultos e ensaios para montar repertórios e escalar sua equipe.
          </p>
          {canManage && (
            <Button
              asChild
              size="sm"
              className="mt-4 rounded-lg bg-teal-700 text-white hover:bg-teal-800"
            >
              <Link to="/events/new">Criar primeiro culto</Link>
            </Button>
          )}
        </div>
      )}

      {/* Números */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          iconClass="bg-teal-50 text-teal-700"
          label="Cultos este mês"
          value={stats.eventsThisMonth}
          hint={`${stats.eventsLeftThisMonth} ainda por vir`}
          isLoading={isLoading}
        />
        <StatCard
          icon={Users}
          iconClass="bg-sky-50 text-sky-700"
          label="Membros ativos"
          value={stats.activeMembers ?? '—'}
          hint="Na equipe da igreja"
          isLoading={isLoading}
        />
        <StatCard
          icon={Music2}
          iconClass="bg-violet-50 text-violet-700"
          label="Músicas no acervo"
          value={stats.totalSongs}
          hint="Cadastradas"
          isLoading={isLoading}
        />
        {isMaster || isAdmin ? (
          <StatCard
            icon={ImageIcon}
            iconClass="bg-amber-50 text-amber-700"
            label="Mídias pendentes"
            value={stats.pendingMedias}
            hint="Para baixar ou importar"
            isLoading={isLoading}
          />
        ) : (
          <StatCard
            icon={CalendarCheck}
            iconClass="bg-amber-50 text-amber-700"
            label="Escalas a confirmar"
            value={myPendingScales}
            hint="Aguardando sua resposta"
            isLoading={isLoading}
          />
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Próximos cultos */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h3 className="text-[15px] font-semibold text-slate-900">Próximos cultos</h3>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-800"
            >
              <Link to="/events">
                Ver agenda <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : upcomingEvents.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              Nenhum culto nos próximos dias.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingEvents.map((s) => (
                <li key={s.event.id}>
                  <Link
                    to={`/events/${s.event.id}/escala`}
                    className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-slate-50"
                  >
                    <MiniDate date={s.event.date} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{s.event.title}</div>
                      <div className="truncate text-xs text-slate-500">
                        {capitalizeFirst(
                          formatCalendarDateDisplay(s.event.date, 'short')
                            .split(',')[0]
                            .replace('.', ''),
                        )}
                        {s.event.start_time ? ` · ${s.event.start_time}` : ''}
                        {' · '}
                        {s.songsCount > 0
                          ? `${s.songsCount} ${s.songsCount === 1 ? 'música' : 'músicas'}`
                          : 'repertório vazio'}
                      </div>
                    </div>
                    <div className="hidden w-28 sm:block">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn('h-full rounded-full', readinessColor(s.readiness))}
                          style={{ width: `${Math.max(s.readiness, 4)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{s.readiness}% pronto</div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
                        s.totalMembers === 0
                          ? 'text-slate-500 ring-slate-200'
                          : s.confirmedMembers === s.totalMembers
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200',
                      )}
                      title="Confirmados / escalados"
                    >
                      {s.confirmedMembers}/{s.totalMembers}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Minhas escalas */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h3 className="text-[15px] font-semibold text-slate-900">Minhas escalas</h3>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-800"
            >
              <Link to="/minhas-escalas">
                Ver todas <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : myUpcomingScales.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-teal-600/60" />
              <p className="text-sm font-semibold text-slate-700">Nenhuma escala por vir</p>
              <p className="mt-0.5 text-xs text-slate-500">Quando te escalarem, aparece aqui.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {myUpcomingScales.map((scale) => {
                const ev = scale.expand?.event_id
                const ro = scale.expand?.role_id
                return (
                  <li key={scale.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    {ev && <MiniDate date={ev.date} />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">
                        {ev?.title || 'Culto'}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {ro?.name || 'Escala'}
                        {ev?.start_time ? ` · ${ev.start_time}` : ''}
                      </div>
                    </div>
                    {scale.status === 'PENDENTE' ? (
                      <div className="flex w-full shrink-0 gap-1.5 pl-14 sm:w-auto sm:pl-0">
                        <Button
                          size="sm"
                          onClick={() => handleConfirmScale(scale.id)}
                          disabled={isUpdatingScale}
                          className="h-8 gap-1 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDeclineModal(scale)}
                          disabled={isUpdatingScale}
                          className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-700"
                        >
                          Não posso
                        </Button>
                      </div>
                    ) : scale.status === 'CONFIRMADO' ? (
                      <Chip tone="ok">Confirmado</Chip>
                    ) : (
                      <Chip tone="danger">Recusado</Chip>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Atividades recentes */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-slate-900">Atividade recente da equipe</h3>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : recentActivities.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Nenhuma atividade registrada ainda.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentActivities.map((act) => {
              const musicianName =
                act.expand?.member_id?.expand?.user_id?.name || 'Músico da equipe'
              const eventName = act.expand?.event_id?.title || 'Culto'
              const roleName = act.expand?.role_id?.name || 'Escala'
              const Icon =
                act.status === 'CONFIRMADO'
                  ? CheckCircle2
                  : act.status === 'RECUSADO'
                    ? XCircle
                    : AlertCircle
              const iconClass =
                act.status === 'CONFIRMADO'
                  ? 'bg-emerald-50 text-emerald-600'
                  : act.status === 'RECUSADO'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-amber-50 text-amber-600'

              return (
                <li key={act.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <span
                    className={cn(
                      'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                      iconClass,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-600">
                      <span className="font-semibold text-slate-900">{musicianName}</span>{' '}
                      {act.status === 'CONFIRMADO'
                        ? 'confirmou participação como'
                        : act.status === 'RECUSADO'
                          ? 'recusou a escala de'
                          : 'foi escalado(a) como'}{' '}
                      <span className="font-medium text-slate-900">{roleName}</span> em {eventName}.
                    </p>
                    {act.decline_reason && (
                      <p className="mt-0.5 text-xs italic text-red-600">
                        Motivo: "{act.decline_reason}"
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(act.updated).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Modal de Motivo da Recusa */}
      <Dialog open={declineModalOpen} onOpenChange={setDeclineModalOpen}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Não posso participar
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Conte ao líder o motivo, para ele achar um substituto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="reason" className="text-xs font-semibold text-slate-700">
              Motivo da ausência
            </Label>
            <Textarea
              id="reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Ex: viagem de trabalho, compromisso familiar, imprevisto..."
              className="min-h-[90px] rounded-lg border-slate-200"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeclineModalOpen(false)}
              className="rounded-lg"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDecline}
              disabled={isUpdatingScale}
              className="rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
