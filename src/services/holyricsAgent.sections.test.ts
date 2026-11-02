import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LouvorFlowAgent } from '../../agent/src/agent'
import { normalizeTitle, titleMatches, type PlaylistItem } from '../../agent/src/eventPlaylist'
import type { AgentConfig, AgentCommand } from '../../agent/src/types'

const EVENT_ID = '1791842350987202611011700'
const song = (id: string, songId: string): PlaylistItem => ({ id, type: 'song', song_id: songId })
const video = (id: string, name: string): PlaylistItem => ({ id, type: 'video', name })
const image = (id: string, name: string): PlaylistItem => ({ id, type: 'image', name })
const title = (id: string, name: string): PlaylistItem => ({ id, type: 'title', name })

// Holyrics de mentira: GetSchedules, RemoveFromMediaPlaylist e AddToPlaylist (com index)
function fakeHolyrics(agent: LouvorFlowAgent, initial: PlaylistItem[]) {
  const playlist = [...initial]
  let seq = 0
  const h = (agent as any).holyrics
  vi.spyOn(h, 'getSchedules').mockImplementation(async () => ({
    success: true,
    schedules: [
      { type: 'service', media_playlist: [...playlist], metadata: { event: { id: EVENT_ID } } },
    ],
  }))
  vi.spyOn(h, 'removeFromMediaPlaylist').mockImplementation(async (ids: any) => {
    for (const id of ids as string[]) {
      const i = playlist.findIndex((p) => p.id === id)
      if (i >= 0) playlist.splice(i, 1)
    }
    return { success: true }
  })
  const addSpy = vi
    .spyOn(h, 'addItemsToPlaylist')
    .mockImplementation(async (items: any, _ev: any, index: any) => {
      const created = (items as any[]).map((it) => ({
        id: `n${++seq}`,
        type: it.type,
        name: it.name,
        ...(it.type === 'song' ? { song_id: String(it.id) } : {}),
      }))
      if (index < 0 || index >= playlist.length) playlist.push(...created)
      else playlist.splice(index, 0, ...created)
      return { success: true }
    })
  return { playlist, addSpy }
}

const view = (pl: PlaylistItem[]) =>
  pl.map((it) =>
    it.type === 'title' ? `# ${it.name}` : it.song_id ? `song ${it.song_id}` : it.name,
  )

const config: AgentConfig = {
  saasUrl: 'http://localhost:8090',
  agentId: 'a',
  agentToken: 't',
  churchId: 'c',
  churchName: 'Igreja',
  machineName: 'PC',
  holyricsHost: '127.0.0.1',
  holyricsPort: 8091,
  holyricsToken: 'x',
  holyricsMediaPath: '/tmp',
  agentWebPort: 8765,
} as any

const reorder = (sections: any[]): AgentCommand => ({
  id: 'r',
  command_id: 'c',
  action: 'REORDER_EVENT_SONGS',
  payload: { event_id: EVENT_ID, month: 11, year: 2026, song_ids: [], sections },
  created_at: '2026-11-01 20:00:00',
})

describe('Títulos de seção: regras puras', () => {
  it('ignora acento, caixa, símbolos e o "s" final', () => {
    expect(normalizeTitle('AVISOS!!')).toBe('avisos')
    expect(titleMatches('AVISOS!!', 'Avisos')).toBe(true)
    expect(titleMatches('Aviso', 'AVISOS')).toBe(true)
    expect(titleMatches('VÍDEO ESPECIAL', 'video especial')).toBe(true)
    expect(titleMatches('OFERTA', 'AVISOS')).toBe(false)
  })
})

describe('Agent: monta a playlist do culto por seções', () => {
  let agent: LouvorFlowAgent
  beforeEach(() => {
    vi.restoreAllMocks()
    agent = new LouvorFlowAgent(config)
  })

  const sections = [
    {
      title: 'LOUVOR',
      items: [
        { kind: 'song', song_id: '1' },
        { kind: 'song', song_id: '2' },
      ],
    },
    { title: 'AVISOS', items: [{ kind: 'media', type: 'video', name: 'aviso.mp4' }] },
    { title: 'ANIVERSARIANTES', items: [{ kind: 'media', type: 'video', name: 'niver.mp4' }] },
  ]

  it('playlist como a do Pedro: usa os títulos que existem e cria o que falta', async () => {
    const { playlist } = fakeHolyrics(agent, [
      video('a', 'aviso.mp4'),
      video('b', 'niver.mp4'),
      title('t1', 'LOUVOR'),
      song('s2', '2'),
      song('s1', '1'),
      title('t2', 'OFERTA'),
      image('i', 'oferta.jpeg'),
      title('t3', 'AVISOS!!'),
      title('t4', 'KITUTS'),
      video('k', 'KITUTS.mp4'),
    ])
    const res = await agent.handleReorderEventSongs(reorder(sections))
    expect(res.success).toBe(true)
    expect(res.result?.titles_created).toEqual(['ANIVERSARIANTES'])
    expect(view(playlist)).toEqual([
      '# LOUVOR',
      'song 1',
      'song 2',
      '# OFERTA',
      'oferta.jpeg',
      '# AVISOS!!',
      'aviso.mp4',
      '# KITUTS',
      'KITUTS.mp4',
      '# ANIVERSARIANTES',
      'niver.mp4',
    ])
  })

  it('playlist sem títulos: cria todos na ordem do LouvorFlow', async () => {
    const { playlist } = fakeHolyrics(agent, [
      video('b', 'niver.mp4'),
      song('s1', '1'),
      video('a', 'aviso.mp4'),
      song('s2', '2'),
    ])
    const res = await agent.handleReorderEventSongs(reorder(sections))
    expect(res.success).toBe(true)
    expect(view(playlist)).toEqual([
      '# LOUVOR',
      'song 1',
      'song 2',
      '# AVISOS',
      'aviso.mp4',
      '# ANIVERSARIANTES',
      'niver.mp4',
    ])
  })

  it('não mexe quando já está organizada e ignora itens que ainda não estão na playlist', async () => {
    const { playlist, addSpy } = fakeHolyrics(agent, [
      title('t1', 'Louvor'),
      song('s1', '1'),
      song('s2', '2'),
      title('t2', 'Avisos'),
      video('a', 'aviso.mp4'),
    ])
    const res = await agent.handleReorderEventSongs(reorder(sections))
    expect(res.success).toBe(true)
    expect(res.result?.reordered).toBe(false)
    expect(addSpy).not.toHaveBeenCalled()
    // niver.mp4 não está na playlist: não cria o título ANIVERSARIANTES
    expect(view(playlist)).toEqual(['# Louvor', 'song 1', 'song 2', '# Avisos', 'aviso.mp4'])
  })

  it('sem "sections" continua só ordenando as músicas (compatível com o servidor antigo)', async () => {
    const h = (agent as any).holyrics
    const spy = vi.spyOn(agent as any, 'arrangeEventPlaylist')
    vi.spyOn(h, 'getSchedules').mockResolvedValue({
      success: true,
      schedules: [{ media_playlist: [song('s1', '1')], metadata: { event: { id: EVENT_ID } } }],
    })
    const res = await agent.handleReorderEventSongs({
      ...reorder([]),
      payload: { event_id: EVENT_ID, month: 11, year: 2026, song_ids: ['1'] },
    })
    expect(res.success).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })
})
