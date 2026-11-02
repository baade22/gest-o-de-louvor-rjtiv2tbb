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

// ---------------------------------------------------------------------------
// Seções da playlist do culto (títulos do Holyrics: LOUVOR, AVISOS, ...)
// Um título é um item { type: "title", name } na media_playlist. Cada seção do
// LouvorFlow vira um título seguido dos seus itens, na ordem informada.
// ---------------------------------------------------------------------------

export type SectionItem =
  | { kind: 'song'; song_id: string }
  | { kind: 'media'; type: string; name: string }

export interface PlaylistSection {
  title: string
  items: SectionItem[]
}

/** "AVISOS!!", "Avisos" e "avisos" são o mesmo título. Ignora acento, caixa e símbolos. */
export function normalizeTitle(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Casa títulos iguais ou que diferem só por um "s" no fim (Aviso/Avisos). */
export function titleMatches(a: string, b: string): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na + 's' === nb || nb + 's' === na
}

export function isTitleItem(item: PlaylistItem): boolean {
  return String(item?.type || '').toLowerCase() === 'title'
}

export function findTitleIndex(playlist: PlaylistItem[], title: string): number {
  return playlist.findIndex((it) => isTitleItem(it) && titleMatches(it.name || '', title))
}

const mediaBaseName = (name: string) =>
  normalizeName(
    String(name || '')
      .split(/[\\/]/)
      .pop() || '',
  )

/** Este item da playlist é o item da seção? Música por song_id; mídia pelo nome do arquivo. */
export function playlistItemMatches(item: PlaylistItem, wanted: SectionItem): boolean {
  if (wanted.kind === 'song') return itemSongId(item) === String(wanted.song_id).trim()
  if (isTitleItem(item) || itemSongId(item)) return false
  const name = mediaBaseName(item.name || '')
  return !!name && name === mediaBaseName(wanted.name)
}

/** Itens da seção que já estão na playlist, na ordem da seção (cada um com o item real). */
export function presentSectionItems(
  playlist: PlaylistItem[],
  section: PlaylistSection,
): Array<{ wanted: SectionItem; item: PlaylistItem }> {
  const out: Array<{ wanted: SectionItem; item: PlaylistItem }> = []
  for (const wanted of section.items) {
    const item = playlist.find((it) => playlistItemMatches(it, wanted))
    if (item) out.push({ wanted, item })
  }
  return out
}

/** Os itens já estão logo abaixo do título, nesta ordem? */
export function sectionInPlace(
  playlist: PlaylistItem[],
  titleIndex: number,
  present: Array<{ wanted: SectionItem }>,
): boolean {
  return present.every((p, i) => {
    const it = playlist[titleIndex + 1 + i]
    return !!it && playlistItemMatches(it, p.wanted)
  })
}

/**
 * Onde criar o título que falta: antes do título da próxima seção (na ordem do
 * LouvorFlow) que já existe na playlist; se nenhuma existir, no fim.
 */
export function titleInsertIndex(
  playlist: PlaylistItem[],
  sections: PlaylistSection[],
  sectionIndex: number,
): number {
  for (let i = sectionIndex + 1; i < sections.length; i++) {
    const idx = findTitleIndex(playlist, sections[i].title)
    if (idx >= 0) return idx
  }
  return playlist.length
}

/** Item no formato do AddToPlaylist para reinserir o item que já estava na playlist. */
export function toAddItem(
  wanted: SectionItem,
  current?: PlaylistItem,
): { type: string; id?: string; name?: string } {
  if (wanted.kind === 'song') return { type: 'song', id: String(wanted.song_id) }
  // Usa o nome do arquivo que o LouvorFlow conhece (é o que o AddToPlaylist aceita);
  // o name do item na playlist pode vir em outro formato.
  return {
    type: String(wanted.type || current?.type || 'video').toLowerCase(),
    name: String(wanted.name || current?.name || ''),
  }
}

/** Quantas vezes o item da seção aparece na playlist. */
export function countMatches(playlist: PlaylistItem[], wanted: SectionItem): number {
  return playlist.filter((it) => playlistItemMatches(it, wanted)).length
}

