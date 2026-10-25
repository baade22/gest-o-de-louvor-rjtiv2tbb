// Regras puras sobre a playlist de uma ocorrência de culto no Holyrics.
//
// A playlist do culto vem de GetSchedules({ month, year }): a ocorrência é achada por
// metadata.event.id e os itens ficam em media_playlist. Cada música aparece como
// { id: "zMYT...", type: "song", song_id: "1791856351158", reference_id: "..." }:
// o id é do item na playlist (é ele que RemoveFromMediaPlaylist recebe) e o ID da música
// no acervo é song_id (ou reference_id). Mídias aparecem com type video/image/audio e name.

export interface PlaylistItem {
  id?: string
  type?: string
  name?: string
  song_id?: string
  reference_id?: string
  [key: string]: any
}

export function scheduleOccurrenceId(item: any): string {
  if (!item || typeof item !== 'object') return ''
  const eventMeta = item.metadata?.event
  if (eventMeta && typeof eventMeta === 'object' && eventMeta.id) {
    return String(eventMeta.id).trim()
  }
  if (item.event && typeof item.event === 'object' && item.event.id) {
    return String(item.event.id).trim()
  }
  return String(item.id || '').trim()
}

export function findEventSchedule(schedules: any[], holyricsEventId: string): any | null {
  const target = String(holyricsEventId || '').trim()
  if (!target || !Array.isArray(schedules)) return null
  return schedules.find((s) => scheduleOccurrenceId(s) === target) || null
}

export function getMediaPlaylist(schedule: any): PlaylistItem[] {
  return Array.isArray(schedule?.media_playlist) ? schedule.media_playlist : []
}

export function itemSongId(item: PlaylistItem): string {
  if (!item || String(item.type || '').toLowerCase() !== 'song') return ''
  return String(item.song_id || item.reference_id || '').trim()
}

const normalizeName = (name: string) =>
  String(name || '')
    .trim()
    .toLowerCase()

/**
 * IDs dos itens da playlist que correspondem às músicas (por song_id) e às mídias
 * (por nome de arquivo) informadas.
 */
export function findItemIdsToRemove(
  playlist: PlaylistItem[],
  songIds: string[],
  mediaNames: string[],
): string[] {
  const songSet = new Set(songIds.map((s) => String(s).trim()).filter(Boolean))
  const nameSet = new Set(mediaNames.map(normalizeName).filter(Boolean))
  const ids: string[] = []
  for (const item of playlist) {
    const itemId = String(item?.id || '').trim()
    if (!itemId) continue
    const songId = itemSongId(item)
    if (songId) {
      if (songSet.has(songId)) ids.push(itemId)
      continue
    }
    if (nameSet.has(normalizeName(item.name || ''))) ids.push(itemId)
  }
  return ids
}

export interface ReorderPlan {
  /** Itens (por id) a remover antes de reinserir na ordem certa */
  removeIds: string[]
  /** Reinserções, em ordem crescente de índice */
  inserts: Array<{ index: number; songId: string }>
}

/**
 * Plano para deixar as músicas do repertório na ordem informada.
 * Só mexe nas músicas do repertório: elas passam a ocupar, na ordem do repertório,
 * as mesmas posições que já ocupavam na playlist. Mídias e outros itens não se movem.
 * Retorna null quando a ordem já está certa.
 */
export function planSongReorder(
  playlist: PlaylistItem[],
  orderedSongIds: string[],
): ReorderPlan | null {
  const wanted: string[] = []
  for (const raw of orderedSongIds) {
    const id = String(raw || '').trim()
    if (id && !wanted.includes(id)) wanted.push(id)
  }
  const wantedSet = new Set(wanted)

  const positions: number[] = []
  const current: Array<{ itemId: string; songId: string }> = []
  const seen = new Set<string>()
  playlist.forEach((item, index) => {
    const songId = itemSongId(item)
    if (!songId || !wantedSet.has(songId) || seen.has(songId)) return
    seen.add(songId)
    positions.push(index)
    current.push({ itemId: String(item.id || ''), songId })
  })

  const target = wanted.filter((id) => seen.has(id))
  const alreadyOrdered = current.every((c, i) => c.songId === target[i])
  if (alreadyOrdered) return null

  return {
    removeIds: current.map((c) => c.itemId).filter(Boolean),
    inserts: target.map((songId, i) => ({ index: positions[i], songId })),
  }
}
