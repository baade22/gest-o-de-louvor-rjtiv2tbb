import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LouvorFlowAgent } from '../../agent/src/agent'
import { planMirror, desiredFromSections, type PlaylistItem } from '../../agent/src/eventPlaylist'
import type { AgentConfig, AgentCommand } from '../../agent/src/types'

const EVENT_ID = '1791842350987202611151700'
const song = (id: string, songId: string): PlaylistItem => ({ id, type: 'song', song_id: songId })
const video = (id: string, name: string): PlaylistItem => ({ id, type: 'video', name })
const image = (id: string, name: string): PlaylistItem => ({ id, type: 'image', name })
const title = (id: string, name: string): PlaylistItem => ({ id, type: 'title', name })
const verse = (id: string): PlaylistItem => ({ id, type: 'verse', name: 'Sl 23' })

const view = (pl: PlaylistItem[]) =>
  pl.map((it) =>
    it.type === 'title' ? `# ${it.name}` : it.song_id ? `song ${it.song_id}` : it.name,
  )

// Holyrics de mentira: lê, remove pela posição e insere na posição
function fakeHolyrics(agent: LouvorFlowAgent, initial: PlaylistItem[]) {
  const playlist = [...initial]
  let seq = 0
  const h = (agent as any).holyrics
  vi.spyOn(h, 'testConnection').mockResolvedValue({ connected: true })
  vi.spyOn(h, 'verifyMediaRecognition').mockImplementation(async (_t: any, name: any) => ({
    recognized: !String(name).includes('faltando'),
    methodUsed: 'GetFile',
  }))
  vi.spyOn(h, 'getSchedules').mockImplementation(async () => ({
    success: true,
    schedules: [{ media_playlist: [...playlist], metadata: { event: { id: EVENT_ID } } }],
  }))
  const removeById = vi.spyOn(h, 'removeFromMediaPlaylist')
  const removeAt = vi
    .spyOn(h, 'removeFromMediaPlaylistIndex')
    .mockImplementation(async (index: any) => {
      playlist.splice(index, 1)
      return { success: true }
    })
  const add = vi
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
  return { playlist, removeById, removeAt, add }
}

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

const louvor = (...ids: string[]) => ({
  title: 'LOUVOR',
  items: ids.map((id) => ({ kind: 'song', song_id: id })),
})
const avisos = (...names: string[]) => ({
  title: 'AVISOS',
  items: names.map((name) => ({ kind: 'media', type: 'video', name })),
})
const mirror = (sections: any[]): AgentCommand => ({
  id: 'm',
  command_id: 'cm',
  action: 'SYNC_MEDIA_PLAYLIST',
  payload: { event_id: EVENT_ID, month: 11, year: 2026, mirror: true, items: [], sections },
  created_at: '2026-11-02 02:00:00',
})

describe('planMirror', () => {
  it('playlist já igual: não mexe em nada', () => {
    const pl = [title('t', 'LOUVOR'), song('a', '1'), song('b', '2')]
    const plan = planMirror(pl, desiredFromSections([louvor('1', '2')] as any))
    expect(plan.removeIndexes).toEqual([])
    expect(plan.insert).toEqual([])
  })

  it('seção do Holyrics (OFERTA) e versículo não são do LouvorFlow', () => {
    const pl = [
      title('t1', 'OFERTA'),
      image('i', 'oferta.jpeg'),
      title('t2', 'LOUVOR'),
      song('a', '1'),
      verse('v'),
    ]
    const plan = planMirror(pl, desiredFromSections([louvor('1')] as any))
    expect(plan.removeIndexes).toEqual([3, 2])
  })
})

