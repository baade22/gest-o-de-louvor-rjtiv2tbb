import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  generateHolyricsPairingCode,
  listHolyricsAgents,
  testHolyricsAgent,
  sendSongToHolyricsPlaylist,
} from './holyricsAgent'

describe('Holyrics Agent SaaS Service & Workflow Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('generateHolyricsPairingCode: chama endpoint correto e recebe código de 6 dígitos', async () => {
    const mockSend = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      agent_id: 'agent_abc',
      pairing_code: '847 291',
      raw_code: '847291',
      expires_at: '2026-03-30 20:00:00',
      message: 'Código gerado com sucesso.',
    })

    const res = await generateHolyricsPairingCode('church_123', 'PC Louvor')
    expect(mockSend).toHaveBeenCalledWith(
      '/backend/v1/saas/holyrics/pairing-code',
      expect.objectContaining({
        method: 'POST',
        body: { church_id: 'church_123', agent_name: 'PC Louvor' },
      }),
    )
    expect(res.pairing_code).toBe('847 291')
    expect(res.agent_id).toBe('agent_abc')
  })

  it('listHolyricsAgents: busca agentes da congregação', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      agents: [
        {
          id: 'agent_1',
          name: 'PC Projeção Principal',
          status: 'ONLINE',
          holyrics_detected: true,
          holyrics_version: '2.26',
        },
      ],
    })

    const agents = await listHolyricsAgents('church_123')
    expect(agents.length).toBe(1)
    expect(agents[0].status).toBe('ONLINE')
    expect(agents[0].holyrics_detected).toBe(true)
  })

  it('testHolyricsAgent: reporta erro amigável se Agent estiver offline', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      agent_online: false,
      holyrics_connected: false,
      error_code: 'AGENT_OFFLINE',
      message:
        '🔴 Holyrics desconectado. Verifique o checklist: 1. O computador está ligado? 2. O aplicativo LouvorFlow Agent está em execução?',
    })

    const res = await testHolyricsAgent('church_123', 'agent_offline')
    expect(res.success).toBe(false)
    expect(res.agent_online).toBe(false)
    expect(res.message).toContain('🔴 Holyrics desconectado')
  })

  it('sendSongToHolyricsPlaylist: fluxo com exatamente 1 música (adição automática)', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      action: 'ADD_TO_PLAYLIST',
      added: true,
      song_title: 'Ruja o Leão',
      holyrics_song_id: 'hly_999',
      message: '✓ Música "Ruja o Leão" encontrada e adicionada à playlist do Holyrics!',
    })

    const res = await sendSongToHolyricsPlaylist({
      churchId: 'church_123',
      songId: 'song_456',
    })

    expect(res.success).toBe(true)
    expect(res.added).toBe(true)
    expect(res.song_title).toBe('Ruja o Leão')
  })

  it('sendSongToHolyricsPlaylist: fluxo com múltiplos resultados requer seleção do usuário', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      requires_selection: true,
      song_title: 'A Casa É Sua',
      matches_count: 2,
      matches: [
        { id: 'h1', title: 'A Casa É Sua', artist: 'Casa Worship', key: 'G' },
        { id: 'h2', title: 'A Casa É Sua (Ao Vivo)', artist: 'Casa Worship', key: 'A' },
      ],
      agent_id: 'agent_active',
      message:
        'Encontradas 2 músicas no Holyrics para "A Casa É Sua". Selecione qual deseja enviar à playlist.',
    })

    const res = await sendSongToHolyricsPlaylist({
      churchId: 'church_123',
      songId: 'song_casa',
    })

    expect(res.requires_selection).toBe(true)
    expect(res.matches?.length).toBe(2)
  })

  it('sendSongToHolyricsPlaylist: fluxo quando música não existe no Holyrics (0 resultados)', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      error_code: 'SONG_NOT_FOUND_IN_HOLYRICS',
      matches_count: 0,
      song_title: 'Música Inexistente XYZ',
      message:
        '⚠️ Música não encontrada no Holyrics: "Música Inexistente XYZ". Cadastre ou importe a letra no programa Holyrics primeiro.',
    })

    const res = await sendSongToHolyricsPlaylist({
      churchId: 'church_123',
      songId: 'song_inexistente',
    })

    expect(res.success).toBe(false)
    expect(res.error_code).toBe('SONG_NOT_FOUND_IN_HOLYRICS')
    expect(res.message).toContain('⚠️ Música não encontrada no Holyrics')
  })
})
