import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { searchYouTubeVideos, extractYouTubeVideoId, getYouTubeEmbedUrl } from './youtube'

describe('Serviço de YouTube (Frontend & Integração)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('extrai videoId de URLs variadas do YouTube e strings diretas', () => {
    expect(extractYouTubeVideoId('1V6s_UoE00E')).toBe('1V6s_UoE00E')
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=1V6s_UoE00E')).toBe('1V6s_UoE00E')
    expect(extractYouTubeVideoId('https://youtu.be/1V6s_UoE00E')).toBe('1V6s_UoE00E')
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/1V6s_UoE00E')).toBe('1V6s_UoE00E')
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=1V6s_UoE00E&t=10s')).toBe(
      '1V6s_UoE00E',
    )
    expect(extractYouTubeVideoId('')).toBeNull()
    expect(extractYouTubeVideoId(undefined)).toBeNull()
  })

  it('gera URL de embed segura youtube-nocookie.com', () => {
    expect(getYouTubeEmbedUrl('1V6s_UoE00E')).toBe(
      'https://www.youtube-nocookie.com/embed/1V6s_UoE00E',
    )
    expect(getYouTubeEmbedUrl('https://youtu.be/1V6s_UoE00E')).toBe(
      'https://www.youtube-nocookie.com/embed/1V6s_UoE00E',
    )
    expect(getYouTubeEmbedUrl('')).toBeNull()
  })

  it('pesquisa válida retorna lista formatada de vídeos', async () => {
    const mockItems = [
      {
        videoId: 'abc12345678',
        title: 'Bondade de Deus - Isaías Saad',
        description: 'Música oficial',
        channelTitle: 'Isaías Saad',
        publishedAt: '2023-01-01T00:00:00Z',
        thumbnail: 'https://img.youtube.com/vi/abc12345678/hqdefault.jpg',
        videoUrl: 'https://www.youtube.com/watch?v=abc12345678',
      },
    ]

    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      code: 'SUCCESS',
      message: 'Pesquisa realizada com sucesso.',
      items: mockItems,
    })

    const results = await searchYouTubeVideos('Bondade de Deus')
    expect(results).toHaveLength(1)
    expect(results[0].videoId).toBe('abc12345678')
    expect(results[0].title).toBe('Bondade de Deus - Isaías Saad')
  })

  it('lança erro apropriado quando o termo de busca é vazio', async () => {
    await expect(searchYouTubeVideos('   ')).rejects.toThrow(
      'Informe o termo para pesquisa de vídeos.',
    )
  })

  it('trata resposta de quota excedida com mensagem clara em pt-BR', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      code: 'QUOTA_EXCEEDED',
      message: 'Cota excedida',
      items: [],
    })

    await expect(searchYouTubeVideos('Oceanos')).rejects.toThrow(
      'A cota diária da API do YouTube foi excedida. Tente novamente mais tarde.',
    )
  })

  it('trata resposta de erro 429 da chamada HTTP com mensagem em pt-BR', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce({
      status: 429,
      data: { code: 'QUOTA_EXCEEDED' },
    })

    await expect(searchYouTubeVideos('Oceanos')).rejects.toThrow(
      'A cota diária da API do YouTube foi excedida. Tente novamente mais tarde.',
    )
  })

  it('trata erro de chave de API não configurada (503)', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce({
      status: 503,
      data: {
        code: 'API_KEY_MISSING',
        message:
          'Para pesquisar vídeos do YouTube dentro do LouvorFlow, cadastre uma API Key em Configurações → Integrações.',
      },
    })

    await expect(searchYouTubeVideos('Oceanos')).rejects.toThrow(
      'Para pesquisar vídeos do YouTube dentro do LouvorFlow, cadastre uma API Key em Configurações → Integrações.',
    )
  })

  it('retorna array vazio quando nenhum resultado é encontrado', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      code: 'SUCCESS',
      message: 'Nenhum vídeo encontrado.',
      items: [],
    })

    const results = await searchYouTubeVideos('musica_inexistente_xyz_12345')
    expect(results).toEqual([])
  })
})
