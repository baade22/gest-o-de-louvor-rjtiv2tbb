import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { LouvorFlowAgent } from '../../agent/src/agent'
import type { AgentConfig, AgentCommand } from '../../agent/src/types'

describe('Validação de Correções P1, P2 e P3 - LouvorFlow ↔ Holyrics Agent', () => {
  let tmpDir: string
  let agentConfig: AgentConfig

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louvorflow-fixes-test-'))
    fs.mkdirSync(path.join(tmpDir, 'media', 'video'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'media', 'image'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'media', 'audio'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'media', 'automaticPresentations'), { recursive: true })

    agentConfig = {
      saasUrl: 'http://localhost:8090',
      agentId: 'agent_test_fix',
      agentToken: 'token_secret_123',
      holyricsHost: '127.0.0.1',
      holyricsPort: 8091,
      holyricsToken: 'token_hly_fix',
      agentWebPort: 8765,
      pollIntervalMs: 1000,
      heartbeatIntervalMs: 5000,
      holyricsMediaPath: path.join(tmpDir, 'media'),
    }
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* intentionally ignored */
    }
    vi.restoreAllMocks()
  })

  // P2: Validação de Áudio
  it('P2.1: Áudio válido (.mp3, .wav, .m4a) é aceito e transferido para a subpasta "audio"', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const audioContent = 'ID3\x03\x00\x00\x00\x00\x00\x00fake_mp3_payload_stream'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(audioContent.length) }),
      body: {
        getReader() {
          let done = false
          return {
            async read() {
              if (done) return { done: true, value: undefined }
              done = true
              return { done: false, value: Buffer.from(audioContent) }
            },
          }
        },
      },
    } as any)

    vi.spyOn(agent as any, 'validateFileContent').mockReturnValue({ valid: true })

    const cmd: AgentCommand = {
      id: 'cmd_audio_valid',
      command_id: 'cmd_audio_valid',
      action: 'TRANSFER_MEDIA',
      payload: {
        media_id: 'med_audio_01',
        holyrics_filename: 'Trilha Entrada.mp3',
        media_type: 'AUDIO',
        file_size: audioContent.length,
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.target_subfolder).toBe('audio')
    expect(
      fs.existsSync(path.join(agentConfig.holyricsMediaPath, 'audio', 'Trilha Entrada.mp3')),
    ).toBe(true)
  })

  it('P2.2: .mp4 classificado como AUDIO é rejeitado com erro INVALID_FILE_EXTENSION', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    const cmd: AgentCommand = {
      id: 'cmd_audio_invalid',
      command_id: 'cmd_audio_invalid',
      action: 'TRANSFER_MEDIA',
      payload: {
        media_id: 'med_audio_02',
        holyrics_filename: 'VideoComoAudio.mp4',
        media_type: 'AUDIO',
        file_size: 1024,
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('INVALID_FILE_EXTENSION')
    expect(res.error).toContain('Extensão .mp4 não permitida para o tipo de mídia AUDIO')
    expect(res.error).toContain('mp3, wav, ogg, m4a, aac, wma, flac')
  })

  it('P2.3: .mp3 classificado como VIDEO é rejeitado com erro INVALID_FILE_EXTENSION', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    const cmd: AgentCommand = {
      id: 'cmd_video_invalid',
      command_id: 'cmd_video_invalid',
      action: 'TRANSFER_MEDIA',
      payload: {
        media_id: 'med_video_02',
        holyrics_filename: 'AudioComoVideo.mp3',
        media_type: 'VIDEO',
        file_size: 1024,
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('INVALID_FILE_EXTENSION')
    expect(res.error).toContain('Extensão .mp3 não permitida para o tipo de mídia VIDEO')
  })

  // P3: Playlist
  it('P3.1: SYNC_MEDIA_PLAYLIST reporta PENDING_LOCAL_FILE se o arquivo não estiver presente no disco local', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })

    // Não criamos o arquivo no disco propositalmente
    const cmd: AgentCommand = {
      id: 'cmd_p3_pending',
      command_id: 'cmd_p3_pending',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_p3',
        items: [
          { holyrics_filename: 'NaoTransferido.mp4', media_type: 'VIDEO', presentation_order: 1 },
        ],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    // O item fica como PENDING_LOCAL_FILE com mensagem explicativa e ação recomendada
    expect(res.result?.pending_local_count).toBe(1)
    const pendingItem = res.result?.items.find((i: any) => i.name === 'NaoTransferido.mp4')
    expect(pendingItem?.status).toBe('PENDING_LOCAL_FILE')
    expect(pendingItem?.error).toContain('não encontrado na biblioteca local')
    expect(pendingItem?.error).toContain('Ação recomendada')
  })

  it('P3.2: SYNC_MEDIA_PLAYLIST ordena por presentation_order e verifica pós-operação via GetPlaylist', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })

    // Cria arquivos locais
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Video2.mp4'), 'v2')
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Video1.mp4'), 'v1')

    let addPayloadItems: any[] = []
    vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockImplementation(
      async (params: any) => {
        addPayloadItems = params.items
        return { success: true }
      },
    )

    // Na primeira chamada (leitura prévia), playlist vazia; na segunda (pós-operação), ambos verificados
    let callCount = 0
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { success: true, items: [] }
      }
      return {
        success: true,
        items: [
          { name: 'Video1.mp4', type: 'video' },
          { name: 'Video2.mp4', type: 'video' },
        ],
      }
    })

    const cmd: AgentCommand = {
      id: 'cmd_p3_order',
      command_id: 'cmd_p3_order',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_p3_order',
        // Passados fora de ordem propositalmente
        items: [
          { holyrics_filename: 'Video2.mp4', media_type: 'VIDEO', presentation_order: 2 },
          { holyrics_filename: 'Video1.mp4', media_type: 'VIDEO', presentation_order: 1 },
        ],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.synced_count).toBe(2)
    // Verifica que addMediaToPlaylist recebeu Video1 antes de Video2
    expect(addPayloadItems[0].name).toBe('Video1.mp4')
    expect(addPayloadItems[1].name).toBe('Video2.mp4')
  })

  // Regressão: Sincronização Musical
  it('Regressão: Sincronização musical AddLyricsToPlaylist preserva payload mínimo oficial', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const client = (agent as any).holyrics

    const reqSpy = vi.spyOn(client, 'request').mockResolvedValue({
      status: 'ok',
      data: { playlist: ['hly_song_999'] },
    })

    const res = await client.addToPlaylist('hly_song_999', { index: 0 })
    expect(res.success).toBe(true)
    expect(reqSpy).toHaveBeenCalledWith(
      'AddLyricsToPlaylist',
      {
        id: 'hly_song_999',
        media_playlist: false,
        index: 0,
      },
      5000,
    )
  })
})
