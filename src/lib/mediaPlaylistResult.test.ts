import { describe, it, expect } from 'vitest'
import { describeMediaSyncResult } from './mediaPlaylistResult'

describe('describeMediaSyncResult', () => {
  it('mostra o erro real quando o Agent falha', () => {
    const r = describeMediaSyncResult({
      status: 'FAILED',
      error: 'Falha geral',
      result: {
        items: [
          {
            name: 'Avisos.mp4',
            status: 'MEDIA_NOT_RECOGNIZED',
            error: 'O Holyrics não o encontrou na aba Vídeos.',
          },
        ],
      },
    })
    expect(r.ok).toBe(false)
    expect(r.description).toContain('aba Vídeos')
  })

  it('usa o erro do comando quando não há itens', () => {
    const r = describeMediaSyncResult({ status: 'FAILED', error: 'Holyrics offline' })
    expect(r.ok).toBe(false)
    expect(r.description).toBe('Holyrics offline')
  })

  it('confirma quando tudo entrou', () => {
    const r = describeMediaSyncResult({
      status: 'DONE',
      result: { synced_count: 2, already_present_count: 1, items: [] },
    })
    expect(r.ok).toBe(true)
    expect(r.description).toBe('2 mídia(s) colocada(s) na playlist do culto, 1 já estava(m) lá.')
  })

  it('avisa quando só parte entrou e tira a nota técnica de retentativa', () => {
    const r = describeMediaSyncResult({
      status: 'DONE',
      result: {
        synced_count: 1,
        items: [
          { name: 'a.mp4', status: 'ADDED' },
          {
            name: 'b.mp4',
            status: 'FAILED',
            error:
              'não confirmada. (O arquivo está salvo em disco; nova tentativa não re-transferirá).',
          },
        ],
      },
    })
    expect(r.ok).toBe(false)
    expect(r.title).toBe('Playlist montada em parte')
    expect(r.description).toBe(
      '1 mídia(s) colocada(s) na playlist do culto. 1 não entrou: não confirmada.',
    )
  })
})
