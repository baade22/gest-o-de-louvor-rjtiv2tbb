import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Images, LayoutList, ListChecks, Music2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { computeEventReadiness, MEDIA_READY_STATUSES } from '@/lib/eventReadiness'
import { describeMediaSyncResult } from '@/lib/mediaPlaylistResult'
import {
  resolveHolyricsEvent,
  syncEventRepertoireWithHolyrics,
  waitHolyricsCommand,
  type ResolveHolyricsEventResponse,
} from '@/services/holyricsAgent'
import { listEventMedia, transferMediaToHolyricsAgent } from '@/services/media'
import type { MediaAsset, TeamArea } from '@/types'
import { EventHeader, type HolyricsLinkState } from './event-center/EventHeader'
import { OverviewTab } from './event-center/OverviewTab'
import { RepertoireTab } from './event-center/RepertoireTab'
import { TeamTab } from './event-center/TeamTab'
import { MediaTab } from './event-center/MediaTab'
import { TasksTab } from './event-center/TasksTab'
import {
  SyncReportDialog,
  type MediaReportItem,
  type SyncReport,
} from './event-center/SyncReportDialog'
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
  const { currentChurch, currentMember, can } = useAuth()

  // Quem vê e opera cada parte da central (chaves dos perfis de acesso)
  const canSeeRepertoire = can('louvor.repertorio.ver')
  const canSeeSound = can('culto.som.ver')
  const canSeeProjection = can('culto.projecao.ver')
  const canSeeLighting = can('culto.iluminacao.ver')
  const canSeeMedia = can('culto.midias.ver')
  // Incluir/ordenar/excluir mídia (igual à regra do servidor em media_assets)
  const canManageMedia = can('culto.midias.novo') || can('culto.midias.alterar')
  // Enviar ao computador e montar a playlist no Holyrics
  const canOperateMedia = canManageMedia || can('culto.midias.enviar')
  const canEditEvent = can('louvor.cultos.alterar')
  const canEditRepertoire = can('louvor.repertorio.alterar')
  const canEditTeam = can('louvor.escalas.alterar')
  const canSeeAllTasks = can('louvor.tarefas.alterar')
  const taskAreas: TeamArea[] | null = canSeeAllTasks
    ? null
    : ([
        canSeeSound && 'SOM',
        canSeeProjection && 'PROJECAO',
        canSeeLighting && 'ILUMINACAO',
        can('louvor.tarefas.ver') && canManageMedia && 'MIDIA',
      ].filter(Boolean) as TeamArea[])
  const canSeeTasks = taskAreas === null || taskAreas.length > 0
  const canSyncHolyrics = can('culto.computadores.enviar')

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
      label: isResolvingLink ? 'Vinculando ao Holyrics…' : 'Não vinculado ao Holyrics',
      tone: 'neutral',
      title:
        'O LouvorFlow vincula sozinho este culto ao culto do mesmo dia e horário na agenda do Holyrics quando o computador do Holyrics está ligado. Nada é criado lá.',
      canResolve: false,
    }
  }, [event, linkResult, canSyncHolyrics, isResolvingLink])

  // Vincula sozinho ao culto do Holyrics (mesmo dia e horário) assim que o Agent estiver online
  const autoLinkTried = useRef<string | null>(null)
  const agentOnline = Boolean(center.agents?.some((a) => a.status === 'ONLINE'))
  useEffect(() => {
    if (!event || event.holyrics_event_id || !canSyncHolyrics || !agentOnline) return
    if (autoLinkTried.current === event.id) return
    autoLinkTried.current = event.id
    linkEvent(true)
  }, [event?.id, event?.holyrics_event_id, canSyncHolyrics, agentOnline])

  /** Vincula ao culto do Holyrics. Devolve true se ficou vinculado. */
  const linkEvent = async (silent: boolean): Promise<boolean> => {
    if (!event || !currentChurch) return false
    setIsResolvingLink(true)
    try {
      const res = await resolveHolyricsEvent({ churchId: currentChurch.id, eventId: event.id })
      setLinkResult(res)
      if (!res.linked && !silent) {
        toast({
          title: 'Não achei este culto no Holyrics',
          description: res.message,
          variant: 'destructive',
        })
      }
      if (res.linked) await center.reload()
      return Boolean(res.linked)
    } catch (err: any) {
      if (!silent) {
        toast({
          title: 'Erro ao vincular ao Holyrics',
          description:
            err?.response?.data?.message ||
            err?.message ||
            'Não foi possível consultar a agenda do Holyrics.',
          variant: 'destructive',
        })
      }
      return false
    } finally {
      setIsResolvingLink(false)
    }
  }

  /** Mídias que ainda não estão no computador do Holyrics vão antes (uma por vez, em fila). */
  const transferPendingMedia = async (
    list: MediaAsset[],
  ): Promise<Record<string, { ok: boolean; error?: string }>> => {
    const out: Record<string, { ok: boolean; error?: string }> = {}
    const pending = list.filter((m) => !MEDIA_READY_STATUSES.includes(m.status))
    const queued: Array<{ media: MediaAsset; commandId: string }> = []
    for (const media of pending) {
      try {
        const res = await transferMediaToHolyricsAgent({
          mediaId: media.id,
          churchId: event!.church_id,
        })
        if (res.success && res.command_id) queued.push({ media, commandId: res.command_id })
        else out[media.id] = { ok: false, error: res.message || 'Não foi possível enviar.' }
      } catch (err: any) {
        out[media.id] = { ok: false, error: err?.message || 'Não foi possível enviar.' }
      }
    }
    for (const { media, commandId } of queued) {
      const done = await waitHolyricsCommand(commandId, 300000)
      if (done?.status === 'DONE') out[media.id] = { ok: true }
      else
        out[media.id] = {
          ok: false,
          error: done?.error || 'O computador do Holyrics não terminou de baixar a mídia a tempo.',
        }
    }
    return out
  }

  const handleSync = async () => {
    if (!event || !currentChurch) return
    setIsSyncing(true)
    try {
      // 1. Vincula ao culto do Holyrics, se ainda não estiver
      if (!event.holyrics_event_id) {
        const linked = await linkEvent(false)
        if (!linked) return
      }

      // 2. Mídias que ainda não estão no computador do Holyrics vão primeiro
      let mediaList: MediaAsset[] = []
      try {
        mediaList = await listEventMedia(currentChurch.id, event.id)
      } catch (_) {
        mediaList = medias
      }
      const transfers = await transferPendingMedia(mediaList)
      const transferredNow = new Set(
        Object.entries(transfers)
          .filter(([, r]) => r.ok)
          .map(([id]) => id),
      )

      // 3. Músicas e, em seguida, a playlist inteira do culto
      const res = await syncEventRepertoireWithHolyrics({
        churchId: currentChurch.id,
        eventId: event.id,
      })
      const commandId = res.playlist_sync?.command_id
      const mediaRows = (state: MediaReportItem['state'], detail: string): MediaReportItem[] =>
        mediaList.map((m) => ({
          id: m.id,
          name: m.name,
          state: transfers[m.id] && !transfers[m.id].ok ? 'error' : state,
          detail:
            transfers[m.id] && !transfers[m.id].ok
              ? `Não foi para o computador do Holyrics: ${transfers[m.id].error}`
              : detail,
        }))

      setSyncReport({
        items: res.items || [],
        summary: res.summary || null,
        message: res.message,
        hasErrors: Boolean(res.has_errors) || !res.success,
        media: mediaRows('waiting', 'Colocando na playlist do culto…'),
        playlist: commandId
          ? {
              state: 'waiting',
              title: 'Montando a playlist do culto no Holyrics…',
              description: 'Títulos, músicas e mídias na ordem do LouvorFlow.',
            }
          : null,
      })
      await center.reload()
      if (!commandId) {
        setSyncReport((prev) => prev && { ...prev, media: mediaRows('error', res.message) })
        return
      }

      // 4. Resultado da playlist (músicas, mídias e títulos)
      const done = await waitHolyricsCommand(commandId)
      if (!done) {
        setSyncReport(
          (prev) =>
            prev && {
              ...prev,
              playlist: {
                state: 'error',
                title: 'O Holyrics ainda não respondeu',
                description:
                  'A playlist do culto será montada assim que o LouvorFlow Agent e o Holyrics responderem.',
              },
              media: mediaRows('waiting', 'Aguardando o Holyrics.'),
            },
        )
        return
      }
      const summary = describeMediaSyncResult(done)
      const byName = new Map<string, any>()
      const resultItems: any[] = Array.isArray(done.result?.items) ? done.result.items : []
      for (const it of resultItems) byName.set(String(it?.name || '').toLowerCase(), it)
      const fresh = await listEventMedia(currentChurch.id, event.id).catch(() => mediaList)
      const rows: MediaReportItem[] = mediaList.map((m) => {
        const t = transfers[m.id]
        if (t && !t.ok)
          return {
            id: m.id,
            name: m.name,
            state: 'error',
            detail: `Não foi para o computador do Holyrics: ${t.error}`,
          }
        const f = fresh.find((x) => x.id === m.id) || m
        const it =
          byName.get(String(f.holyrics_filename || '').toLowerCase()) ||
          byName.get(String(f.name || '').toLowerCase())
        const sent = transferredNow.has(m.id) ? 'Enviada ao computador e ' : ''
        if (it?.status === 'ADDED')
          return {
            id: m.id,
            name: m.name,
            state: 'ok',
            detail: `${sent || ''}${sent ? 'colocada' : 'Colocada'} na playlist do culto.`,
          }
        if (it?.status === 'ALREADY_PRESENT')
          return {
            id: m.id,
            name: m.name,
            state: 'ok',
            detail: sent
              ? 'Enviada ao computador; já estava na playlist.'
              : 'Já estava na playlist.',
          }
        if (it)
          return {
            id: m.id,
            name: m.name,
            state: 'error',
            detail: String(it.error || 'Não entrou na playlist do culto.'),
          }
        return {
          id: m.id,
          name: m.name,
          state: done.status === 'FAILED' ? 'error' : 'ok',
          detail:
            done.status === 'FAILED'
              ? 'Não entrou: a playlist do culto não foi montada.'
              : 'Na playlist do culto.',
        }
      })
      setSyncReport(
        (prev) =>
          prev && {
            ...prev,
            playlist: {
              state: summary.ok ? 'ok' : 'error',
              title: summary.title,
              description: summary.description,
            },
            media: rows,
          },
      )
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
    if (isResolvingLink) return
    const linked = await linkEvent(false)
    if (linked) toast({ title: 'Culto vinculado ao Holyrics' })
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
        mediaCount={medias.length}
        agents={center.agents}
        linkState={linkState}
        canEdit={canEditEvent}
        canSync={canSyncHolyrics}
        isSyncing={isSyncing}
        isResolvingLink={isResolvingLink}
        onSync={handleSync}
        onResolveLink={handleResolveLink}
        onOpenTab={openTab}
      />

      <Tabs value={currentTab} onValueChange={openTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-full justify-start sm:min-w-max gap-1 rounded-none border-b border-slate-200 bg-transparent p-0">
            {tabs.map(({ value, label, icon: Icon, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative min-w-0 flex-1 flex-col gap-1 whitespace-normal px-1 text-center text-[11px] leading-tight sm:flex-none sm:flex-row sm:whitespace-nowrap sm:text-sm sm:leading-normal group -mb-px sm:gap-2 rounded-none border-b-2 border-transparent sm:px-3.5 py-2.5 font-semibold text-slate-500 shadow-none hover:text-slate-800 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
                {count !== undefined && (
                  <span className="absolute left-1/2 top-1 ml-2 sm:static sm:ml-0 rounded-full bg-slate-100 px-1.5 text-[11px] font-bold text-slate-600 group-data-[state=active]:bg-teal-50 group-data-[state=active]:text-teal-700">
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
            canEdit={canEditEvent || canEditRepertoire}
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
              canEdit={canEditRepertoire}
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
            canEdit={canEditTeam}
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
              canDelete={can('louvor.tarefas.excluir')}
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
