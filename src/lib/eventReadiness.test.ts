import { describe, expect, it } from 'vitest'
import { computeEventReadiness, countPendencies } from './eventReadiness'

const member = (
  status: 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO',
  name = 'Ana Souza',
  role = 'Vocal',
) =>
  ({
    status,
    expand: { member_id: { expand: { user_id: { name } } }, role_id: { name: role } },
  }) as any

const song = (title = 'Oceanos', holyrics_status?: string) =>
  ({ holyrics_status, expand: { song_id: { title } } }) as any

describe('computeEventReadiness', () => {
  it('culto vazio tem prontidão zero e pede equipe e repertório', () => {
    const r = computeEventReadiness({ members: [], songs: [] })
    expect(r.score).toBe(0)
    expect(r.attention.map((a) => a.kind)).toEqual(['NO_TEAM', 'EMPTY_REPERTOIRE'])
  })

  it('média entre equipe confirmada e repertório quando não há mídias nem tarefas', () => {
    const r = computeEventReadiness({
      members: [member('CONFIRMADO'), member('CONFIRMADO'), member('PENDENTE'), member('RECUSADO')],
      songs: [song()],
    })
    // equipe 2/4 = 0.5, repertório = 1 -> 75%
    expect(r.score).toBe(75)
    expect(r.media).toBeUndefined()
    expect(r.tasks).toBeUndefined()
  })

  it('mídias e tarefas entram na conta quando existem', () => {
    const r = computeEventReadiness({
      members: [member('CONFIRMADO')],
      songs: [song()],
      medias: [
        { status: 'IMPORTADA_HOLYRICS', name: 'Abertura.mp4' },
        { status: 'ENVIADA', name: 'Avisos.png' },
      ],
      tasks: [
        { status: 'CONCLUIDA', priority: 'NORMAL', title: 'a' },
        { status: 'PENDENTE', priority: 'URGENTE', title: 'Testar microfones' },
        { status: 'CANCELADA', priority: 'NORMAL', title: 'ignorada' },
      ],
    })
    // (1 + 1 + 0.5 + 0.5) / 4
    expect(r.score).toBe(75)
    expect(r.tasks).toMatchObject({ done: 1, total: 2 })
    const kinds = r.attention.map((a) => a.kind)
    expect(kinds).toContain('MEDIA_NOT_TRANSFERRED')
    expect(kinds).toContain('URGENT_TASKS')
  })

  it('descreve quem não respondeu, com nome e função', () => {
    const r = computeEventReadiness({
      members: [
        member('PENDENTE', 'André Rocha', 'Teclado'),
        member('PENDENTE', 'Maria Ferreira', 'Vocal'),
      ],
      songs: [song()],
    })
    const pending = r.attention.find((a) => a.kind === 'PENDING_MEMBERS')!
    expect(pending.title).toBe('2 pessoas sem resposta')
    expect(pending.detail).toBe('André (teclado) e Maria (vocal)')
  })

  it('aponta músicas com erro no Holyrics', () => {
    const r = computeEventReadiness({
      members: [member('CONFIRMADO')],
      songs: [song('Oceanos', 'ERROR'), song('Bondade de Deus', 'ADDED_TO_PLAYLIST')],
    })
    const err = r.attention.find((a) => a.kind === 'SONG_SYNC_ERROR')!
    expect(err.title).toBe('1 música com erro no Holyrics')
    expect(err.detail).toBe('Oceanos')
    expect(r.score).toBe(100)
  })

  it('countPendencies soma os itens', () => {
    const r = computeEventReadiness({
      members: [member('PENDENTE'), member('PENDENTE'), member('RECUSADO')],
      songs: [],
    })
    expect(countPendencies(r)).toBe(2 + 1 + 1)
  })
})
