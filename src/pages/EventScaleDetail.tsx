import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Images, LayoutList, ListChecks, Music2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { computeEventReadiness } from '@/lib/eventReadiness'
import {
  resolveHolyricsEvent,
  syncEventRepertoireWithHolyrics,
  type ResolveHolyricsEventResponse,
} from '@/services/holyricsAgent'
import type { TeamArea } from '@/types'
import { EventHeader, type HolyricsLinkState } from './event-center/EventHeader'
import { OverviewTab } from './event-center/OverviewTab'
import { RepertoireTab } from './event-center/RepertoireTab'
import { TeamTab } from './event-center/TeamTab'
import { MediaTab } from './event-center/MediaTab'
import { TasksTab } from './event-center/TasksTab'
import { SyncReportDialog, type SyncReport } from './event-center/SyncReportDialog'
import { useEventCenter } from './event-center/useEventCenter'

/** Abas antigas por área (links de Som, Projeção e Iluminação) caem na aba nova equivalente. */
const LEGACY_TABS: Record<string, { tab: string; area?: TeamArea }> = {
  som: { tab: 'tarefas', area: 'SOM' },
  iluminacao: { tab: 'tarefas', area: 'ILUMINACAO' },
  projecao: { tab: 'midia' },
}

export default function EventScaleDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    currentChurch,
    canManageContent,
    currentMember,
    isMaster,
    isAdmin,
    isLeader,
    hasOperationalRole,
    hasPermission,
  } = useAuth()

  // Quem vê e opera cada parte da central
  const canSeeRepertoire = isMaster || isAdmin || isLeader || hasOperationalRole('MUSICO')
  const canSeeSound = isMaster || isAdmin || hasOperationalRole('SOM')
  const canSeeProjection = isMaster || isAdmin || hasOperationalRole('PROJECAO')
  const canSeeLighting = isMaster || isAdmin || hasOperationalRole('ILUMINACAO')
  const canSeeMedia =
    isMaster || isAdmin || hasOperationalRole('MIDIA') || hasOperationalRole('PROJECAO')
  // Incluir/ordenar/excluir mídia = gestor ou função MÍDIA (igual à regra do servidor em media_assets).
  const canManageMedia = canManageContent || hasOperationalRole('MIDIA')
  // Enviar ao computador e montar a playlist no Holyrics = gestor, MÍDIA ou Projeção (quem opera o culto).
  const canOperateMedia = canManageMedia || hasOperationalRole('PROJECAO')
  const canSeeAllTasks = isMaster || isAdmin || isLeader || hasOperationalRole('MIDIA')
  const taskAreas: TeamArea[] | null = canSeeAllTasks
    ? null
    : ([
        canSeeSound && 'SOM',
        canSeeProjection && 'PROJECAO',
        canSeeLighting && 'ILUMINACAO',
      ].filter(Boolean) as TeamArea[])
  const canSeeTasks = taskAreas === null || taskAreas.length > 0
  const canSyncHolyrics = isMaster || isAdmin || isLeader || hasPermission('holyrics.sync')

  const center = useEventCenter(id, currentChurch?.id, canSyncHolyrics)
  const { event, songs, members, medias, tasks, moments } = center

  const rawTab = searchParams.get('tab') || 'overview'
  const legacy = LEGACY_TABS[rawTab]
  const [taskArea] = useState<TeamArea | null>(legacy?.area || null)
  const activeTab = legacy?.tab || rawTab
  const openTab = (tab: string) => setSearchParams({ tab }, { replace: true })

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null)
  const [isResolvingLink, setIsResolvingLink] = useState(false)
  const [linkResult, setLinkResult] = useState<ResolveHolyricsEventResponse | null>(null)

  useEffect(() => {
    if (!center.error || center.event) return
    toast({
      title: 'Erro ao carregar o culto',
      description: 'Não foi possível carregar as informações do culto.',
      variant: 'destructive',
    })
    navigate('/events')
  }, [center.error, center.event])

  const readiness = useMemo(
    () => computeEventReadiness({ members, songs, medias, tasks }),
    [members, songs, medias, tasks],
  )

  const linkState = useMemo<HolyricsLinkState | null>(() => {
    if (!event) return null
    if (event.holyrics_event_id) {
      return {
        label: 'Vinculado ao Holyrics',
        tone: 'ok',
        title: `Evento do Holyrics #${event.holyrics_event_id} associado a este culto.`,
        canResolve: false,
      }
    }
    if (!canSyncHolyrics) return null
    const status = linkResult?.status
    if (status === 'EVENT_NOT_FOUND')
      return {
        label: 'Evento não encontrado no Holyrics',
        tone: 'danger',
        title: linkResult!.message,
        canResolve: true,
      }
    if (status === 'AMBIGUOUS_MATCH')
      return {
        label: 'Mais de um evento no Holyrics',
        tone: 'danger',
        title: linkResult!.message,
        canResolve: true,
      }
    if (status === 'GET_SCHEDULES_FAILED' || status === 'INVALID_EVENT_DATE')
      return {
        label: 'Falha ao vincular',
        tone: 'danger',
        title: linkResult!.message,
        canResolve: true,
      }
    if (status === 'SYNC_PENDING')
      return {
        label: 'Vínculo pendente',
        tone: 'violet',
        title: linkResult!.message,
        canResolve: true,
      }
    return {
      label: 'Não vinculado ao Holyrics',
      tone: 'neutral',
      title:
        'Use "Vincular ao evento do Holyrics" no menu para achar este culto na agenda do Holyrics. Nada é criado lá.',
      canResolve: true,
    }
  }, [event, linkResult, canSyncHolyrics])

  const handleSync = async () => {
    if (!event || !currentChurch) return
    setIsSyncing(true)
    try {
      const res = await syncEventRepertoireWithHolyrics({
        churchId: currentChurch.id,
        eventId: event.id,
      })
      if (res.items && res.items.length > 0) {
        setSyncReport({
          items: res.items,
          summary: res.summary || null,
          message: res.message,
          hasErrors: Boolean(res.has_errors),
        })
      } else {
        toast({
          title: res.success ? 'Repertório enviado' : 'Não foi possível enviar',
          description: res.message || 'Verifique o LouvorFlow Agent e o Holyrics.',
          variant: res.success ? 'default' : 'destructive',
        })
      }
      await center.reload()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar ao Holyrics',
        description: err?.message || 'Não foi possível falar com o computador do Holyrics.',
        variant: 'destructive',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleResolveLink = async () => {
    if (!event || !currentChurch || isResolvingLink) return
    setIsResolvingLink(true)
    try {
      const res = await resolveHolyricsEvent({ churchId: currentChurch.id, eventId: event.id })
      setLinkResult(res)
      toast({
        title: res.linked ? 'Culto vinculado ao Holyrics' : 'Não foi possível vincular',
        description: res.message,
        variant: res.linked ? 'default' : 'destructive',
      })
      await center.reload()
    } catch (err: any) {
      toast({
        title: 'Erro ao vincular evento',
        description:
          err?.response?.data?.message ||
          err?.message ||
          'Não foi possível consultar as agendas do Holyrics.',
        variant: 'destructive',
      })
    } finally {
      setIsResolvingLink(false)
    }
  }

  if (center.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-5 w-40 rounded-lg" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-10 w-full max-w-lg rounded-lg" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  if (!event) return null

  const tabs = [
    { value: 'overview', label: 'Visão geral', icon: LayoutList, show: true },
    {
      value: 'repertorio',
      label: 'Repertório',
      icon: Music2,
      count: songs.length,
      show: canSeeRepertoire,
    },
    { value: 'escala', label: 'Equipe', icon: Users, count: members.length, show: true },
    { value: 'midia', label: 'Mídias', icon: Images, count: medias.length, show: canSeeMedia },
    {
      value: 'tarefas',
      label: 'Tarefas',
      icon: ListChecks,
      count: taskAreas ? tasks.filter((t) => taskAreas.includes(t.team_area)).length : tasks.length,
      show: canSeeTasks,
    },
  ].filter((t) => t.show)
  const currentTab = tabs.some((t) => t.value === activeTab) ? activeTab : 'overview'

  return (
    <div className="space-y-5 pb-16">
      <EventHeader
        event={event}
        readiness={readiness}
        songsCount={songs.length}
        agents={center.agents}
        linkState={linkState}
        canEdit={canManageContent}
        canSync={canSyncHolyrics}
        isSyncing={isSyncing}
        isResolvingLink={isResolvingLink}
        onSync={handleSync}
        onResolveLink={handleResolveLink}
        onOpenTab={openTab}
      />

      <Tabs value={currentTab} onValueChange={openTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-full min-w-max justify-start gap-1 rounded-none border-b border-slate-200 bg-transparent p-0">
            {tabs.map(({ value, label, icon: Icon, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="group -mb-px gap-2 rounded-none border-b-2 border-transparent px-3.5 py-2.5 text-sm font-semibold text-slate-500 shadow-none hover:text-slate-800 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
                {count !== undefined && (
                  <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-bold text-slate-600 group-data-[state=active]:bg-teal-50 group-data-[state=active]:text-teal-700">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5">
          <OverviewTab
            event={event}
            readiness={readiness}
            members={members}
            songs={songs}
            medias={medias}
            moments={moments}
            runSheetAvailable={center.runSheetAvailable}
            agents={center.agents}
            canEdit={canManageContent}
            onChanged={center.reload}
            onOpenTab={openTab}
          />
        </TabsContent>

        {canSeeRepertoire && (
          <TabsContent value="repertorio" className="mt-5">
            <RepertoireTab
              event={event}
              songs={songs}
              library={center.library}
              members={members}
              churchMembers={center.churchMembers}
              moments={moments}
              canEdit={canManageContent}
              patch={center.patch}
              reload={center.reload}
            />
          </TabsContent>
        )}

        <TabsContent value="escala" className="mt-5">
          <TeamTab
            event={event}
            members={members}
            churchMembers={center.churchMembers}
            roles={center.roles}
            currentMemberId={currentMember?.id}
            canEdit={canManageContent}
            reload={center.reload}
          />
        </TabsContent>

        {canSeeMedia && (
          <TabsContent value="midia" className="mt-5">
            <MediaTab
              event={event}
              medias={medias}
              churchMembers={center.churchMembers}
              currentMemberId={currentMember?.id}
              canManage={canManageMedia}
              canOperate={canOperateMedia}
              patch={center.patch}
              reload={center.reload}
            />
          </TabsContent>
        )}

        {canSeeTasks && (
          <TabsContent value="tarefas" className="mt-5">
            <TasksTab
              event={event}
              tasks={tasks}
              churchMembers={center.churchMembers}
              allowedAreas={taskAreas}
              initialArea={taskArea}
              canCreate={canSeeAllTasks}
              canDelete={canManageContent}
              patch={center.patch}
              reload={center.reload}
            />
          </TabsContent>
        )}
      </Tabs>

      <SyncReportDialog
        report={syncReport}
        eventTitle={event.title}
        onClose={() => setSyncReport(null)}
      />
    </div>
  )
}
