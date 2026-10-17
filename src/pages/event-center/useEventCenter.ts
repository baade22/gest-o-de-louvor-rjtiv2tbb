import { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type {
  ChurchMember,
  EventItem,
  EventMember,
  EventMoment,
  EventSong,
  EventTask,
  MediaAsset,
  Role,
  Song,
} from '@/types'
import { listEventTasks } from '@/services/tasks'
import { listEventMedia } from '@/services/media'
import { listHolyricsAgents, type HolyricsAgentInfo } from '@/services/holyricsAgent'

export interface EventCenterData {
  event: EventItem | null
  songs: EventSong[]
  members: EventMember[]
  moments: EventMoment[]
  /** false enquanto a migração do roteiro não estiver aplicada no servidor. */
  runSheetAvailable: boolean
  tasks: EventTask[]
  medias: MediaAsset[]
  library: Song[]
  churchMembers: ChurchMember[]
  roles: Role[]
  /** null = sem permissão para ver os computadores. */
  agents: HolyricsAgentInfo[] | null
}

const EMPTY: EventCenterData = {
  event: null,
  songs: [],
  members: [],
  moments: [],
  runSheetAvailable: true,
  tasks: [],
  medias: [],
  library: [],
  churchMembers: [],
  roles: [],
  agents: null,
}

const byPresentationOrder = (a: MediaAsset, b: MediaAsset) =>
  (a.presentation_order ?? Number.MAX_SAFE_INTEGER) -
    (b.presentation_order ?? Number.MAX_SAFE_INTEGER) || a.created.localeCompare(b.created)

/**
 * Carrega tudo o que a Central do Culto mostra. Partes opcionais (tarefas,
 * mídias, roteiro, computadores) falham sozinhas sem derrubar a tela.
 */
export function useEventCenter(
  eventId: string | undefined,
  churchId: string | undefined,
  loadAgents: boolean,
) {
  const [data, setData] = useState<EventCenterData>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const reload = useCallback(async () => {
    if (!eventId || !churchId) return
    try {
      const [event, songs, members, library, churchMembers, roles] = await Promise.all([
        pb.collection('events').getOne<EventItem>(eventId),
        pb.collection('event_songs').getFullList<EventSong>({
          filter: `event_id = "${eventId}"`,
          expand: 'song_id,lead_vocal.user_id',
          sort: 'order',
        }),
        pb.collection('event_members').getFullList<EventMember>({
          filter: `event_id = "${eventId}"`,
          expand: 'member_id.user_id,role_id',
          sort: 'created',
        }),
        pb.collection('songs').getFullList<Song>({
          filter: `church_id = "${churchId}"`,
          sort: 'title',
        }),
        pb.collection('church_members').getFullList<ChurchMember>({
          filter: `church_id = "${churchId}" && is_active = true`,
          expand: 'user_id',
        }),
        pb.collection('roles').getFullList<Role>({
          filter: `church_id = "${churchId}"`,
          sort: 'name',
        }),
      ])

      const [tasks, medias, moments, agents] = await Promise.all([
        listEventTasks(churchId, eventId).catch((e) => {
          console.error('Erro ao listar tarefas:', e)
          return [] as EventTask[]
        }),
        listEventMedia(churchId, eventId).catch((e) => {
          console.error('Erro ao listar mídias:', e)
          return [] as MediaAsset[]
        }),
        pb
          .collection('event_moments')
          .getFullList<EventMoment>({ filter: `event_id = "${eventId}"`, sort: 'order,created' })
          .then((items) => ({ items, available: true }))
          .catch(() => ({ items: [] as EventMoment[], available: false })),
        loadAgents ? listHolyricsAgents(churchId).catch(() => null) : Promise.resolve(null),
      ])

      setData({
        event,
        songs,
        members,
        moments: moments.items,
        runSheetAvailable: moments.available,
        tasks,
        medias: [...medias].sort(byPresentationOrder),
        library,
        churchMembers,
        roles,
        agents,
      })
      setError(null)
    } catch (err) {
      console.error(err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [eventId, churchId, loadAgents])

  useEffect(() => {
    setIsLoading(true)
    reload()
  }, [reload])

  /** Atualização otimista local (ex.: reordenar) antes de salvar. */
  const patch = useCallback((updater: (prev: EventCenterData) => Partial<EventCenterData>) => {
    setData((prev) => ({ ...prev, ...updater(prev) }))
  }, [])

  return { ...data, isLoading, error, reload, patch }
}

export type EventCenter = ReturnType<typeof useEventCenter>