/** Resumo curto da playlist para diagnóstico. */
export function summarizePlaylist(playlist: PlaylistItem[]): string[] {
  return playlist
    .slice(0, 60)
    .map((it) =>
      isTitleItem(it)
        ? `# ${it.name || ''}`
        : itemSongId(it)
          ? `song ${itemSongId(it)}`
          : `${it.type || '?'} ${it.name || ''}`,
    )
}

/**
 * Onde criar o título que falta: logo antes do primeiro item da seção que já está na
 * playlist. Se esse item estiver acima do fim de uma seção anterior do LouvorFlow, usa a
 * regra de ordem das seções (antes da próxima seção conhecida, senão no fim).
 */
export function titleIndexForSection(
  playlist: PlaylistItem[],
  sections: PlaylistSection[],
  sectionIndex: number,
): number {
  let prevEnd = 0
  for (let i = 0; i < sectionIndex; i++) {
    const t = findTitleIndex(playlist, sections[i].title)
    if (t >= 0) prevEnd = Math.max(prevEnd, t + 1)
    for (const w of sections[i].items) {
      playlist.forEach((it, idx) => {
        if (playlistItemMatches(it, w)) prevEnd = Math.max(prevEnd, idx + 1)
      })
    }
  }
  const first = playlist.findIndex((it) =>
    sections[sectionIndex].items.some((w) => playlistItemMatches(it, w)),
  )
  if (first >= prevEnd) return first
  return Math.max(prevEnd, titleInsertIndex(playlist, sections, sectionIndex))
}

export function parseSections(raw: any): PlaylistSection[] {
  return (Array.isArray(raw) ? raw : [])
    .map((s: any) => ({
      title: String(s?.title || '').trim(),
      items: Array.isArray(s?.items) ? s.items : [],
    }))
    .filter((s: PlaylistSection) => s.title && s.items.length > 0)
}

/** Fim do bloco de um título: posição do próximo título (ou o fim da playlist). */
export function sectionBlockEnd(playlist: PlaylistItem[], titleIndex: number): number {
  for (let i = titleIndex + 1; i < playlist.length; i++) {
    if (isTitleItem(playlist[i])) return i
  }
  return playlist.length
}

/**
 * Onde criar o título de uma seção que ainda não tem itens: logo depois do bloco da seção
 * anterior do LouvorFlow que existir; se nenhuma existir, antes da próxima conhecida ou no fim.
 */
export function missingTitleIndex(
  playlist: PlaylistItem[],
  sections: PlaylistSection[],
  sectionIndex: number,
): number {
  for (let j = sectionIndex - 1; j >= 0; j--) {
    const t = findTitleIndex(playlist, sections[j].title)
    if (t >= 0) return sectionBlockEnd(playlist, t)
  }
  return titleInsertIndex(playlist, sections, sectionIndex)
}

// ---------------------------------------------------------------------------------------
// Espelho (Agent 0.0.45+): deixa a playlist do culto igual ao LouvorFlow.
//
// O LouvorFlow cuida dos títulos das suas seções (LOUVOR, AVISOS...) e das músicas e
// mídias que ficam nessas seções (ou antes de qualquer título). Tudo o resto é do
// Holyrics e fica intacto: seções com outro título (ex.: OFERTA) com tudo o que estiver
// embaixo delas, e itens de outro tipo (versículo, texto, anúncio...).
// ---------------------------------------------------------------------------------------

export const LOUVORFLOW_SECTION_TITLES = [
  'LOUVOR',
  'AVISOS',
  'ANIVERSARIANTES',
  'AGENDA',
  'EVENTOS',
  'CULTOS',
  'VÍDEO ESPECIAL',
  'OUTROS',
]

const MEDIA_TYPES = new Set(['video', 'image', 'audio', 'file', 'automatic_presentation'])

export type DesiredItem =
  | { kind: 'title'; name: string }
  | { kind: 'song'; song_id: string }
  | { kind: 'media'; type: string; name: string }

