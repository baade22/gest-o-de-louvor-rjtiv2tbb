import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
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

const syncMedia = (sections: any[], items: any[]): AgentCommand => ({
  id: 'm',
  command_id: 'cm',
  action: 'SYNC_MEDIA_PLAYLIST',
  payload: { event_id: EVENT_ID, event_date: '2026-11-15 00:00:00.000Z', items, sections },
  created_at: '2026-11-02 01:00:00',
})

describe('Agent: títulos de seção sem remover nada', () => {
  let agent: LouvorFlowAgent
  let tmp: string
  beforeEach(() => {
    vi.restoreAllMocks()
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-sections-'))
    fs.mkdirSync(path.join(tmp, 'video'), { recursive: true })
    agent = new LouvorFlowAgent({ ...config, holyricsMediaPath: tmp })
    const h = (agent as any).holyrics
    vi.spyOn(h, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn(h, 'verifyMediaRecognition').mockResolvedValue({
      recognized: true,
      methodUsed: 'GetFile',
    })
  })

  const songsSection = {
    title: 'LOUVOR',
    items: [
      { kind: 'song', song_id: '1' },
      { kind: 'song', song_id: '2' },
    ],
  }
  const avisos = { title: 'AVISOS', items: [{ kind: 'media', type: 'video', name: 'av.mp4' }] }
  const aniv = {
    title: 'ANIVERSARIANTES',
    items: [{ kind: 'media', type: 'video', name: 'aniv.mp4' }],
  }
  const media = (name: string) => ({ holyrics_filename: name, media_type: 'VIDEO' })

  it('Enviar ao Holyrics: cria LOUVOR antes das músicas e não remove nada', async () => {
    const { playlist } = fakeHolyrics(agent, [song('s1', '1'), song('s2', '2')])
    const remove = vi.spyOn((agent as any).holyrics, 'removeFromMediaPlaylist')
    const res = await agent.handleReorderEventSongs(reorder([songsSection, avisos]))
    expect(res.success).toBe(true)
    expect(res.result?.titles_created).toEqual(['LOUVOR'])
    expect(view(playlist)).toEqual(['# LOUVOR', 'song 1', 'song 2'])
    expect(remove).not.toHaveBeenCalled()
  })

  it('Montar playlist (culto novo): cada vídeo entra embaixo do seu título, na ordem das seções', async () => {
    fs.writeFileSync(path.join(tmp, 'video', 'av.mp4'), 'x')
    fs.writeFileSync(path.join(tmp, 'video', 'aniv.mp4'), 'x')
    const { playlist } = fakeHolyrics(agent, [song('s1', '1'), song('s2', '2')])
    const remove = vi.spyOn((agent as any).holyrics, 'removeFromMediaPlaylist')
    const res = await agent.handleSyncMediaPlaylist(
      syncMedia([songsSection, avisos, aniv], [media('aniv.mp4'), media('av.mp4')]),
    )
    expect(res.success).toBe(true)
    expect(res.result?.synced_count).toBe(2)
    expect(res.result?.sections?.titles_created).toEqual(['LOUVOR', 'AVISOS', 'ANIVERSARIANTES'])
    expect(view(playlist)).toEqual([
      '# LOUVOR',
      'song 1',
      'song 2',
      '# AVISOS',
      'av.mp4',
      '# ANIVERSARIANTES',
      'aniv.mp4',
    ])
    expect(remove).not.toHaveBeenCalled()
  })

  it('usa título que já existe (AVISOS!!) e põe o vídeo no fim do bloco, antes do próximo título', async () => {
    fs.writeFileSync(path.join(tmp, 'video', 'av.mp4'), 'x')
    const { playlist } = fakeHolyrics(agent, [
      title('t1', 'LOUVOR'),
      song('s1', '1'),
      title('t2', 'OFERTA'),
      image('i', 'oferta.jpeg'),
      title('t3', 'AVISOS!!'),
      video('k0', 'antigo.mp4'),
      title('t4', 'KITUTS'),
      video('k', 'KITUTS.mp4'),
    ])
    const res = await agent.handleSyncMediaPlaylist(
      syncMedia([songsSection, avisos], [media('av.mp4')]),
    )
    expect(res.success).toBe(true)
    expect(res.result?.sections?.titles_created).toEqual([])
    expect(view(playlist)).toEqual([
      '# LOUVOR',
      'song 1',
      '# OFERTA',
      'oferta.jpeg',
      '# AVISOS!!',
      'antigo.mp4',
      'av.mp4',
      '# KITUTS',
      'KITUTS.mp4',
    ])
  })

  it('playlist já bagunçada (15/11): não move nada, só cria o que falta', async () => {
    const { playlist } = fakeHolyrics(agent, [
      song('s1', '1'),
      song('s2', '2'),
      title('t1', 'LOUVOR'),
    ])
    const remove = vi.spyOn((agent as any).holyrics, 'removeFromMediaPlaylist')
    const res = await agent.handleReorderEventSongs(reorder([songsSection]))
    expect(res.success).toBe(true)
    expect(view(playlist)).toEqual(['song 1', 'song 2', '# LOUVOR'])
    expect(remove).not.toHaveBeenCalled()
  })

  it('sem "sections" continua no comportamento antigo (servidor antigo)', async () => {
    const spy = vi.spyOn(agent as any, 'arrangeEventPlaylist')
    vi.spyOn((agent as any).holyrics, 'getSchedules').mockResolvedValue({
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
