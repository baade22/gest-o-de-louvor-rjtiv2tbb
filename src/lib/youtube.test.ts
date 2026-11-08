import { describe, expect, it } from 'vitest'
import { parseYoutubeVideoId, youtubeStageLabel } from './youtube'

describe('parseYoutubeVideoId', () => {
  it('aceita os formatos de link do YouTube', () => {
    const id = 'dQw4w9WgXcQ'
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=30s`,
      `https://m.youtube.com/watch?feature=share&v=${id}`,
      `youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://music.youtube.com/watch?v=${id}&list=RD`,
      `https://www.youtube.com/live/${id}`,
    ]) {
      expect(parseYoutubeVideoId(url), url).toBe(id)
    }
  })

  it('recusa o que não é vídeo do YouTube', () => {
    for (const url of [
      '',
      'https://vimeo.com/123',
      'https://www.youtube.com/playlist?list=PL123',
      'https://www.youtube.com/@canal',
      'https://evil.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=curto',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ;rm',
    ]) {
      expect(parseYoutubeVideoId(url), url).toBeNull()
    }
  })
})

describe('youtubeStageLabel', () => {
  const base = {
    source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    status: 'ENVIADA',
  } as any
  it('mostra onde o download está', () => {
    expect(youtubeStageLabel({ ...base, youtube_stage: 'VPS' })).toMatch(/servidor/)
    expect(youtubeStageLabel({ ...base, youtube_stage: 'AGENT' })).toMatch(/computador/)
    expect(youtubeStageLabel({ ...base, youtube_stage: 'DONE' })).toBeNull()
    expect(youtubeStageLabel({ ...base, source_url: '' })).toBeNull()
  })
})
