import React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  HardDriveDownload,
  ListChecks,
  MonitorOff,
  Music2,
  UserRoundX,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AttentionItem, EventReadiness } from '@/lib/eventReadiness'
import type { HolyricsAgentInfo } from '@/services/holyricsAgent'
import type { EventItem, EventMember, EventMoment, EventSong, MediaAsset } from '@/types'
import { RunSheet } from './RunSheet'
import { Avatar, SectionCard, TEAM_AREAS, eventMemberName, memberArea } from './shared'

const ATTENTION_ICON: Record<
  AttentionItem['kind'],
  { icon: React.ElementType; className: string }
> = {
  NO_TEAM: { icon: Users, className: 'bg-amber-50 text-amber-600' },
  PENDING_MEMBERS: { icon: UserRoundX, className: 'bg-amber-50 text-amber-600' },
  DECLINED_MEMBERS: { icon: UserRoundX, className: 'bg-red-50 text-red-600' },
  EMPTY_REPERTOIRE: { icon: Music2, className: 'bg-amber-50 text-amber-600' },
  SONG_SYNC_ERROR: { icon: AlertTriangle, className: 'bg-red-50 text-red-600' },
  MEDIA_NOT_TRANSFERRED: { icon: HardDriveDownload, className: 'bg-violet-50 text-violet-600' },
  URGENT_TASKS: { icon: ListChecks, className: 'bg-amber-50 text-amber-600' },
}

interface OverviewTabProps {
  event: EventItem
  readiness: EventReadiness
  members: EventMember[]
  songs: EventSong[]
  medias: MediaAsset[]
  moments: EventMoment[]
  runSheetAvailable: boolean
  agents: HolyricsAgentInfo[] | null
  canEdit: boolean
  onChanged: () => void
  onOpenTab: (tab: string) => void
}

export function OverviewTab({
  event,
  readiness,
  members,
  songs,
  medias,
  moments,
  runSheetAvailable,
  agents,
  canEdit,
  onChanged,
  onOpenTab,
}: OverviewTabProps) {
  const holyricsOffline = agents && agents.length > 0 && !agents.some((a) => a.status === 'ONLINE')
  const attentionCount = readiness.attention.length + (holyricsOffline ? 1 : 0)
  const confirmed = members.filter((m) => m.status === 'CONFIRMADO').length

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <RunSheet
        event={event}
        moments={moments}
        songs={songs}
        medias={medias}
        available={runSheetAvailable}
        canEdit={canEdit}
        onChanged={onChanged}
      />

      <div className="space-y-5">
        <SectionCard
          title="Precisa de atenção"
          actions={
            attentionCount > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                {attentionCount}
              </span>
            )
          }
        >
          {attentionCount === 0 ? (
            <div className="flex items-center gap-3 px-5 py-4 text-sm text-slate-600">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Nada pendente. Está tudo encaminhado.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {readiness.attention.map((item) => {
                const { icon: Icon, className } = ATTENTION_ICON[item.kind]
                return (
                  <li key={item.kind} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                        className,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">{item.title}</div>
                      {item.detail && (
                        <div className="truncate text-xs text-slate-500">{item.detail}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md px-2.5 text-xs"
                      onClick={() => onOpenTab(item.tab)}
                    >
                      Ver
                    </Button>
                  </li>
                )
              })}
              {holyricsOffline && (
                <li className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600">
                    <MonitorOff className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">Holyrics offline</div>
                    <div className="text-xs text-slate-500">
                      Abra o Holyrics e o LouvorFlow Agent no computador da projeção
                    </div>
                  </div>
                </li>
              )}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Equipe"
          subtitle={members.length ? `${confirmed} de ${members.length} confirmados` : undefined}
          actions={
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs font-semibold text-teal-700"
              onClick={() => onOpenTab('escala')}
            >
              Ver tudo
            </Button>
          }
        >
          <ul className="divide-y divide-slate-100">
            {TEAM_AREAS.map(({ value, label, icon: Icon }) => {
              const areaMembers = members.filter((m) => memberArea(m) === value)
              const areaConfirmed = areaMembers.filter((m) => m.status === 'CONFIRMADO').length
              return (
                <li key={value} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500">
                      {areaMembers.length === 0
                        ? 'Ninguém escalado'
                        : `${areaConfirmed} de ${areaMembers.length} ${areaMembers.length === 1 ? 'confirmado' : 'confirmados'}`}
                    </div>
                  </div>
                  <div className="flex -space-x-1.5">
                    {areaMembers.slice(0, 4).map((m) => (
                      <Avatar key={m.id} name={eventMemberName(m)} size="sm" />
                    ))}
                    {areaMembers.length > 4 && (
                      <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 ring-2 ring-white">
                        +{areaMembers.length - 4}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}