describe('Agent 0.0.45: Enviar ao Holyrics deixa a playlist igual ao LouvorFlow', () => {
  let agent: LouvorFlowAgent
  beforeEach(() => {
    vi.restoreAllMocks()
    agent = new LouvorFlowAgent(config)
  })

  it('música nova fora do título, ordem invertida e mídia excluída: corrige tudo', async () => {
    // Como ficou no teste do 15/11: "Terceiro dia" acima do LOUVOR, ordem trocada
    const { playlist, removeById } = fakeHolyrics(agent, [
      song('x', '9'),
      title('t1', 'LOUVOR'),
      song('a', '2'),
      song('b', '1'),
      title('t2', 'AVISOS'),
      video('v1', 'av.mp4'),
      video('v2', 'apagada.mp4'),
      title('t3', 'EVENTOS'),
      video('v3', 'ok.mp3'),
    ])
    const res = await agent.handleSyncMediaPlaylist(
      mirror([louvor('1', '2', '9'), avisos('av.mp4')]),
    )
    expect(res.success).toBe(true)
    expect(view(playlist)).toEqual(['# LOUVOR', 'song 1', 'song 2', 'song 9', '# AVISOS', 'av.mp4'])
    expect(res.result.mirror.matches).toBe(true)
    expect(removeById).not.toHaveBeenCalled()
  })

  it('mantém intacto o que só existe no Holyrics (OFERTA e versículo)', async () => {
    const { playlist } = fakeHolyrics(agent, [
      title('t0', 'OFERTA'),
      image('i', 'oferta.jpeg'),
      title('t1', 'LOUVOR'),
      song('a', '1'),
      verse('v'),
    ])
    const res = await agent.handleSyncMediaPlaylist(mirror([louvor('1', '2')]))
    expect(res.success).toBe(true)
    expect(view(playlist)).toEqual([
      '# LOUVOR',
      'song 1',
      'song 2',
      '# OFERTA',
      'oferta.jpeg',
      'Sl 23',
    ])
  })

  it('enviar de novo sem mudança não remove nem inclui nada', async () => {
    const { removeAt, add } = fakeHolyrics(agent, [
      title('t1', 'LOUVOR'),
      song('a', '1'),
      title('t2', 'AVISOS'),
      video('v1', 'av.mp4'),
    ])
    const res = await agent.handleSyncMediaPlaylist(mirror([louvor('1'), avisos('av.mp4')]))
    expect(res.success).toBe(true)
    expect(removeAt).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(res.result.already_present_count).toBe(1)
  })

  it('mídia que o Holyrics não enxerga fica de fora e aparece como problema', async () => {
    const { playlist } = fakeHolyrics(agent, [])
    const res = await agent.handleSyncMediaPlaylist(
      mirror([louvor('1'), avisos('av.mp4', 'faltando.mp4')]),
    )
    expect(res.success).toBe(true)
    expect(view(playlist)).toEqual(['# LOUVOR', 'song 1', '# AVISOS', 'av.mp4'])
    expect(res.result.items.find((i: any) => i.name === 'faltando.mp4').status).toBe(
      'MEDIA_NOT_RECOGNIZED',
    )
  })

  it('se o Holyrics tirar o item errado, para na hora e não inclui nada', async () => {
    const { add, removeAt } = fakeHolyrics(agent, [
      title('t1', 'LOUVOR'),
      song('a', '2'),
      song('b', '1'),
      song('c', '3'),
    ])
    // Holyrics com defeito: sempre remove o primeiro item
    const pl: PlaylistItem[] = [
      title('t1', 'LOUVOR'),
      song('a', '2'),
      song('b', '1'),
      song('c', '3'),
    ]
    vi.spyOn((agent as any).holyrics, 'getSchedules').mockImplementation(async () => ({
      success: true,
      schedules: [{ media_playlist: [...pl], metadata: { event: { id: EVENT_ID } } }],
    }))
    removeAt.mockImplementation(async () => {
      pl.splice(0, 1)
      return { success: true }
    })
    const res = await agent.handleSyncMediaPlaylist(mirror([louvor('1', '2', '3')]))
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('REMOVE_WRONG_ITEM')
    expect(removeAt).toHaveBeenCalledTimes(1)
    expect(add).not.toHaveBeenCalled()
  })

  it('excluir música no LouvorFlow tira só ela, pela posição', async () => {
    const { playlist, removeById } = fakeHolyrics(agent, [
      title('t1', 'LOUVOR'),
      song('a', '1'),
      song('b', '2'),
      title('t2', 'AVISOS'),
      video('v1', 'av.mp4'),
    ])
    const res = await agent.handleRemoveFromEventPlaylist({
      id: 'r',
      command_id: 'cr',
      action: 'REMOVE_FROM_EVENT_PLAYLIST',
      payload: { event_id: EVENT_ID, month: 11, year: 2026, song_ids: ['2'] },
      created_at: '2026-11-02 02:00:00',
    })
    expect(res.success).toBe(true)
    expect(view(playlist)).toEqual(['# LOUVOR', 'song 1', '# AVISOS', 'av.mp4'])
    expect(removeById).not.toHaveBeenCalled()
  })
})