/** Lista final do LouvorFlow: título de cada seção seguido dos seus itens. */
export function desiredFromSections(sections: PlaylistSection[]): DesiredItem[] {
  const out: DesiredItem[] = []
  for (const s of sections) {
    out.push({ kind: 'title', name: s.title })
    for (const it of s.items) {
      if (it.kind === 'song') out.push({ kind: 'song', song_id: String(it.song_id) })
      else out.push({ kind: 'media', type: String(it.type || 'video'), name: String(it.name) })
    }
  }
  return out
}

/** O item da playlist é este item desejado? */
export function desiredMatches(item: PlaylistItem, wanted: DesiredItem): boolean {
  if (wanted.kind === 'title') {
    return isTitleItem(item) && normalizeTitle(item.name || '') === normalizeTitle(wanted.name)
  }
  return playlistItemMatches(item, wanted)
}

/** Quais itens da playlist atual pertencem ao LouvorFlow (os outros nunca são mexidos). */
export function managedFlags(playlist: PlaylistItem[], knownTitles: string[]): boolean[] {
  const isKnownTitle = (name: string) => knownTitles.some((t) => titleMatches(name, t))
  let blockKnown = true
  return playlist.map((it) => {
    if (isTitleItem(it)) {
      blockKnown = isKnownTitle(it.name || '')
      return blockKnown
    }
    const type = String(it.type || '').toLowerCase()
    const songOrMedia = type === 'song' || MEDIA_TYPES.has(type)
    return blockKnown && songOrMedia
  })
}

export function toAddItemFromDesired(d: DesiredItem): { type: string; id?: string; name?: string } {
  if (d.kind === 'title') return { type: 'title', name: d.name }
  if (d.kind === 'song') return { type: 'song', id: d.song_id }
  return { type: d.type, name: d.name }
}

export interface MirrorPlan {
  /** Itens do começo que já estão certos. */
  keep: number
  /** Posições (na playlist atual) a remover, da maior para a menor. */
  removeIndexes: number[]
  /** Itens a inserir na posição `keep`, nesta ordem. */
  insert: DesiredItem[]
  /** Chaves da playlist esperada no fim (para conferir). */
  expectedKeys: string[]
}

/** Chave curta de um item para comparar playlists. */
export function playlistKey(item: PlaylistItem): string {
  if (isTitleItem(item)) return `#${normalizeTitle(item.name || '')}`
  const sid = itemSongId(item)
  if (sid) return `song:${sid}`
  const type = String(item.type || '').toLowerCase()
  if (MEDIA_TYPES.has(type)) return `media:${mediaBaseName(item.name || '')}`
  return `${type}:${String(item.id || item.name || '')}`
}

export function desiredKey(d: DesiredItem): string {
  if (d.kind === 'title') return `#${normalizeTitle(d.name)}`
  if (d.kind === 'song') return `song:${String(d.song_id).trim()}`
  return `media:${mediaBaseName(d.name)}`
}

/**
 * Plano para a playlist ficar igual ao LouvorFlow: mantém o começo que já está certo,
 * tira os itens do LouvorFlow que estão fora do lugar (ou que saíram do culto) e insere o
 * resto na ordem certa. Itens do Holyrics que não são do LouvorFlow ficam depois.
 */
export function planMirror(
  playlist: PlaylistItem[],
  desired: DesiredItem[],
  knownTitles: string[] = LOUVORFLOW_SECTION_TITLES,
): MirrorPlan {
  const managed = managedFlags(playlist, knownTitles)
  let keep = 0
  while (
    keep < playlist.length &&
    keep < desired.length &&
    managed[keep] &&
    desiredMatches(playlist[keep], desired[keep])
  ) {
    keep++
  }
  const removeIndexes: number[] = []
  for (let i = playlist.length - 1; i >= keep; i--) {
    if (managed[i]) removeIndexes.push(i)
  }
  const insert = desired.slice(keep)
  const foreignAfter = playlist.filter((_, i) => i >= keep && !managed[i])
  const expectedKeys = [
    ...playlist.slice(0, keep).map(playlistKey),
    ...insert.map(desiredKey),
    ...foreignAfter.map(playlistKey),
  ]
  return { keep, removeIndexes, insert, expectedKeys }
}
