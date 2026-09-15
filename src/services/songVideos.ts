import pb from '@/lib/pocketbase/client'
import type { SongVideo } from '@/types'
import { extractYouTubeVideoId } from './youtube'

export interface CreateSongVideoInput {
  church_id: string
  song_id: string
  youtube_video_id: string
  title?: string
  channel_name?: string
  thumbnail_url?: string
  is_primary?: boolean
}

/**
 * Busca todos os vídeos cadastrados para uma música.
 */
export async function getVideosForSong(songId: string): Promise<SongVideo[]> {
  if (!songId) return []
  return await pb.collection('song_videos').getFullList<SongVideo>({
    filter: `song_id = "${songId}"`,
    sort: '-is_primary,-created',
  })
}

/**
 * Adiciona um vídeo de referência à música.
 * Se for marcado como principal, desmarca os anteriores.
 */
export async function addVideoToSong(input: CreateSongVideoInput): Promise<SongVideo> {
  const cleanId = extractYouTubeVideoId(input.youtube_video_id)
  if (!cleanId) {
    throw new Error('ID ou link do vídeo do YouTube inválido.')
  }

  // Se for o primeiro vídeo ou for marcado como principal
  const existing = await getVideosForSong(input.song_id)
  const shouldBePrimary = input.is_primary || existing.length === 0

  if (shouldBePrimary) {
    for (const v of existing) {
      if (v.is_primary) {
        await pb.collection('song_videos').update(v.id, { is_primary: false })
      }
    }
  }

  const record = await pb.collection('song_videos').create<SongVideo>({
    church_id: input.church_id,
    song_id: input.song_id,
    youtube_video_id: cleanId,
    title: input.title || 'Vídeo de Referência',
    channel_name: input.channel_name || '',
    thumbnail_url: input.thumbnail_url || `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`,
    is_primary: shouldBePrimary,
  })

  // Sincroniza youtube_url da tabela songs para retrocompatibilidade
  if (shouldBePrimary) {
    try {
      await pb.collection('songs').update(input.song_id, {
        youtube_url: `https://www.youtube.com/watch?v=${cleanId}`,
      })
    } catch {
      /* intentionally ignored */
    }
  }

  return record
}

/**
 * Define um vídeo específico como o principal da música.
 */
export async function setPrimaryVideo(songId: string, videoRecordId: string): Promise<void> {
  const videos = await getVideosForSong(songId)
  let selectedVideo: SongVideo | undefined

  for (const v of videos) {
    if (v.id === videoRecordId) {
      selectedVideo = v
      if (!v.is_primary) {
        await pb.collection('song_videos').update(v.id, { is_primary: true })
      }
    } else if (v.is_primary) {
      await pb.collection('song_videos').update(v.id, { is_primary: false })
    }
  }

  if (selectedVideo) {
    try {
      await pb.collection('songs').update(songId, {
        youtube_url: `https://www.youtube.com/watch?v=${selectedVideo.youtube_video_id}`,
      })
    } catch {
      /* intentionally ignored */
    }
  }
}

/**
 * Remove um vídeo de referência da música.
 * Se o removido era o principal e sobram outros, define o mais antigo/primeiro como principal.
 */
export async function removeVideoFromSong(
  songId: string,
  videoRecordId: string,
): Promise<SongVideo | null> {
  const videos = await getVideosForSong(songId)
  const target = videos.find((v) => v.id === videoRecordId)
  const remaining = videos.filter((v) => v.id !== videoRecordId)

  await pb.collection('song_videos').delete(videoRecordId)

  if (target?.is_primary) {
    if (remaining.length > 0) {
      const newPrimary = remaining[0]
      await pb.collection('song_videos').update(newPrimary.id, { is_primary: true })
      try {
        await pb.collection('songs').update(songId, {
          youtube_url: `https://www.youtube.com/watch?v=${newPrimary.youtube_video_id}`,
        })
      } catch {
        /* intentionally ignored */
      }
      return newPrimary
    } else {
      try {
        await pb.collection('songs').update(songId, { youtube_url: '' })
      } catch {
        /* intentionally ignored */
      }
      return null
    }
  }

  return remaining.find((v) => v.is_primary) || null
}
