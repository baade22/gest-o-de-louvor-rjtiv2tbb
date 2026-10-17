import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  Hourglass,
  Images,
  Link2,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Music2,
  Pencil,
  Send,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getLocalTodayYMD, parseCalendarDate } from '@/lib/dateUtils'
import { countPendencies, type EventReadiness, type ReadinessPart } from '@/lib/eventReadiness'
import type { HolyricsAgentInfo } from '@/services/holyricsAgent'
import type { EventItem } from '@/types'
import { Chip, timeAgo, type Tone } from './shared'

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

const EVENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  Planejado: { label: 'Em preparação', tone: 'warn' },
  Confirmado: { label: 'Confirmado', tone: 'ok' },
  Realizado: { label: 'Realizado', tone: 'neutral' },
  Cancelado: { label: 'Cancelado', tone: 'danger' },
}

function daysFromToday(date: string): number | null {
  const target = parseCalendarDate(date)
  const today = parseCalendarDate(getLocalTodayYMD())
  if (!target || !today) return null
  return Math.round(
    (Date.UTC(target.year, target.month - 1, target.day) -
      Date.UTC(today.year, today.month - 1, today.day)) /
      86_400_000,
  )
}

function countdown(days: number | null): string | null {
  if (days === null) return null
  if (days === 0) return 'É hoje'
  if (days === 1) return 'Amanhã'
  if (days > 1) return `Faltam ${days} dias`
  if (days === -1) return 'Foi ontem'
  return `Foi há ${-days} dias`
}

export interface HolyricsLinkState {
  label: string
  tone: Tone
  title: string
  canResolve: boolean
}

interface EventHeaderProps {
  event: EventItem
  readiness: EventReadiness
  songsCount: number
  agents: HolyricsAgentInfo[] | null
  linkState: HolyricsLinkState | null
  canEdit: boolean
  canSync: boolean
  isSyncing: boolean
  isResolvingLink: boolean
  onSync: () => void
  onResolveLink: () => void
  onOpenTab: (tab: string) => void
}

