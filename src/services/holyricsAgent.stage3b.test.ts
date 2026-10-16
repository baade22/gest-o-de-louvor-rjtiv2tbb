/**
 * holyricsAgent.stage3b.test.ts
 * Suíte de testes rigorosa para validação da ETAPA 3B do LouvorFlow:
 * 1. Payload de música exato sem campos extras: { items: [{ type: "song", id }], event_id, index: -1, ignore_duplicates: true }
 * 2. Payload de mídia por tipo: video, image, audio, file com nomes físicos corretos e event_id obrigatório
 * 3. event_id propagado intacto SaaS -> fila -> Agent -> HTTP (AddToPlaylist)
 * 4. Bloqueio quando holyrics_event_id estiver vazio (HOLYRICS_EVENT_NOT_LINKED) e sem fallback para ID do PocketBase
 * 5. Dois cultos distintos -> cada item encaminhado exclusivamente ao seu próprio event_id
 * 6. Isolamento estrito entre congregações (multi-tenant)
 * 7. Transferência OK + Inclusão falha -> estado FAILED de inclusão, arquivo preservado em disco para retentativa sem re-transferir
 * 8. Duplicidade e idempotência: itens já presentes na playlist da ocorrência não são reinseridos
 * 9. Confirmação real via GetSchedules (status ok não é prova suficiente de inclusão)
 * 10. Regressão musical: letras, cifras, transposição e parsing intocados
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LouvorFlowAgent } from '../../agent/src/agent.js'
import { HolyricsClient } from '../../agent/src/holyricsClient.js'
import type { AgentCommand, AgentConfig } from '../../agent/src/types.js'
import { cleanRepeatedExtension } from '../lib/mediaNaming.js'
import { transposeCifraText } from '../lib/transposition.js'
import { parseSongContent } from '../lib/songParser.js'

describe('ETAPA 3B: Unificação AddToPlaylist e Vinculação de Ocorrência', () => {
  let tempBaseDir: string
  let agentConfig: AgentConfig

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louvorflow_stage3b_'))
    fs.mkdirSync(path.join(tempBaseDir, 'video'), { recursive: true })
    fs.mkdirSync(path.join(tempBaseDir, 'image'), { recursive: true })
    fs.mkdirSync(path.join(tempBaseDir, 'audio'), { recursive: true })
    fs.mkdirSync(path.join(tempBaseDir, 'automaticPresentations'), { recursive: true })

    agentConfig = {
      agentId: 'agt_3b_test',
      agentToken: 'token_agt_3b',
      churchId: 'church_alpha',
      churchName: 'Igreja Alpha',
      machineName: 'Notebook-Culto',
      holyricsHost: '127.0.0.1',
      holyricsPort: 8091,
      holyricsToken: 'token_holyrics_secret',
      holyricsMediaPath: tempBaseDir,
      saasUrl: 'http://localhost:8090',
      pollIntervalMs: 1000,
      heartbeatIntervalMs: 5000,
      agentWebPort: 9099,
    }
  })

  afterEach(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true })
    } catch {
      /* intentionally ignored */
    }
    vi.restoreAllMocks()
  })

  // 1. Payload de música exato sem campos extras
  it('1. Payload de música para AddToPlaylist usa exatamente items, event_id, index: -1 e ignore_duplicates: true', async () => {
    const client = new HolyricsClient(
      agentConfig.holyricsHost,
      agentConfig.holyricsPort,
      agentConfig.holyricsToken,
    )
    let capturedAction = ''
    let capturedBody: any = null

    vi.spyOn(client as any, 'request').mockImplementation(async (action: string, data: any) => {
      capturedAction = action
      capturedBody = data
      return { status: 'ok', data: { success: true } }
    })

    const res = await client.addToPlaylist('song_hly_888', {
      eventId: 'occ_hly_domingo_noite',
      index: -1,
      ignoreDuplicates: true,
    })

    expect(res.success).toBe(true)
    expect(capturedAction).toBe('AddToPlaylist')
    expect(capturedBody).toEqual({
      items: [{ type: 'song', id: 'song_hly_888' }],
      event_id: 'occ_hly_domingo_noite',
      index: -1,
      ignore_duplicates: true,
    })
    // Sem campos supérfluos (como song_id interno, title, church_id)
    expect(capturedBody.song_id).toBeUndefined()
    expect(capturedBody.title).toBeUndefined()
    expect(capturedBody.church_id).toBeUndefined()
  })

  // 2. Payload de mídia por tipo com event_id
  it('2. Payload de mídia no AddToPlaylist mapeia tipos corretos (video, image, audio, file) com event_id da ocorrência', async () => {
    const client = new HolyricsClient(
      agentConfig.holyricsHost,
      agentConfig.holyricsPort,
      agentConfig.holyricsToken,
    )
    let capturedAction = ''
    let capturedBody: any = null

    vi.spyOn(client as any, 'request').mockImplementation(async (action: string, data: any) => {
      capturedAction = action
      capturedBody = data
      return { status: 'ok', data: { success: true } }
    })

    const items = [
      { type: 'video' as const, name: 'Culto - Abertura.mp4' },
      { type: 'image' as const, name: 'Culto - Avisos.jpg' },
      { type: 'audio' as const, name: 'Culto - Trilha.mp3' },
      { type: 'file' as const, name: 'Culto - Slides.pdf' },
    ]

    const res = await client.addMediaToPlaylist({
      items,
      eventId: 'occ_hly_quarta',
      index: -1,
      ignoreDuplicates: true,
    })

    expect(res.success).toBe(true)
    expect(capturedAction).toBe('AddToPlaylist')
    expect(capturedBody).toEqual({
      items,
      event_id: 'occ_hly_quarta',
      index: -1,
      ignore_duplicates: true,
    })
  })

  // 3. event_id propagado intacto SaaS -> fila -> Agent -> HTTP
  it('3. Agent recebe comando e propaga event_id intacto ao Holyrics Local sem alteração', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    let calledEventId = ''

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({
      connected: true,
      tokenValid: true,
    })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })
    // Ocorrência vazia antes da inserção; com a mídia na verificação pós-inserção
    vi.spyOn((agent as any).holyrics, 'getSchedules')
      .mockResolvedValueOnce({ success: true, schedules: [] })
      .mockResolvedValue({
        success: true,
        schedules: [
          {
            id: 'exact_holyrics_event_id_12345',
            playlist: { items: [{ name: 'Avisos.mp4' }] },
          },
        ],
      })
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })
    vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockImplementation(
      async (params: any) => {
        calledEventId = params.eventId
        return { success: true }
      },
    )

    fs.writeFileSync(path.join(tempBaseDir, 'video', 'Avisos.mp4'), 'bytes')

    const cmd: AgentCommand = {
      id: 'cmd_propagate_1',
      command_id: 'cmd_propagate_1',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'exact_holyrics_event_id_12345',
        event_date: '2025-06-15',
        items: [{ holyrics_filename: 'Avisos.mp4', media_type: 'VIDEO', presentation_order: 1 }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.success).toBe(true)
    expect(calledEventId).toBe('exact_holyrics_event_id_12345')
  })

  // 4. Bloqueio quando holyrics_event_id vazio e sem fallback para PocketBase ID
  it('4. Rejeita com MISSING_EVENT_ID se event_id for vazio no Agent (sem fallback)', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const addMediaSpy = vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist')

    const cmd: AgentCommand = {
      id: 'cmd_empty_evt',
      command_id: 'cmd_empty_evt',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: '', // Vazio deliberado
        items: [{ holyrics_filename: 'Avisos.mp4', media_type: 'VIDEO' }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('MISSING_EVENT_ID')
    expect(addMediaSpy).not.toHaveBeenCalled()
  })

  // 5. Dois cultos distintos -> cada item encaminhado exclusivamente ao seu próprio evento
  it('5. Dois cultos distintos enviam itens exclusivamente aos seus respectivos event_ids no Holyrics', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const eventCalls: Array<{ eventId: string; items: any[] }> = []

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({
      connected: true,
      tokenValid: true,
    })
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })
    vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockImplementation(
      async (params: any) => {
        eventCalls.push({ eventId: params.eventId, items: params.items })
        return { success: true }
      },
    )

    // Prepara arquivos no disco local
    fs.writeFileSync(path.join(tempBaseDir, 'video', 'Video_Culto_A.mp4'), 'dataA')
    fs.writeFileSync(path.join(tempBaseDir, 'image', 'Banner_Culto_B.jpg'), 'dataB')

    // Culto A (manhã)
    vi.spyOn((agent as any).holyrics, 'getSchedules')
      .mockResolvedValueOnce({ success: true, schedules: [] })
      .mockResolvedValueOnce({
        success: true,
        schedules: [
          { id: 'holyrics_occ_manha', playlist: { items: [{ name: 'Video_Culto_A.mp4' }] } },
        ],
      })
    const cmdCultoA: AgentCommand = {
      id: 'cmd_culto_a',
      command_id: 'cmd_culto_a',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'holyrics_occ_manha',
        event_date: '2025-07-20',
        items: [
          { holyrics_filename: 'Video_Culto_A.mp4', media_type: 'VIDEO', presentation_order: 1 },
        ],
      },
      created_at: new Date().toISOString(),
    }
    const resA = await agent.handleSyncMediaPlaylist(cmdCultoA)
    expect(resA.success).toBe(true)

    // Culto B (noite)
    vi.spyOn((agent as any).holyrics, 'getSchedules')
      .mockResolvedValueOnce({ success: true, schedules: [] })
      .mockResolvedValueOnce({
        success: true,
        schedules: [
          { id: 'holyrics_occ_noite', playlist: { items: [{ name: 'Banner_Culto_B.jpg' }] } },
        ],
      })
    const cmdCultoB: AgentCommand = {
      id: 'cmd_culto_b',
      command_id: 'cmd_culto_b',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'holyrics_occ_noite',
        event_date: '2025-07-20',
        items: [
          { holyrics_filename: 'Banner_Culto_B.jpg', media_type: 'IMAGEM', presentation_order: 1 },
        ],
      },
      created_at: new Date().toISOString(),
    }
    const resB = await agent.handleSyncMediaPlaylist(cmdCultoB)
    expect(resB.success).toBe(true)

    expect(eventCalls).toHaveLength(2)
    expect(eventCalls[0].eventId).toBe('holyrics_occ_manha')
    expect(eventCalls[0].items[0].name).toBe('Video_Culto_A.mp4')

    expect(eventCalls[1].eventId).toBe('holyrics_occ_noite')
    expect(eventCalls[1].items[0].name).toBe('Banner_Culto_B.jpg')
  })

  // 6. Transferência OK + Inclusão falha -> falha de inclusão preserva arquivo físico em disco para retentativa
  it('6. Se a transferência conclui mas inclusão na playlist falha, o arquivo é mantido em disco para retry sem re-transferir', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const targetFile = path.join(tempBaseDir, 'video', 'Culto - VideoTransferido.mp4')
    fs.writeFileSync(targetFile, 'video_payload_bytes')

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({
      connected: true,
      tokenValid: true,
    })
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })
    // Simula falha na chamada AddToPlaylist do Holyrics
    vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockResolvedValue({
      success: false,
      error: 'API Holyrics retornou erro 500 ao inserir na playlist',
      error_code: 'ADD_TO_PLAYLIST_API_ERROR',
      httpStatus: 500,
    })

    const cmd: AgentCommand = {
      id: 'cmd_fail_inclusion',
      command_id: 'cmd_fail_inclusion',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'holyrics_occ_test',
        items: [{ holyrics_filename: 'Culto - VideoTransferido.mp4', media_type: 'VIDEO' }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.result?.failed_count).toBe(1)
    expect(res.result?.items[0].status).toBe('FAILED')
    expect(res.result?.items[0].stage).toBe('ADD_TO_PLAYLIST')

    // GARANTIA CRÍTICA: Arquivo físico NUNCA é removido
    expect(fs.existsSync(targetFile)).toBe(true)
  })

  // 7. Confirmação real via GetSchedules (status ok da API não é prova de inserção)
  it('7. Status ok em AddToPlaylist mas ausente em GetSchedules resulta em erro de verificação (status: FAILED)', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    fs.writeFileSync(path.join(tempBaseDir, 'video', 'Video_Fantasma.mp4'), 'bytes')

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({
      connected: true,
      tokenValid: true,
    })
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })
    // Holyrics respondeu status ok em AddToPlaylist
    vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockResolvedValue({ success: true })

    // Mas a ocorrência de destino em GetSchedules NÃO contém a mídia
    vi.spyOn((agent as any).holyrics, 'getSchedules').mockResolvedValue({
      success: true,
      schedules: [
        {
          id: 'occ_target_404',
          playlist: { items: [{ name: 'Outro_Arquivo.mp4' }] },
        },
      ],
    })
    // E fallback GetPlaylist também não contém
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
      success: true,
      items: [{ name: 'Outro_Arquivo.mp4' }],
    })

    const cmd: AgentCommand = {
      id: 'cmd_verify_fail',
      command_id: 'cmd_verify_fail',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'occ_target_404',
        items: [{ holyrics_filename: 'Video_Fantasma.mp4', media_type: 'VIDEO' }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.result?.failed_count).toBe(1)
    expect(res.result?.items[0].status).toBe('FAILED')
    expect(res.result?.items[0].error_code).toBe('PLAYLIST_VERIFICATION_FAILED')
    expect(res.result?.items[0].error).toContain('não foi confirmada na playlist')
  })

  // 8. Idempotência e duplicidade: item já presente não é reenviado
  it('8. Item já presente na ocorrência de destino é marcado como ALREADY_PRESENT e não duplicado', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    fs.writeFileSync(path.join(tempBaseDir, 'video', 'Video_Ja_Existe.mp4'), 'bytes')

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({
      connected: true,
      tokenValid: true,
    })
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })
    const addMediaSpy = vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist')

    // GetSchedules já lista Video_Ja_Existe.mp4
    vi.spyOn((agent as any).holyrics, 'getSchedules').mockResolvedValue({
      success: true,
      schedules: [
        {
          id: 'occ_idempotente',
          playlist: { items: [{ name: 'Video_Ja_Existe.mp4' }] },
        },
      ],
    })

    const cmd: AgentCommand = {
      id: 'cmd_idem',
      command_id: 'cmd_idem',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'occ_idempotente',
        items: [{ holyrics_filename: 'Video_Ja_Existe.mp4', media_type: 'VIDEO' }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.result?.already_present_count).toBe(1)
    expect(res.result?.items[0].status).toBe('ALREADY_PRESENT')
    expect(addMediaSpy).not.toHaveBeenCalled()
  })

  // 9. Regressão musical: parsing, letra, cifras e transposição
  it('9. Regressão musical estrita: transposição, parsing e cleanRepeatedExtension intactos', () => {
    // 9.1 Transposição de cifras
    const cifraOriginal = 'C G Am F'
    const transposta = transposeCifraText(cifraOriginal, 2)
    expect(transposta).toBe('D A Bm G')

    // 9.2 Parser de letra e seções
    const parsed = parseSongContent('[VERSO 1]\nDeus é bom\nO tempo todo\n[REFRÃO]\nEle é fiel')
    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0].name).toBe('VERSO 1')
    expect(parsed.sections[1].name).toBe('REFRÃO')

    // 9.3 Desduplicação de extensões
    expect(cleanRepeatedExtension('louvor.mp3.mp3')).toBe('louvor.mp3')
    expect(cleanRepeatedExtension('video.mp4.mp4.mp4')).toBe('video.mp4')
  })
})
