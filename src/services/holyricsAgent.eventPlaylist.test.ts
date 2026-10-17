import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LouvorFlowAgent } from '../../agent/src/agent'
import {
  findItemIdsToRemove,
  planSongReorder,
  type PlaylistItem,
} from '../../agent/src/eventPlaylist'
import type { AgentConfig, AgentCommand } from '../../agent/src/types'

const EVENT_ID = '1791842350987202611011700'

const song = (itemId: string, songId: string): PlaylistItem => ({
  id: itemId,
  type: 'song',
  name: `Música ${songId}`,
  song_id: songId,
  reference_id: songId,
})
const video = (itemId: string, name: string): PlaylistItem => ({ id: itemId, type: 'video', name })

// Simula a playlist de um culto no Holyrics: GetSchedules, RemoveFromMediaPlaylist e AddToPlaylist
function fakeHolyrics(agent: LouvorFlowAgent, initial: PlaylistItem[]) {
  const playlist = [...initial]
  let seq = 0
  const holyrics = (agent as any).holyrics
  vi.spyOn(holyrics, 'getSchedules').mockImplementation(async () => ({
    success: true,
    schedules: [
      { type: 'service', media_playlist: [], metadata: { event: { id: 'outro-culto' } } },
      { type: 'service', media_playlist: [...playlist], metadata: { event: { id: EVENT_ID } } },
    ],
  }))
  const removeSpy = vi
    .spyOn(holyrics, 'removeFromMediaPlaylist')
    .mockImplementation(async (ids: any) => {
      for (const id of ids as string[]) {
        const i = playlist.findIndex((p) => p.id === id)
        if (i >= 0) playlist.splice(i, 1)
      }
      return { success: true }
    })
  const addSpy = vi
    .spyOn(holyrics, 'addToPlaylist')
    .mockImplementation(async (songId: any, opts: any) => {
      const item = song(`z${++seq}`, String(songId))
      if (opts.index === undefined || opts.index < 0) playlist.push(item)
      else playlist.splice(opts.index, 0, item)
      return { success: true }
    })
  return { playlist, removeSpy, addSpy }
}

const cmd = (action: AgentCommand['action'], payload: Record<string, any>): AgentCommand => ({
  id: 'rec1',
  command_id: 'cmd1',
  action,
  payload: { event_id: EVENT_ID, month: 11, year: 2026, ...payload },
  created_at: '2026-10-17 20:00:00',
})

describe('Playlist do culto no Holyrics: regras puras', () => {
  it('acha músicas pelo song_id (não pelo id do item) e mídias pelo nome', () => {
    const playlist = [
      song('zA', '111'),
      video('zV', 'Culto - Avisos - 01-11 - Vinheta.mp4'),
      song('zB', '222'),
    ]
    expect(findItemIdsToRemove(playlist, ['222'], [])).toEqual(['zB'])
    expect(findItemIdsToRemove(playlist, ['zA'], [])).toEqual([])
    expect(findItemIdsToRemove(playlist, [], ['culto - avisos - 01-11 - vinheta.mp4'])).toEqual([
      'zV',
    ])
  })

  it('não planeja nada quando a ordem já está certa', () => {
    const playlist = [song('zA', '1'), video('zV', 'v.mp4'), song('zB', '2')]
    expect(planSongReorder(playlist, ['1', '2'])).toBeNull()
  })

  it('reordena só as músicas, mantendo as posições que elas ocupam', () => {
    const playlist = [video('zV', 'v.mp4'), song('zB', '2'), song('zA', '1'), video('zW', 'w.mp4')]
    expect(planSongReorder(playlist, ['1', '2', '3'])).toEqual({
      removeIds: ['zB', 'zA'],
      inserts: [
        { index: 1, songId: '1' },
        { index: 2, songId: '2' },
      ],
    })
  })
})

describe('Agent: comandos de remoção e ordem na playlist do culto', () => {
  let tmpDir: string
  let agent: LouvorFlowAgent

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louvorflow-event-playlist-'))
    fs.mkdirSync(path.join(tmpDir, 'media', 'video'), { recursive: true })
    const config: AgentConfig = {
      saasUrl: 'http://localhost:8090',
      agentId: 'agent_test',
      agentToken: 'token',
      churchId: 'church',
      churchName: 'Igreja',
      machineName: 'PC',
      holyricsHost: '127.0.0.1',
      holyricsPort: 8091,
      holyricsToken: 'hly',
      agentWebPort: 8765,
      pollIntervalMs: 1000,
      heartbeatIntervalMs: 5000,
      holyricsMediaPath: path.join(tmpDir, 'media'),
      maxDownloadSizeBytes: 1000,
      downloadTimeoutMs: 1000,
    } as AgentConfig
    agent = new LouvorFlowAgent(config)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('REORDER_EVENT_SONGS deixa as músicas na ordem do repertório', async () => {
    const fake = fakeHolyrics(agent, [
      song('z1', '300'),
      video('zV', 'v.mp4'),
      song('z2', '100'),
      song('z3', '200'),
    ])
    const res = await agent.handleReorderEventSongs(
      cmd('REORDER_EVENT_SONGS', { song_ids: ['100', '200', '300'] }),
    )
    expect(res.success).toBe(true)
    expect(fake.playlist.map((p) => p.song_id || p.name)).toEqual(['100', 'v.mp4', '200', '300'])
  })

  it('REORDER_EVENT_SONGS não mexe quando já está na ordem', async () => {
    const fake = fakeHolyrics(agent, [song('z1', '100'), song('z2', '200')])
    const res = await agent.handleReorderEventSongs(
      cmd('REORDER_EVENT_SONGS', { song_ids: ['100', '200'] }),
    )
    expect(res.result).toEqual({ reordered: false })
    expect(fake.removeSpy).not.toHaveBeenCalled()
    expect(fake.addSpy).not.toHaveBeenCalled()
  })

  it('REMOVE_FROM_EVENT_PLAYLIST tira a música e a mídia e apaga só o arquivo da biblioteca', async () => {
    const fileName = 'Culto - Avisos - 01-11 - Vinheta.mp4'
    fs.writeFileSync(path.join(tmpDir, 'media', 'video', fileName), 'x')
    const outside = path.join(tmpDir, 'fora.mp4')
    fs.writeFileSync(outside, 'x')
    const fake = fakeHolyrics(agent, [song('z1', '100'), video('zV', fileName), song('z2', '200')])

    const res = await agent.handleRemoveFromEventPlaylist(
      cmd('REMOVE_FROM_EVENT_PLAYLIST', {
        song_ids: ['100'],
        media: [
          { media_type: 'VIDEO', file_name: fileName },
          { media_type: 'VIDEO', file_name: '../fora.mp4' },
        ],
        delete_files: true,
      }),
    )

    expect(res.success).toBe(true)
    expect(res.result?.removed_items).toBe(2)
    expect(fake.playlist.map((p) => p.id)).toEqual(['z2'])
    expect(fs.existsSync(path.join(tmpDir, 'media', 'video', fileName))).toBe(false)
    expect(fs.existsSync(outside)).toBe(true)
  })

  it('REMOVE_FROM_EVENT_PLAYLIST avisa quando o culto não está na programação', async () => {
    fakeHolyrics(agent, [])
    const res = await agent.handleRemoveFromEventPlaylist(
      cmd('REMOVE_FROM_EVENT_PLAYLIST', { event_id: 'nao-existe', song_ids: ['100'] }),
    )
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('EVENT_NOT_FOUND_IN_SCHEDULES')
  })
})