export function EventHeader({
  event,
  readiness,
  songsCount,
  agents,
  linkState,
  canEdit,
  canSync,
  isSyncing,
  isResolvingLink,
  onSync,
  onResolveLink,
  onOpenTab,
}: EventHeaderProps) {
  const date = parseCalendarDate(event.date)
  const weekday = date
    ? WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]
    : ''
  const status = EVENT_STATUS[event.status] || { label: event.status, tone: 'neutral' as Tone }
  const when = countdown(daysFromToday(event.date))
  const pendencies = countPendencies(readiness)

  const onlineAgent = agents?.find((a) => a.status === 'ONLINE')
  const lastSeen = agents
    ?.map((a) => a.last_seen_at)
    .filter(Boolean)
    .sort()
    .pop()

  return (
    <div className="space-y-4">
      <Link
        to="/events"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Agenda de cultos
      </Link>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="hidden w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 text-center sm:block">
              <div className="bg-teal-700 py-0.5 text-[11px] font-bold text-white">
                {date ? MONTHS[date.month - 1] : ''}
              </div>
              <div className="pt-1 text-2xl font-extrabold leading-none text-slate-900">
                {date?.day ?? '--'}
              </div>
              <div className="pb-1.5 pt-0.5 text-[10px] font-bold text-slate-500">{weekday}</div>
            </div>

            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Chip tone={status.tone}>{status.label}</Chip>
                {linkState && (
                  <Chip tone={linkState.tone} dot={false} title={linkState.title}>
                    <Link2 className="h-3 w-3" />
                    {linkState.label}
                  </Chip>
                )}
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {event.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                {event.start_time && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-400" />
                    {event.start_time}
                    {event.end_time ? ` – ${event.end_time}` : ''}
                  </span>
                )}
                {when && (
                  <span className="inline-flex items-center gap-1.5">
                    <Hourglass className="h-4 w-4 text-slate-400" />
                    {when}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="mt-2 max-w-2xl text-sm text-slate-500">{event.description}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            {agents && agents.length > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold lg:self-end',
                  onlineAgent ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                )}
                title={onlineAgent ? `Computador: ${onlineAgent.name}` : undefined}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    onlineAgent ? 'bg-emerald-500' : 'bg-red-500',
                  )}
                />
                {onlineAgent
                  ? 'Holyrics conectado'
                  : `Holyrics offline${lastSeen ? ` · visto ${timeAgo(lastSeen)}` : ''}`}
              </span>
            )}
            <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap">
              {canEdit && (
                <Button
                  asChild
                  variant="outline"
                  className="h-9 shrink-0 gap-1.5 rounded-lg px-2.5 font-semibold sm:px-4"
                >
                  <Link to={`/events/${event.id}/edit`} aria-label="Editar culto">
                    <Pencil className="h-4 w-4" />
                    <span className="hidden sm:inline">Editar</span>
                  </Link>
                </Button>
              )}
              {canSync && (
                <Button
                  onClick={onSync}
                  disabled={isSyncing || songsCount === 0}
                  title={
                    songsCount === 0
                      ? 'Adicione músicas ao repertório primeiro'
                      : 'Envia as músicas, na ordem do repertório, para a playlist do Holyrics'
                  }
                  className="h-9 flex-1 gap-1.5 rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800 sm:flex-none"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSyncing ? 'Enviando…' : 'Enviar ao Holyrics'}
                </Button>
              )}
              {canSync && linkState?.canResolve && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-lg"
                      aria-label="Mais ações"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-xs font-medium text-slate-500">
                      Holyrics
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={isResolvingLink}
                      onSelect={onResolveLink}
                      className="gap-2"
                    >
                      {isResolvingLink ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                      Vincular ao evento do Holyrics
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 lg:grid-cols-[1.1fr_repeat(4,1fr)]">
          <div className="flex items-center gap-3 bg-slate-50/60 px-5 py-4 col-span-2 lg:col-span-1">
            <ReadinessRing value={readiness.score} />
            <div>
              <div className="text-sm font-semibold text-slate-900">Prontidão do culto</div>
              <div className="text-xs text-slate-500">
                {pendencies === 0
                  ? 'Tudo certo'
                  : `${pendencies} ${pendencies === 1 ? 'pendência' : 'pendências'}`}
              </div>
            </div>
          </div>
          <ReadinessCell
            icon={Users}
            label="Equipe"
            value={readiness.team.done}
            caption={
              readiness.team.total ? `de ${readiness.team.total} confirmados` : 'ninguém escalado'
            }
            part={readiness.team}
            onClick={() => onOpenTab('escala')}
          />
          <ReadinessCell
            icon={Music2}
            label="Repertório"
            value={songsCount}
            caption={songsCount === 1 ? 'música' : 'músicas'}
            part={readiness.repertoire}
            onClick={() => onOpenTab('repertorio')}
          />
          <ReadinessCell
            icon={Images}
            label="Mídias"
            value={readiness.media?.done ?? 0}
            caption={
              readiness.media ? `de ${readiness.media.total} no computador` : 'nenhuma mídia'
            }
            part={readiness.media}
            onClick={() => onOpenTab('midia')}
          />
          <ReadinessCell
            icon={ListChecks}
            label="Tarefas"
            value={readiness.tasks?.done ?? 0}
            caption={readiness.tasks ? `de ${readiness.tasks.total} concluídas` : 'nenhuma tarefa'}
            part={readiness.tasks}
            onClick={() => onOpenTab('tarefas')}
          />
        </div>
      </div>
    </div>
  )
}

function ReadinessRing({ value }: { value: number }) {
  const color = value >= 70 ? '#0f766e' : value >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${value * 3.6}deg, #e2e8f0 0deg)` }}
      role="img"
      aria-label={`Prontidão ${value}%`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-xs font-bold text-slate-900">
        {value}%
      </span>
    </div>
  )
}

function ReadinessCell({
  icon: Icon,
  label,
  value,
  caption,
  part,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: number
  caption: string
  part?: ReadinessPart
  onClick: () => void
}) {
  const pct = part ? Math.round(part.ratio * 100) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900">
        {value} <span className="text-xs font-normal text-slate-500">{caption}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            !part
              ? 'bg-slate-200'
              : pct >= 70
                ? 'bg-teal-600'
                : pct >= 40
                  ? 'bg-amber-500'
                  : 'bg-red-500',
          )}
          style={{ width: `${part ? Math.max(pct, 3) : 0}%` }}
        />
      </div>
    </button>
  )
}
