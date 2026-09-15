import pb from '@/lib/pocketbase/client'

export interface YouTubeSearchResult {
  videoId: string
  title: string
  description: string
  channelTitle: string
  publishedAt: string
  thumbnail: string
  videoUrl: string
}

export interface YouTubeSearchResponse {
  code:
    | 'SUCCESS'
    | 'EMPTY_QUERY'
    | 'API_KEY_MISSING'
    | 'QUOTA_EXCEEDED'
    | 'API_FORBIDDEN'
    | 'API_ERROR'
    | 'NETWORK_ERROR'
  message: string
  items: YouTubeSearchResult[]
}

/**
 * Busca vídeos oficiais via backend route /backend/v1/youtube/search?q=...
 * Não expõe a chave da API ao frontend.
 * Converte erros em mensagens amigáveis em pt-BR.
 */
export async function searchYouTubeVideos(
  query: string,
  churchId?: string,
): Promise<YouTubeSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    throw new Error('Informe o termo para pesquisa de vídeos.')
  }

  const queryParams = new URLSearchParams({ q: trimmed })
  if (churchId) {
    queryParams.set('church_id', churchId)
  }

  try {
    const response = await pb.send<YouTubeSearchResponse>(
      `/backend/v1/youtube/search?${queryParams.toString()}`,
      {
        method: 'GET',
      },
    )

    if (response.code === 'QUOTA_EXCEEDED') {
      throw new Error('A cota diária da API do YouTube foi excedida. Tente novamente mais tarde.')
    }

    if (response.code === 'API_KEY_MISSING') {
      throw new Error(
        'A chave da API do YouTube não foi configurada no servidor (YOUTUBE_API_KEY). Contate o administrador.',
      )
    }

    if (response.code !== 'SUCCESS') {
      throw new Error(response.message || 'Erro ao realizar pesquisa no YouTube.')
    }

    return response.items || []
  } catch (err: any) {
    // Se o erro foi lançado com status HTTP específico
    if (err?.status === 429 || err?.data?.code === 'QUOTA_EXCEEDED') {
      throw new Error('A cota diária da API do YouTube foi excedida. Tente novamente mais tarde.')
    }
    if (err?.status === 503 || err?.data?.code === 'API_KEY_MISSING') {
      throw new Error(
        'A chave da API do YouTube não está configurada no servidor (YOUTUBE_API_KEY).',
      )
    }
    if (err?.data?.message) {
      throw new Error(err.data.message)
    }
    if (err?.message) {
      throw err
    }
    throw new Error('Não foi possível conectar ao serviço de busca do YouTube.')
  }
}

/**
 * Utilitário seguro para extrair o videoId de uma URL qualquer do YouTube.
 */
export function extractYouTubeVideoId(urlOrId?: string): string | null {
  if (!urlOrId) return null
  const trimmed = urlOrId.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed
  }
  const match = trimmed.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]{11})/)
  return match && match[1] ? match[1] : null
}

/**
 * Retorna a URL oficial de embed do YouTube (com youtube-nocookie.com para privacidade).
 */
export function getYouTubeEmbedUrl(videoIdOrUrl?: string): string | null {
  const videoId = extractYouTubeVideoId(videoIdOrUrl)
  if (!videoId) return null
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}
