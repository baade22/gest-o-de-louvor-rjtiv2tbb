import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  getVideosForSong,
  addVideoToSong,
  setPrimaryVideo,
  removeVideoFromSong,
} from './songVideos'

describe('Serviço de Gestão de Vídeos da Música (song_videos)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lista vídeos de uma música ordenando por principal', async () => {
    const mockList = [
      { id: 'v1', song_id: 's1', youtube_video_id: 'vid1', is_primary: true },
      { id: 'v2', song_id: 's1', youtube_video_id: 'vid2', is_primary: false },
    ]

    const collectionSpy = vi.spyOn(pb, 'collection').mockReturnValue({
      getFullList: vi.fn().mockResolvedValueOnce(mockList),
    } as any)

    const list = await getVideosForSong('s1')
    expect(list).toEqual(mockList)
    expect(collectionSpy).toHaveBeenCalledWith('song_videos')
  })

  it('adiciona primeiro vídeo como principal automaticamente', async () => {
    const updateSpy = vi.fn().mockResolvedValue({})
    const createSpy = vi.fn().mockResolvedValue({
      id: 'v1',
      church_id: 'c1',
      song_id: 's1',
      youtube_video_id: 'vid1',
      is_primary: true,
    })

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'song_videos') {
        return {
          getFullList: vi.fn().mockResolvedValueOnce([]), // sem vídeos anteriores
          update: updateSpy,
          create: createSpy,
        } as any
      }
      if (col === 'songs') {
        return {
          update: updateSpy,
        } as any
      }
      return {} as any
    })

    const created = await addVideoToSong({
      church_id: 'c1',
      song_id: 's1',
      youtube_video_id: 'vid1',
      title: 'Versão Acústica',
      channel_name: 'Canal',
    })

    expect(created.is_primary).toBe(true)
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        is_primary: true,
        youtube_video_id: 'vid1',
      }),
    )
  })

  it('define outro vídeo como principal e sincroniza com a música', async () => {
    const existingVideos = [
      { id: 'v1', song_id: 's1', youtube_video_id: 'vid1', is_primary: true },
      { id: 'v2', song_id: 's1', youtube_video_id: 'vid2', is_primary: false },
    ]

    const videoUpdateSpy = vi.fn().mockResolvedValue({})
    const songUpdateSpy = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'song_videos') {
        return {
          getFullList: vi.fn().mockResolvedValue(existingVideos),
          update: videoUpdateSpy,
        } as any
      }
      if (col === 'songs') {
        return {
          update: songUpdateSpy,
        } as any
      }
      return {} as any
    })

    await setPrimaryVideo('s1', 'v2')

    // Deve desmarcar v1 e marcar v2 como primary
    expect(videoUpdateSpy).toHaveBeenCalledWith('v2', { is_primary: true })
    expect(videoUpdateSpy).toHaveBeenCalledWith('v1', { is_primary: false })
    // Deve atualizar a tabela songs com o novo videoId
    expect(songUpdateSpy).toHaveBeenCalledWith('s1', {
      youtube_url: 'https://www.youtube.com/watch?v=vid2',
    })
  })

  it('remove vídeo e promove o remanescente se o removido era o principal', async () => {
    const existingVideos = [
      { id: 'v1', song_id: 's1', youtube_video_id: 'vid1', is_primary: true },
      { id: 'v2', song_id: 's1', youtube_video_id: 'vid2', is_primary: false },
    ]

    const deleteSpy = vi.fn().mockResolvedValue(true)
    const videoUpdateSpy = vi.fn().mockResolvedValue({})
    const songUpdateSpy = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'song_videos') {
        return {
          getFullList: vi.fn().mockResolvedValue(existingVideos),
          delete: deleteSpy,
          update: videoUpdateSpy,
        } as any
      }
      if (col === 'songs') {
        return {
          update: songUpdateSpy,
        } as any
      }
      return {} as any
    })

    const newPrimary = await removeVideoFromSong('s1', 'v1')
    expect(deleteSpy).toHaveBeenCalledWith('v1')
    expect(videoUpdateSpy).toHaveBeenCalledWith('v2', { is_primary: true })
    expect(newPrimary?.id).toBe('v2')
  })
})
