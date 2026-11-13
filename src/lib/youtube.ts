import type { MediaAsset } from '@/types'

const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']

/** Id (11 caracteres) de um link de vídeo do YouTube, ou null. Mesma regra do servidor. */
export function parseYoutubeVideoId(raw: string): string | null {
  let text = String(raw || '').trim()
  if (!text) return null
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  let id = ''
  if (host === 'youtu.be') id = u.pathname.split('/')[1] || ''
  else if (YT_HOSTS.includes(host)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || ''
    else id = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/]+)/)?.[1] || ''
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

/** Mídia do YouTube que ainda está sendo baixada (servidor ou computador do Holyrics). */
export function isYoutubePending(media: MediaAsset): boolean {
  return media.youtube_stage === 'VPS' || (media.youtube_stage === 'AGENT' && !media.file)
}

export function youtubeStageLabel(media: MediaAsset): string | null {
  if (!media.source_url) return null
  if (media.youtube_stage === 'VPS') return 'Baixando do YouTube no servidor'
  if (media.youtube_stage === 'AGENT' && media.status === 'ENVIADA')
    return 'Aguardando o computador do Holyrics baixar do YouTube'
  if (media.youtube_stage === 'FAILED') return 'Não foi possível baixar do YouTube'
  return null
}
