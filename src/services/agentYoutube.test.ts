import { describe, expect, it } from 'vitest'
import {
  buildYtDlpArgs,
  canonicalYoutubeUrl,
  explainYtDlpError,
  parseTitleFromOutput,
  parseYoutubeVideoId,
} from '../../agent/src/youtube'

describe('Agent 0.0.50: download do YouTube', () => {
  it('só aceita vídeo do YouTube e remonta a URL pelo id', () => {
    expect(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=x')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1')).toBe(
      'dQw4w9WgXcQ',
    )
    expect(parseYoutubeVideoId('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseYoutubeVideoId('--exec=calc')).toBeNull()
    expect(canonicalYoutubeUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('áudio vira MP3 com ffmpeg e M4A sem ffmpeg', () => {
    const withFf = buildYtDlpArgs({ format: 'AUDIO', outputTemplate: 'o.%(ext)s', ffmpeg: true })
    expect(withFf).toContain('-x')
    expect(withFf.join(' ')).toContain('--audio-format mp3')
    const noFf = buildYtDlpArgs({ format: 'AUDIO', outputTemplate: 'o.%(ext)s', ffmpeg: false })
    expect(noFf).not.toContain('-x')
    expect(noFf.join(' ')).toContain('ba[ext=m4a]')
  })

  it('vídeo junta em MP4 até 1080p com ffmpeg; sem ffmpeg usa arquivo único', () => {
    const withFf = buildYtDlpArgs({
      format: 'VIDEO',
      outputTemplate: 'o.%(ext)s',
      ffmpeg: true,
      ffmpegDir: 'C:/tools',
    })
    expect(withFf.join(' ')).toContain('--merge-output-format mp4')
    expect(withFf.join(' ')).toContain('--ffmpeg-location C:/tools')
    expect(withFf.join(' ')).toContain('height<=1080')
    expect(withFf).toContain('--no-playlist')
    const noFf = buildYtDlpArgs({ format: 'VIDEO', outputTemplate: 'o.%(ext)s', ffmpeg: false })
    expect(noFf.join(' ')).toContain('b[ext=mp4]/b')
    expect(noFf).not.toContain('--merge-output-format')
  })

  it('lê o título e explica os erros comuns', () => {
    expect(parseTitleFromOutput('[info] x\n"Hino \\"Novo\\" 2026"\n')).toBe('Hino "Novo" 2026')
    expect(explainYtDlpError('ERROR: Sign in to confirm you’re not a bot').code).toBe(
      'YOUTUBE_BLOCKED',
    )
    expect(explainYtDlpError('ERROR: [youtube] x: Private video').code).toBe('YOUTUBE_UNAVAILABLE')
    expect(explainYtDlpError('ERROR: algo diferente').message).toBe('ERROR: algo diferente')
  })
})
