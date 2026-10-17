/**
 * Prontidão do culto: uma nota de 0 a 100 e a lista do que ainda falta.
 *
 * Cada parte vale o mesmo peso. Mídias e tarefas só entram na conta quando o
 * culto tem alguma, para um culto sem mídias não parecer "menos pronto".
 */
import type { EventMember, EventSong, EventTask, MediaAsset } from '@/types'

export interface ReadinessPart {
  done: number
  total: number
  /** 0–1 */
  ratio: number
}

export type AttentionKind =
  | 'NO_TEAM'
  | 'PENDING_MEMBERS'
  | 'DECLINED_MEMBERS'
  | 'EMPTY_REPERTOIRE'
  | 'SONG_SYNC_ERROR'
  | 'MEDIA_NOT_TRANSFERRED'
  | 'URGENT_TASKS'

export interface AttentionItem {
  kind: AttentionKind
  count: number
  title: string
  detail?: string
  /** Aba da central que resolve o item. */
  tab: 'repertorio' | 'escala' | 'midia' | 'tarefas'
}

export interface EventReadiness {
  score: number
  team: ReadinessPart
  repertoire: ReadinessPart
  media?: ReadinessPart
  tasks?: ReadinessPart
  attention: AttentionItem[]
}

export interface ReadinessInput {
  members: Pick<EventMember, 'status' | 'expand'>[]
  songs: Pick<EventSong, 'holyrics_status' | 'expand'>[]
  medias?: Pick<MediaAsset, 'status' | 'name'>[]
  tasks?: Pick<EventTask, 'status' | 'priority' | 'title'>[]
}

/** Mídia que já chegou ao computador do Holyrics. */
export const MEDIA_READY_STATUSES = ['BAIXADA', 'IMPORTADA_HOLYRICS', 'CONCLUIDA']

const part = (done: number, total: number): ReadinessPart => ({
  done,
  total,
  ratio: total > 0 ? done / total : 0,
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function listNames(names: string[], max = 3): string {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} e mais ${rest}`
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`
}

function memberLabel(m: ReadinessInput['members'][number]): string {
  const name = m.expand?.member_id?.expand?.user_id?.name?.split(' ')[0] || 'Membro'
  const role = m.expand?.role_id?.name
  return role ? `${name} (${role.toLowerCase()})` : name
}

export function computeEventReadiness(input: ReadinessInput): EventReadiness {
  const { members, songs, medias = [], tasks = [] } = input

  const confirmed = members.filter((m) => m.status === 'CONFIRMADO')
  const pending = members.filter((m) => m.status === 'PENDENTE')
  const declined = members.filter((m) => m.status === 'RECUSADO')
  const team = part(confirmed.length, members.length)

  // Repertório conta como pronto assim que tem pelo menos uma música.
  const repertoire: ReadinessPart = {
    done: songs.length,
    total: songs.length,
    ratio: songs.length > 0 ? 1 : 0,
  }
  const songErrors = songs.filter((s) => s.holyrics_status === 'ERROR')

  const readyMedias = medias.filter((m) => MEDIA_READY_STATUSES.includes(m.status))
  const notTransferred = medias.filter((m) => !MEDIA_READY_STATUSES.includes(m.status))
  const media = medias.length > 0 ? part(readyMedias.length, medias.length) : undefined

  const activeTasks = tasks.filter((t) => t.status !== 'CANCELADA')
  const doneTasks = activeTasks.filter((t) => t.status === 'CONCLUIDA')
  const taskPart = activeTasks.length > 0 ? part(doneTasks.length, activeTasks.length) : undefined
  const urgentOpen = activeTasks.filter(
    (t) => t.status !== 'CONCLUIDA' && (t.priority === 'URGENTE' || t.priority === 'ALTA'),
  )

  const ratios = [team.ratio, repertoire.ratio]
  if (media) ratios.push(media.ratio)
  if (taskPart) ratios.push(taskPart.ratio)
  const score = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)

  const attention: AttentionItem[] = []
  if (members.length === 0) {
    attention.push({ kind: 'NO_TEAM', count: 1, title: 'Ninguém escalado ainda', tab: 'escala' })
  }
  if (pending.length > 0) {
    attention.push({
      kind: 'PENDING_MEMBERS',
      count: pending.length,
      title: `${plural(pending.length, 'pessoa', 'pessoas')} sem resposta`,
      detail: listNames(pending.map(memberLabel)),
      tab: 'escala',
    })
  }
  if (declined.length > 0) {
    attention.push({
      kind: 'DECLINED_MEMBERS',
      count: declined.length,
      title: `${plural(declined.length, 'pessoa recusou', 'pessoas recusaram')} a escala`,
      detail: `Encontre ${declined.length === 1 ? 'um substituto' : 'substitutos'}: ${listNames(declined.map(memberLabel))}`,
      tab: 'escala',
    })
  }
  if (songs.length === 0) {
    attention.push({
      kind: 'EMPTY_REPERTOIRE',
      count: 1,
      title: 'Repertório vazio',
      detail: 'Escolha as músicas deste culto',
      tab: 'repertorio',
    })
  }
  if (songErrors.length > 0) {
    attention.push({
      kind: 'SONG_SYNC_ERROR',
      count: songErrors.length,
      title: `${plural(songErrors.length, 'música', 'músicas')} com erro no Holyrics`,
      detail: listNames(songErrors.map((s) => s.expand?.song_id?.title || 'Música')),
      tab: 'repertorio',
    })
  }
  if (notTransferred.length > 0) {
    attention.push({
      kind: 'MEDIA_NOT_TRANSFERRED',
      count: notTransferred.length,
      title: `${plural(notTransferred.length, 'mídia não transferida', 'mídias não transferidas')}`,
      detail: listNames(notTransferred.map((m) => m.name)),
      tab: 'midia',
    })
  }
  if (urgentOpen.length > 0) {
    attention.push({
      kind: 'URGENT_TASKS',
      count: urgentOpen.length,
      title: `${plural(urgentOpen.length, 'tarefa importante aberta', 'tarefas importantes abertas')}`,
      detail: listNames(urgentOpen.map((t) => t.title)),
      tab: 'tarefas',
    })
  }

  return { score, team, repertoire, media, tasks: taskPart, attention }
}

/** Soma das pendências mostrada como "N pendências". */
export function countPendencies(readiness: EventReadiness): number {
  return readiness.attention.reduce((sum, item) => sum + item.count, 0)
}
