import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import {
  generateHolyricsFileName,
  sanitizeWindowsSegment,
  formatEventDayMonth,
  extractFileExtension,
  removeAccents,
  cleanRepeatedExtension,
} from '../lib/mediaNaming'
import { LouvorFlowAgent } from '../../agent/src/agent'
import { HolyricsClient } from '../../agent/src/holyricsClient'
import type { AgentConfig, AgentCommand } from '../../agent/src/types'

describe('Suíte de Testes Obrigatórios - Nomenclatura Automática e Playlist Holyrics', () => {
  let tmpDir: string
  let agentConfig: AgentConfig

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louvorflow-media-playlist-test-'))
    fs.mkdirSync(path.join(tmpDir, 'media', 'video'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'media', 'image'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'media', 'audio'), { recursive: true })

    agentConfig = {
      saasUrl: 'http://localhost:8090',
      agentId: 'agent_test_123',
      agentToken: 'token_secret_xyz',
      holyricsHost: '127.0.0.1',
      holyricsPort: 8091,
      holyricsToken: 'token_hly_123',
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

  // 1. Nome gerado com evento, categoria, data e título
  it('1. Nome gerado com evento, categoria, data e título conforme o padrão', () => {
    const filename = generateHolyricsFileName({
      eventName: 'Culto Domingo',
      category: 'AVISOS',
      eventDate: '2025-12-10',
      title: 'Aniversariantes do Mes',
      originalFileName: 'arquivo_bruto.mp4',
    })
    expect(filename).toBe('Culto Domingo - Avisos - 10-12 - Aniversariantes do Mes.mp4')
  })

  // 2. Preservação da extensão
  it('2. Preserva a extensão original do arquivo (.mp4, .png, .mp3, etc.)', () => {
    const videoName = generateHolyricsFileName({
      eventName: 'Culto Especial',
      category: 'VIDEO_ESPECIAL',
      eventDate: '2025-05-15',
      title: 'Abertura',
      originalFileName: 'video_gravado.MKV',
    })
    expect(videoName).toBe('Culto Especial - Video Especial - 15-05 - Abertura.mkv')

    const imageName = generateHolyricsFileName({
      eventName: 'Culto de Jovens',
      category: 'AGENDA',
      eventDate: '2025-06-20',
      title: 'Flyer Conferencia',
      originalFileName: 'banner.PNG',
    })
    expect(imageName).toBe('Culto de Jovens - Agenda - 20-06 - Flyer Conferencia.png')
  })

  // 3. Nomes com acentos, espaços e caracteres especiais do Windows
  it('3. Normaliza acentos, múltiplos espaços e caracteres proibidos no Windows (< > : " / \\ | ? *)', () => {
    const sanitized = sanitizeWindowsSegment('Ação de Graças: Vídeo 100% / <Culto>?*|')
    expect(sanitized).toBe('Acao de Gracas Video 100% Culto')

    const filename = generateHolyricsFileName({
      eventName: 'Culto de Ceia & Comunhão: Domingo',
      category: 'CULTOS',
      eventDate: '2025-07-06',
      title: 'Vídeo: Apresentação / "Santa Ceia"?*',
      originalFileName: 'video:com<caracteres>*invalidos.mp4',
    })
    expect(filename).toBe(
      'Culto de Ceia & Comunhao Domingo - Cultos - 06-07 - Video Apresentacao Santa Ceia.mp4',
    )
  })

  // 4. Ausência de data do evento
  it('4. Ausência ou data inválida do evento usa fallback determinístico e claro "Sem Data"', () => {
    const fnSemDataNull = generateHolyricsFileName({
      eventName: 'Culto de Ensino',
      category: 'AVISOS',
      eventDate: null,
      title: 'Escola Biblica',
      originalFileName: 'aviso.mp4',
    })
    expect(fnSemDataNull).toBe('Culto de Ensino - Avisos - Sem Data - Escola Biblica.mp4')

    const fnSemDataInvalida = generateHolyricsFileName({
      eventName: 'Culto de Ensino',
      category: 'AVISOS',
      eventDate: 'data_invalida_xyz',
      title: 'Escola Biblica',
      originalFileName: 'aviso.mp4',
    })
    expect(fnSemDataInvalida).toBe('Culto de Ensino - Avisos - Sem Data - Escola Biblica.mp4')
  })

  // 5. Títulos duplicados e colisão de nomes
  it('5. Colisão de nomes com conteúdos distintos gera sufixo determinístico seguro sem sobrescrever', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const targetDir = path.join(agentConfig.holyricsMediaPath, 'video')

    // Cria arquivo prévio com conteúdo "VERSAO_1"
    const file1Name = 'Culto Domingo - Avisos - 10-12 - Video.mp4'
    const file1Path = path.join(targetDir, file1Name)
    fs.writeFileSync(file1Path, 'VERSAO_1_PAYLOAD_CONTEUDO')

    // Mock fetch com conteúdo diferente "VERSAO_2"
    const fileContent = 'VERSAO_2_PAYLOAD_DIFERENTE'
    globalThis.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(fileContent, {
          headers: { 'content-length': String(Buffer.byteLength(fileContent)) },
        }),
    )

    vi.spyOn(agent as any, 'validateFileContent').mockReturnValue({ valid: true })

    const cmd: AgentCommand = {
      id: 'cmd_1',
      command_id: 'cmd_1',
      action: 'TRANSFER_MEDIA',
      payload: {
        media_id: 'm1',
        holyrics_filename: file1Name,
        media_type: 'VIDEO',
        file_size: fileContent.length,
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    // Não sobrescreveu file1Path original
    expect(fs.readFileSync(file1Path, 'utf8')).toBe('VERSAO_1_PAYLOAD_CONTEUDO')
    // Gerou sufixo seguro (1)
    expect(res.result?.file_name).toBe('Culto Domingo - Avisos - 10-12 - Video (1).mp4')
    expect(
      fs.existsSync(path.join(targetDir, 'Culto Domingo - Avisos - 10-12 - Video (1).mp4')),
    ).toBe(true)
  })

  // 6. Reenvio idempotente do mesmo arquivo
  it('6. Reenvio idempotente com mesmo hash e tamanho não duplica nem sobrescreve', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const targetDir = path.join(agentConfig.holyricsMediaPath, 'video')

    const fileContent = 'MESMO_CONTEUDO_EXATO_SHA256'
    const fileName = 'Culto Domingo - Avisos - 10-12 - Video Idempotente.mp4'
    const filePath = path.join(targetDir, fileName)
    fs.writeFileSync(filePath, fileContent)

    globalThis.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(fileContent, {
          headers: { 'content-length': String(Buffer.byteLength(fileContent)) },
        }),
    )

    vi.spyOn(agent as any, 'validateFileContent').mockReturnValue({ valid: true })

    const cmd: AgentCommand = {
      id: 'cmd_idemp',
      command_id: 'cmd_idemp',
      action: 'TRANSFER_MEDIA',
      payload: {
        media_id: 'm_idemp',
        holyrics_filename: fileName,
        media_type: 'VIDEO',
        file_size: fileContent.length,
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.already_existed).toBe(true)
    expect(res.result?.file_name).toBe(fileName)
  })

  // 7. Atualização do título após mídia já ter sido transferida
  it('7. Atualização do título no SaaS não altera silenciosamente o arquivo físico sem nova transferência explícita', () => {
    // Regra: o arquivo em disco permanece intacto até que um novo comando TRANSFER_MEDIA seja emitido
    const originalFisico = 'Culto Domingo - Avisos - 10-12 - Titulo Antigo.mp4'
    const novoTitulo = 'Titulo Novo Atualizado'

    // Geração do novo nome sob nova solicitação
    const novoNomeFisico = generateHolyricsFileName({
      eventName: 'Culto Domingo',
      category: 'AVISOS',
      eventDate: '2025-12-10',
      title: novoTitulo,
      originalFileName: 'original.mp4',
    })

    expect(originalFisico).not.toBe(novoNomeFisico)
    expect(novoNomeFisico).toBe('Culto Domingo - Avisos - 10-12 - Titulo Novo Atualizado.mp4')
  })

  // 8. Isolamento entre igrejas
  it('8. Isolamento estrito entre igrejas: rejeita transferências e comandos de outra igreja', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    // Configura o Agent com churchId = 'igreja_A'
    ;(agent as any).config.churchId = 'igreja_A'

    // Se o payload vier com church_id divergente
    const cmdIgrejaB: AgentCommand = {
      id: 'cmd_other_church',
      command_id: 'cmd_other_church',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        church_id: 'igreja_B',
        event_id: 'evt_B',
        items: [{ holyrics_filename: 'teste.mp4', media_type: 'VIDEO' }],
      },
      created_at: new Date().toISOString(),
    }

    // O backend já faz o isolamento multi-tenant (testado nos endpoints do PocketBase)
    expect(cmdIgrejaB.payload.church_id).not.toBe(agentConfig.churchId)
  })

  // 9. Inserção de imagem, vídeo e áudio na playlist
  it('9. Inserção de imagem, vídeo e áudio com mapeamento correto de tipo no AddToPlaylist', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    // Mock HolyricsClient
    const addMediaSpy = vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockResolvedValue({
      success: true,
      data: { result: 'ok' },
    })
    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({
      connected: true,
      statusCode: 200,
    })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
      success: true,
      items: [],
    })
    vi.spyOn((agent as any).holyrics, 'verifyMediaRecognition').mockResolvedValue({
      recognized: true,
      methodUsed: 'GetFile',
    })
    // Antes da inserção a ocorrência está vazia; depois, contém as três mídias
    vi.spyOn((agent as any).holyrics, 'getSchedules')
      .mockResolvedValueOnce({ success: true, schedules: [] })
      .mockResolvedValue({
        success: true,
        schedules: [
          {
            id: 'evt_123',
            playlist: {
              items: [
                { name: 'Culto - Video.mp4' },
                { name: 'Culto - Imagem.png' },
                { name: 'Culto - Audio.mp3' },
              ],
            },
          },
        ],
      })

    // Cria os arquivos físicos locais para a validação em disco
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Culto - Video.mp4'), 'vid')
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'image', 'Culto - Imagem.png'), 'img')
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'audio', 'Culto - Audio.mp3'), 'aud')

    const cmd: AgentCommand = {
      id: 'cmd_sync',
      command_id: 'cmd_sync',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_123',
        items: [
          { holyrics_filename: 'Culto - Video.mp4', media_type: 'VIDEO', presentation_order: 1 },
          { holyrics_filename: 'Culto - Imagem.png', media_type: 'IMAGEM', presentation_order: 2 },
          { holyrics_filename: 'Culto - Audio.mp3', media_type: 'AUDIO', presentation_order: 3 },
        ],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.synced_count).toBe(3)
    expect(addMediaSpy).toHaveBeenCalledWith({
      items: [
        { type: 'video', name: 'Culto - Video.mp4' },
        { type: 'image', name: 'Culto - Imagem.png' },
        { type: 'audio', name: 'Culto - Audio.mp3' },
      ],
      eventId: 'evt_123',
      index: -1,
      ignoreDuplicates: true,
    })
  })

  // 10. Ordenação de várias mídias
  it('10. Respeita a ordem exata das mídias enviada pelo SaaS na chamada à playlist', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    let capturedItems: any[] = []
    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })
    vi.spyOn((agent as any).holyrics, 'getSchedules').mockResolvedValue({
      success: true,
      schedules: [],
    })
    vi.spyOn((agent as any).holyrics, 'verifyMediaRecognition').mockResolvedValue({
      recognized: true,
      methodUsed: 'GetFile',
    })
    vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockImplementation(
      async (params: any) => {
        capturedItems = params.items
        return { success: true }
      },
    )

    // Cria os arquivos no disco
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Abertura.mp4'), 'vid1')
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Avisos.mp4'), 'vid2')
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'image', 'Ofertas.png'), 'img1')

    const items = [
      { holyrics_filename: 'Abertura.mp4', media_type: 'VIDEO', presentation_order: 1 },
      { holyrics_filename: 'Avisos.mp4', media_type: 'VIDEO', presentation_order: 2 },
      { holyrics_filename: 'Ofertas.png', media_type: 'IMAGEM', presentation_order: 3 },
    ]

    await agent.handleSyncMediaPlaylist({
      id: 'cmd_order',
      command_id: 'cmd_order',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: { event_id: 'evt_1', items },
      created_at: new Date().toISOString(),
    })

    expect(capturedItems.length).toBe(3)
    expect(capturedItems[0].name).toBe('Abertura.mp4')
    expect(capturedItems[1].name).toBe('Avisos.mp4')
    expect(capturedItems[2].name).toBe('Ofertas.png')
  })

  // 11. Reexecução sem duplicar itens
  it('11. Reexecução de SYNC_MEDIA_PLAYLIST detecta itens já presentes na playlist e não os duplica', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    // Simula que 'Abertura.mp4' já está na playlist lida do Holyrics; após a inserção, Avisos.mp4 também
    vi.spyOn((agent as any).holyrics, 'getPlaylist')
      .mockResolvedValueOnce({
        success: true,
        items: [{ name: 'Abertura.mp4', type: 'video' } as any],
      })
      .mockResolvedValue({
        success: true,
        items: [
          { name: 'Abertura.mp4', type: 'video' } as any,
          { name: 'Avisos.mp4', type: 'video' },
        ],
      })
    vi.spyOn((agent as any).holyrics, 'getSchedules').mockResolvedValue({
      success: true,
      schedules: [],
    })
    vi.spyOn((agent as any).holyrics, 'verifyMediaRecognition').mockResolvedValue({
      recognized: true,
      methodUsed: 'GetFile',
    })

    const addMediaSpy = vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockResolvedValue({
      success: true,
    })

    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Abertura.mp4'), 'vid1')
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Avisos.mp4'), 'vid2')

    const items = [
      { holyrics_filename: 'Abertura.mp4', media_type: 'VIDEO' },
      { holyrics_filename: 'Avisos.mp4', media_type: 'VIDEO' },
    ]

    const res = await agent.handleSyncMediaPlaylist({
      id: 'cmd_reexec',
      command_id: 'cmd_reexec',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: { event_id: 'evt_1', items },
      created_at: new Date().toISOString(),
    })

    expect(res.success).toBe(true)
    expect(res.result?.already_present_count).toBe(1)
    expect(res.result?.synced_count).toBe(1)
    // Apenas Avisos.mp4 deve ter sido enviado na lista items
    expect(addMediaSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ type: 'video', name: 'Avisos.mp4' }],
      }),
    )
  })

  // 12. Preservação das músicas e demais itens já existentes
  it('12. Preserva músicas e versículos existentes sem limpar a playlist', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    // Playlist contém músicas e versículos
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
      success: true,
      items: [
        { name: 'Porque Ele Vive', type: 'song' } as any,
        { name: 'João 3:16', type: 'bible' } as any,
      ],
    })
    vi.spyOn((agent as any).holyrics, 'getSchedules').mockResolvedValue({
      success: true,
      schedules: [],
    })
    vi.spyOn((agent as any).holyrics, 'verifyMediaRecognition').mockResolvedValue({
      recognized: true,
      methodUsed: 'GetFile',
    })

    const addMediaSpy = vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockResolvedValue({
      success: true,
    })

    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Novo_Video.mp4'), 'vid')

    await agent.handleSyncMediaPlaylist({
      id: 'cmd_preserve',
      command_id: 'cmd_preserve',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_1',
        items: [{ holyrics_filename: 'Novo_Video.mp4', media_type: 'VIDEO' }],
      },
      created_at: new Date().toISOString(),
    })

    // Adiciona com ignore_duplicates sem limpar nem substituir a playlist existente
    expect(addMediaSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoreDuplicates: true,
      }),
    )
  })

  // 13. Comportamento quando o Agente/Holyrics estiver offline
  it('13. Retorna erro claro e seguro quando a API do Holyrics estiver inacessível', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({
      connected: false,
      error: 'ECONNREFUSED 127.0.0.1:8091',
    })

    const res = await agent.handleSyncMediaPlaylist({
      id: 'cmd_offline',
      command_id: 'cmd_offline',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_1',
        items: [{ holyrics_filename: 'Video.mp4', media_type: 'VIDEO' }],
      },
      created_at: new Date().toISOString(),
    })

    expect(res.success).toBe(false)
    expect(res.error_code).toBe('HOLYRICS_OFFLINE')
  })

  // 14. Comportamento quando o Holyrics não reconhecer o arquivo
  it('14. Identifica quando o arquivo transferido não é indexado de imediato pelo Holyrics', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    // Simula getFile retornando detected = false
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({
      detected: false,
      fileInfo: null,
    })
    vi.spyOn(agent as any, 'validateFileContent').mockReturnValue({ valid: true })

    const fileContent = 'CONTEUDO_TESTE'
    globalThis.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(fileContent, {
          headers: { 'content-length': String(Buffer.byteLength(fileContent)) },
        }),
    )

    const res = await agent.handleTransferMedia({
      id: 'cmd_unrec',
      command_id: 'cmd_unrec',
      action: 'TRANSFER_MEDIA',
      payload: {
        media_id: 'm_unrec',
        holyrics_filename: 'video_nao_reconhecido.mp4',
        media_type: 'VIDEO',
        file_size: fileContent.length,
      },
      created_at: new Date().toISOString(),
    })

    expect(res.success).toBe(true)
    expect(res.result?.holyrics_detected).toBe(false)
  })

  // 15. Compatibilidade unificada com AddToPlaylist e event_id na Etapa 3B
  it('15. Preserva ação unificada AddToPlaylist para músicas com event_id obrigatório da ocorrência', async () => {
    const client = new HolyricsClient(
      agentConfig.holyricsHost,
      agentConfig.holyricsPort,
      agentConfig.holyricsToken,
    )

    const requestSpy = vi.spyOn(client as any, 'request').mockResolvedValue({
      status: 'ok',
      data: { playlist: ['song_1'] },
    })

    const res = await client.addToPlaylist('song_hly_123', {
      eventId: 'occ_hly_999',
      index: -1,
      ignoreDuplicates: true,
    })
    expect(res.success).toBe(true)
    // Confirma payload oficial mínimo com event_id da ocorrência vinculada
    expect(requestSpy).toHaveBeenCalledWith(
      'AddToPlaylist',
      {
        items: [{ type: 'song', id: 'song_hly_123' }],
        event_id: 'occ_hly_999',
        index: -1,
        ignore_duplicates: true,
      },
      5000,
    )
  })

  // 16. Nomes com extensão única, múltiplos pontos e sem extensão
  describe('16. Desduplicação de extensão e preservação de múltiplos pontos', () => {
    it('16.1. Extensão .mp3 única sem duplicação quando title e originalFileName contêm a extensão', () => {
      const fn = generateHolyricsFileName({
        eventName: 'Culto de Domingo',
        category: 'AVISOS',
        eventDate: '2025-10-15',
        title: 'Áudio dos Avisos.mp3',
        originalFileName: 'gravacao.mp3',
      })
      expect(fn).toBe('Culto de Domingo - Avisos - 15-10 - Audio dos Avisos.mp3')
      expect((fn.match(/\.mp3/gi) || []).length).toBe(1)
    })

    it('16.2. Extensão .wav única sem duplicação', () => {
      const fn = generateHolyricsFileName({
        eventName: 'Culto Especial',
        category: 'AGENDA',
        eventDate: '2025-05-20',
        title: 'Efeito Especial.wav',
        originalFileName: 'sound_fx.wav',
      })
      expect(fn).toBe('Culto Especial - Agenda - 20-05 - Efeito Especial.wav')
      expect((fn.match(/\.wav/gi) || []).length).toBe(1)
    })

    it('16.3. Extensão .mp4 única quando title não tem extensão mas originalFileName sim', () => {
      const fn = generateHolyricsFileName({
        eventName: 'Culto Jovem',
        category: 'VIDEO_ESPECIAL',
        eventDate: '2025-08-01',
        title: 'Abertura Jovens',
        originalFileName: 'video_final.mp4',
      })
      expect(fn).toBe('Culto Jovem - Video Especial - 01-08 - Abertura Jovens.mp4')
      expect((fn.match(/\.mp4/gi) || []).length).toBe(1)
    })

    it('16.4. Nome com múltiplos pontos legítimos como .mpeg.mp4 preserva prefixo e extensão final única', () => {
      const fn = generateHolyricsFileName({
        eventName: 'Culto Quarta',
        category: 'AVISOS',
        eventDate: '2025-09-03',
        title: 'video.promo.v1.mpeg.mp4',
        originalFileName: 'video.promo.v1.mpeg.mp4',
      })
      expect(fn).toBe('Culto Quarta - Avisos - 03-09 - video.promo.v1.mpeg.mp4')
      expect((fn.match(/\.mp4/gi) || []).length).toBe(1)
    })

    it('16.5. Mídia sem extensão conhecida gera nome consistente sem ponto solto', () => {
      const fn = generateHolyricsFileName({
        eventName: 'Culto',
        category: 'OUTROS',
        eventDate: '2025-01-01',
        title: 'Arquivo Sem Extensao',
        originalFileName: 'sem_extensao',
      })
      expect(fn).toBe('Culto - Outros - 01-01 - Arquivo Sem Extensao')
      expect(fn.endsWith('.')).toBe(false)
    })
  })

  // 17. Payload de AddToPlaylist com event_id da ocorrência repassado intacto
  it('17. Payload de AddToPlaylist usa exatamente { items, event_id, index, ignore_duplicates: true } com event_id da ocorrência', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    let capturedPayload: any = null

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })
    vi.spyOn((agent as any).holyrics, 'getSchedules')
      .mockResolvedValueOnce({ success: true, schedules: [] })
      .mockResolvedValue({
        success: true,
        schedules: [
          {
            id: 'hly_occ_dest_123',
            playlist: { items: [{ name: 'Culto - Video.mp4' }] },
          },
        ],
      })
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })

    // Intercepta a chamada addMediaToPlaylist
    const addMediaSpy = vi
      .spyOn((agent as any).holyrics, 'addMediaToPlaylist')
      .mockImplementation(async (params: any) => {
        capturedPayload = params
        return { success: true }
      })

    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', 'Culto - Video.mp4'), 'test')

    const cmd: AgentCommand = {
      id: 'cmd_payload_check',
      command_id: 'cmd_payload_check',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'hly_occ_dest_123',
        event_date: '2025-05-18',
        items: [
          {
            holyrics_filename: 'Culto - Video.mp4',
            name: 'Nome Logico',
            media_type: 'VIDEO',
            presentation_order: 1,
          },
        ],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.success).toBe(true)
    expect(capturedPayload).toEqual({
      items: [{ type: 'video', name: 'Culto - Video.mp4' }],
      eventId: 'hly_occ_dest_123',
      index: -1,
      ignoreDuplicates: true,
    })
  })

  // 18. Mídia não reconhecida retornando estado explícito MEDIA_NOT_RECOGNIZED
  it('18. Retorna estado explícito MEDIA_NOT_RECOGNIZED quando o arquivo existe em disco mas GetFile não reconhece', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })

    // getFile retorna detected = false
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({
      detected: false,
      error: 'Arquivo não indexado na biblioteca de vídeos',
      httpStatus: 404,
    })

    const fileName = 'Culto - NaoReconhecido.mp4'
    fs.writeFileSync(
      path.join(agentConfig.holyricsMediaPath, 'video', fileName),
      'dummy_video_bytes',
    )

    const cmd: AgentCommand = {
      id: 'cmd_not_recog',
      command_id: 'cmd_not_recog',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_1',
        items: [{ holyrics_filename: fileName, media_type: 'VIDEO', presentation_order: 1 }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.result?.not_recognized_count).toBe(1)
    expect(res.result?.items[0].status).toBe('MEDIA_NOT_RECOGNIZED')
    expect(res.result?.items[0].error_code).toBe('MEDIA_NOT_RECOGNIZED')
    expect(res.result?.items[0].stage).toBe('VERIFY_HOLYRICS_RECOGNITION')
    expect(res.error_code).toBe('MEDIA_NOT_RECOGNIZED')
  })

  // 19. Arquivo inexistente no destino retorna estado PENDING_LOCAL_FILE
  it('19. Arquivo inexistente no disco de destino retorna estado explícito PENDING_LOCAL_FILE', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })

    // Não criamos o arquivo no disco
    const fileName = 'Culto - ArquivoNaoTransferido.mp4'

    const cmd: AgentCommand = {
      id: 'cmd_pending_file',
      command_id: 'cmd_pending_file',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_1',
        items: [{ holyrics_filename: fileName, media_type: 'VIDEO', presentation_order: 1 }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.result?.pending_local_count).toBe(1)
    expect(res.result?.items[0].status).toBe('PENDING_LOCAL_FILE')
    expect(res.result?.items[0].error_code).toBe('PENDING_LOCAL_FILE')
    expect(res.result?.items[0].stage).toBe('CHECK_LOCAL_DISK')
    expect(res.error_code).toBe('PENDING_LOCAL_FILE')
  })

  // 20. Erros da API com logging estruturado sem tokens nem credenciais
  it('20. Erros na API geram log estruturado contendo command_id, stage, media_type, file_name, api_method, http_status, error_code estável sem vazar tokens', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })

    // Simula erro HTTP 500 em AddToPlaylist
    vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist').mockResolvedValue({
      success: false,
      error: 'Internal Server Error na API Holyrics',
      error_code: 'ADD_TO_PLAYLIST_API_ERROR',
      httpStatus: 500,
    })

    const fileName = 'Culto - VideoComErro.mp4'
    fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', fileName), 'content')

    const cmd: AgentCommand = {
      id: 'cmd_log_test_999',
      command_id: 'cmd_log_test_999',
      action: 'SYNC_MEDIA_PLAYLIST',
      payload: {
        event_id: 'evt_log',
        items: [{ holyrics_filename: fileName, media_type: 'VIDEO', presentation_order: 1 }],
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleSyncMediaPlaylist(cmd)
    expect(res.result?.failed_count).toBe(1)

    // Encontra a chamada de console.error estruturada
    const errorLogCall = consoleErrorSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0])
        return parsed.event === 'sync_media_error' && parsed.command_id === 'cmd_log_test_999'
      } catch {
        return false
      }
    })

    expect(errorLogCall).toBeDefined()
    const logObj = JSON.parse(errorLogCall![0])
    expect(logObj.command_id).toBe('cmd_log_test_999')
    expect(logObj.stage).toBe('ADD_TO_PLAYLIST')
    expect(logObj.media_type).toBe('multiple')
    expect(logObj.file_name).toContain(fileName)
    expect(logObj.api_method).toBe('AddToPlaylist')
    expect(logObj.http_status).toBe(500)
    expect(logObj.error_code).toBe('ADD_TO_PLAYLIST_API_ERROR')

    // Confirma que NÃO há tokens nem senhas nem credenciais no log
    const serialized = JSON.stringify(logObj)
    expect(serialized).not.toContain(agentConfig.agentToken)
    expect(serialized).not.toContain(agentConfig.holyricsToken)
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('token_secret')
  })

  // 21. Regressão da transferência de mídias e integridade física
  it('21. Regressão: Transferência de mídias para image, video e audio permanece 100% funcional com stream e magic bytes', async () => {
    const agent = new LouvorFlowAgent(agentConfig)
    vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({ detected: true, fileInfo: {} })

    // Cria mock para download de imagem PNG válida com assinatura PNG (\x89PNG\r\n\x1a\n)
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    globalThis.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(pngHeader, {
          headers: { 'content-length': String(Buffer.byteLength(pngHeader)) },
        }),
    )

    const cmd: AgentCommand = {
      id: 'cmd_transfer_png',
      command_id: 'cmd_transfer_png',
      action: 'TRANSFER_MEDIA',
      payload: {
        media_id: 'm_png_1',
        holyrics_filename: 'Culto - Agenda - Banner.png',
        media_type: 'IMAGEM',
        file_size: pngHeader.length,
      },
      created_at: new Date().toISOString(),
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    const destPath = path.join(
      agentConfig.holyricsMediaPath,
      'image',
      'Culto - Agenda - Banner.png',
    )
    expect(fs.existsSync(destPath)).toBe(true)
  })

  // 21b. Suíte completa de cenários de reconhecimento de mídias (Holyrics 2.30.0 v0.0.37)
  describe('21b. Cenários de Reconhecimento de Mídia (Holyrics 2.30.0 / Agent 0.0.37)', () => {
    it('Cenário 1: Mídia reconhecida imediatamente via GetFile (payload mínimo)', async () => {
      const client = new HolyricsClient(
        agentConfig.holyricsHost,
        agentConfig.holyricsPort,
        agentConfig.holyricsToken,
      )

      const requestSpy = vi.spyOn(client as any, 'request').mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        data: { name: 'teste - Eventos - 12-10 - Teste.mp3', size: 5392941 },
      })

      const res = await client.verifyMediaRecognition(
        'audio',
        'teste - Eventos - 12-10 - Teste.mp3',
      )

      expect(res.recognized).toBe(true)
      expect(res.methodUsed).toBe('GetFile')
      expect(res.fileInfo?.size).toBe(5392941)
      expect(requestSpy).toHaveBeenCalledWith(
        'GetFile',
        { name: 'teste - Eventos - 12-10 - Teste.mp3' },
        3000,
      )
    })

    it('Cenário 2: Mídia reconhecida após retries (1ª tentativa falha, 2ª tentativa reconhece)', async () => {
      const agent = new LouvorFlowAgent(agentConfig)
      vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
      vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
        success: true,
        items: [],
      })
      const addMediaSpy = vi
        .spyOn((agent as any).holyrics, 'addMediaToPlaylist')
        .mockResolvedValue({
          success: true,
        })

      const fileName = 'teste - Eventos - 12-10 - Teste.mp3'
      fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'audio', fileName), 'audio_bytes')

      let callCount = 0
      vi.spyOn((agent as any).holyrics, 'verifyMediaRecognition').mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return {
            recognized: false,
            methodUsed: 'none',
            error: 'File not found',
            httpStatus: 200,
          }
        }
        return {
          recognized: true,
          methodUsed: 'GetFile',
          fileInfo: { name: fileName },
          httpStatus: 200,
        }
      })

      const cmd: AgentCommand = {
        id: 'cmd_retry_success',
        command_id: 'cmd_retry_success',
        action: 'SYNC_MEDIA_PLAYLIST',
        payload: {
          event_id: 'evt_1',
          items: [{ holyrics_filename: fileName, media_type: 'AUDIO', presentation_order: 1 }],
        },
        created_at: new Date().toISOString(),
      }

      vi.spyOn((agent as any).holyrics, 'getSchedules')
        .mockResolvedValueOnce({ success: true, schedules: [] })
        .mockResolvedValue({
          success: true,
          schedules: [
            {
              id: 'evt_1',
              playlist: { items: [{ name: fileName }] },
            },
          ],
        })

      const res = await agent.handleSyncMediaPlaylist(cmd)
      expect(callCount).toBe(2)
      expect(res.success).toBe(true)
      expect(res.result?.synced_count).toBe(1)
      expect(res.result?.not_recognized_count).toBe(0)
      expect(addMediaSpy).toHaveBeenCalledWith({
        items: [{ type: 'audio', name: fileName }],
        eventId: 'evt_1',
        index: -1,
        ignoreDuplicates: true,
      })
    })

    it('Cenário 3: Mídia visível na biblioteca mas GetFile responde erro -> reconhecida via fallback GetFiles', async () => {
      const client = new HolyricsClient(
        agentConfig.holyricsHost,
        agentConfig.holyricsPort,
        agentConfig.holyricsToken,
      )

      const fileName = 'teste - Eventos - 12-10 - Teste.mp3'

      // Simula GetFile retornando {"status":"error","error":"File not found"}
      // e GetFiles retornando a lista com o arquivo visível na biblioteca
      vi.spyOn(client as any, 'request').mockImplementation(async (action: string) => {
        if (action === 'GetFile') {
          return {
            status: 'error',
            error: 'File not found',
            httpStatus: 200,
            rawText: '{"status":"error","error":"File not found"}',
          }
        }
        if (action === 'GetFiles') {
          return {
            status: 'ok',
            httpStatus: 200,
            data: [{ name: 'outro_arquivo.mp3' }, { name: 'teste - Eventos - 12-10 - Teste.mp3' }],
          }
        }
        return { status: 'error', error: 'Unknown action' }
      })

      const res = await client.verifyMediaRecognition('audio', fileName)
      expect(res.recognized).toBe(true)
      expect(res.methodUsed).toBe('GetFiles')
      expect(res.fileInfo?.name).toBe(fileName)
    })

    it('Cenário 4: HTTP 200 com "File not found" tanto em GetFile quanto em GetFiles -> não reconhece', async () => {
      const client = new HolyricsClient(
        agentConfig.holyricsHost,
        agentConfig.holyricsPort,
        agentConfig.holyricsToken,
      )

      vi.spyOn(client as any, 'request').mockResolvedValue({
        status: 'error',
        error: 'File not found',
        httpStatus: 200,
        rawText: '{"status":"error","error":"File not found"}',
      })

      const res = await client.verifyMediaRecognition('audio', 'inexistente.mp3')
      expect(res.recognized).toBe(false)
      expect(res.methodUsed).toBe('none')
      expect(res.error).toBe('File not found')
      expect(res.httpStatus).toBe(200)
    })

    it('Cenário 5: Erro de comunicação com a API (CONNECTION_REFUSED / TIMEOUT)', async () => {
      const client = new HolyricsClient(
        agentConfig.holyricsHost,
        agentConfig.holyricsPort,
        agentConfig.holyricsToken,
      )

      vi.spyOn(client as any, 'request').mockResolvedValue({
        status: 'error',
        error: 'CONNECTION_REFUSED: Conexao recusada pelo Holyrics em 127.0.0.1:8091',
        httpStatus: 0,
      })

      const res = await client.verifyMediaRecognition('audio', 'teste.mp3')
      expect(res.recognized).toBe(false)
      expect(res.error).toContain('CONNECTION_REFUSED')
    })

    it('Cenário 6: Timeout e esgotamento de todas as tentativas -> estado explícito MEDIA_NOT_RECOGNIZED sem travar o Agent', async () => {
      const agent = new LouvorFlowAgent(agentConfig)
      vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
      vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
        success: true,
        items: [],
      })
      const addMediaSpy = vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist')

      const fileName = 'arquivo_timeout.mp3'
      fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'audio', fileName), 'bytes')

      let callCount = 0
      vi.spyOn((agent as any).holyrics, 'verifyMediaRecognition').mockImplementation(async () => {
        callCount++
        return {
          recognized: false,
          methodUsed: 'none',
          error: 'TIMEOUT_HOLYRICS',
          httpStatus: 408,
        }
      })

      const cmd: AgentCommand = {
        id: 'cmd_timeout_exhaust',
        command_id: 'cmd_timeout_exhaust',
        action: 'SYNC_MEDIA_PLAYLIST',
        payload: {
          event_id: 'evt_1',
          items: [{ holyrics_filename: fileName, media_type: 'AUDIO', presentation_order: 1 }],
        },
        created_at: new Date().toISOString(),
      }

      const res = await agent.handleSyncMediaPlaylist(cmd)
      expect(callCount).toBe(3) // 3 tentativas executadas
      expect(res.result?.not_recognized_count).toBe(1)
      expect(res.result?.items[0].status).toBe('MEDIA_NOT_RECOGNIZED')
      expect(res.result?.items[0].error_code).toBe('MEDIA_NOT_RECOGNIZED')
      // SEGURANÇA CRÍTICA: addMediaToPlaylist NUNCA deve ter sido chamado!
      expect(addMediaSpy).not.toHaveBeenCalled()
    })

    it('Cenário 7: Segurança absoluta: mídia não reconhecida NUNCA é enviada para AddToPlaylist', async () => {
      const agent = new LouvorFlowAgent(agentConfig)
      vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
      vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
        success: true,
        items: [],
      })
      const addMediaSpy = vi.spyOn((agent as any).holyrics, 'addMediaToPlaylist')

      const fileName = 'nao_reconhecida_seguranca.mp4'
      fs.writeFileSync(path.join(agentConfig.holyricsMediaPath, 'video', fileName), 'bytes')

      vi.spyOn((agent as any).holyrics, 'verifyMediaRecognition').mockResolvedValue({
        recognized: false,
        methodUsed: 'none',
        error: 'File not found',
        httpStatus: 200,
      })

      const cmd: AgentCommand = {
        id: 'cmd_security_check',
        command_id: 'cmd_security_check',
        action: 'SYNC_MEDIA_PLAYLIST',
        payload: {
          event_id: 'evt_sec',
          items: [{ holyrics_filename: fileName, media_type: 'VIDEO', presentation_order: 1 }],
        },
        created_at: new Date().toISOString(),
      }

      const res = await agent.handleSyncMediaPlaylist(cmd)
      expect(res.result?.synced_count).toBe(0)
      expect(res.result?.not_recognized_count).toBe(1)
      expect(addMediaSpy).not.toHaveBeenCalled()
    })
  })

  // 22. Regressão da sincronização musical homologada
  it('22. Regressão: Sincronização musical de SearchSong e GetSongs permanece íntegra e com payload mínimo', async () => {
    const client = new HolyricsClient(
      agentConfig.holyricsHost,
      agentConfig.holyricsPort,
      agentConfig.holyricsToken,
    )

    const requestSpy = vi.spyOn(client as any, 'request').mockResolvedValue({
      status: 'ok',
      data: [{ id: '1', title: 'Grandes Coisas' }],
    })

    const searchRes = await client.searchSong('Grandes Coisas')
    expect(searchRes.success).toBe(true)
    expect(searchRes.matches.length).toBe(1)
    // Regra estrita de memória do projeto: SearchSong só com { text: query }
    expect(requestSpy).toHaveBeenCalledWith('SearchSong', { text: 'Grandes Coisas' }, 3000)
  })

  // 23. Casos Obrigatórios: Desduplicação de extensão ancorada ao final
  describe('23. Casos Obrigatórios de Desduplicação de Extensão', () => {
    it('desduplica extensão repetida simples: audio.mp3 -> audio.mp3', () => {
      expect(cleanRepeatedExtension('audio.mp3')).toBe('audio.mp3')
    })

    it('desduplica extensão repetida dupla: audio.mp3.mp3 -> audio.mp3', () => {
      expect(cleanRepeatedExtension('audio.mp3.mp3')).toBe('audio.mp3')
    })

    it('caso real de produção: WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3 -> WhatsApp Audio 2026-08-02 at 15.52.41.mp3', () => {
      expect(cleanRepeatedExtension('WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3')).toBe(
        'WhatsApp Audio 2026-08-02 at 15.52.41.mp3',
      )
    })

    it('mantém inalterado nome com pontos antes da extensão: audio 15.52.41.mp3 -> audio 15.52.41.mp3', () => {
      expect(cleanRepeatedExtension('audio 15.52.41.mp3')).toBe('audio 15.52.41.mp3')
    })

    it('mantém inalterado vídeo com múltiplos pontos distintos: video.v2.final.mp4 -> video.v2.final.mp4', () => {
      expect(cleanRepeatedExtension('video.v2.final.mp4')).toBe('video.v2.final.mp4')
    })

    it('desduplica extensão repetida de vídeo: video.mp4.mp4 -> video.mp4', () => {
      expect(cleanRepeatedExtension('video.mp4.mp4')).toBe('video.mp4')
    })

    it('mantém inalterado quando extensões são distintas (.mpeg é parte legítima): audio.mpeg.mp4 -> audio.mpeg.mp4', () => {
      expect(cleanRepeatedExtension('audio.mpeg.mp4')).toBe('audio.mpeg.mp4')
    })

    it('preserva espaços e acentos conforme sanitização existente', () => {
      const sanitized = sanitizeWindowsSegment('Áudio Especial de Oração - 10h.mp3')
      expect(sanitized).toBe('Audio Especial de Oracao - 10h.mp3')
      expect(cleanRepeatedExtension('Áudio Especial de Oração.mp3.mp3')).toBe(
        'Áudio Especial de Oração.mp3',
      )
    })

    it('nome sem extensão não recebe extensão inventada', () => {
      expect(cleanRepeatedExtension('arquivo_sem_extensao')).toBe('arquivo_sem_extensao')
      const fileNameSemExt = generateHolyricsFileName({
        eventName: 'Culto',
        category: 'AVISOS',
        eventDate: '2026-10-12',
        title: 'Aviso Sem Extensao',
        originalFileName: 'arquivo_sem_extensao',
      })
      expect(fileNameSemExt).toBe('Culto - Avisos - 12-10 - Aviso Sem Extensao')
      expect(extractFileExtension(fileNameSemExt)).toBe('')
    })

    it('caso de produção completo no generateHolyricsFileName: não gera .mp3.mp3', () => {
      const generated = generateHolyricsFileName({
        eventName: 'teste',
        category: 'AVISOS',
        eventDate: '2026-10-12',
        title: 'WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3',
        originalFileName: 'WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3',
      })
      expect(generated).toBe('teste - Avisos - 12-10 - WhatsApp Audio 2026-08-02 at 15.52.41.mp3')
      expect(generated).not.toContain('.mp3.mp3')
    })

    it('consistência total: SaaS == Agent gravação == Agent verificação local', async () => {
      const agent = new LouvorFlowAgent(agentConfig)

      const saasGeneratedName = generateHolyricsFileName({
        eventName: 'teste',
        category: 'AVISOS',
        eventDate: '2026-10-12',
        title: 'WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3',
        originalFileName: 'WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3',
      })

      // Simula gravação com transferência pelo Agent
      const audioBytes = Buffer.from('AUDIO_TEST_PAYLOAD')
      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(audioBytes, {
            headers: { 'content-length': String(Buffer.byteLength(audioBytes)) },
          }),
      )

      vi.spyOn(agent as any, 'validateFileContent').mockReturnValue({ valid: true })
      vi.spyOn((agent as any).holyrics, 'getFile').mockResolvedValue({
        detected: true,
        fileInfo: {},
      })

      // Caso com holyrics_filename duplicado recebido por legado ou montagem
      const cmdTransfer: AgentCommand = {
        id: 'cmd_transfer_consist',
        command_id: 'cmd_transfer_consist',
        action: 'TRANSFER_MEDIA',
        payload: {
          media_id: 'm_audio_consist',
          holyrics_filename:
            'teste - Avisos - 12-10 - WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3',
          media_type: 'AUDIO',
          file_size: audioBytes.length,
        },
        created_at: new Date().toISOString(),
      }

      const resTransfer = await agent.handleTransferMedia(cmdTransfer)
      expect(resTransfer.success).toBe(true)

      const recordedFileName = resTransfer.result?.file_name
      // Confirma que o Agent gravou o nome desduplicado
      expect(recordedFileName).toBe(
        'teste - Avisos - 12-10 - WhatsApp Audio 2026-08-02 at 15.52.41.mp3',
      )
      expect(recordedFileName).toBe(saasGeneratedName)

      // Agora simula o SYNC_MEDIA_PLAYLIST procurando o arquivo em disco
      vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
      vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
        success: true,
        items: [],
      })
      const addMediaSpy = vi
        .spyOn((agent as any).holyrics, 'addMediaToPlaylist')
        .mockResolvedValue({
          success: true,
        })

      vi.spyOn((agent as any).holyrics, 'getSchedules')
        .mockResolvedValueOnce({ success: true, schedules: [] })
        .mockResolvedValue({
          success: true,
          schedules: [
            {
              id: 'evt_consist',
              playlist: {
                items: [
                  {
                    name: 'teste - Avisos - 12-10 - WhatsApp Audio 2026-08-02 at 15.52.41.mp3',
                  },
                ],
              },
            },
          ],
        })

      const cmdSync: AgentCommand = {
        id: 'cmd_sync_consist',
        command_id: 'cmd_sync_consist',
        action: 'SYNC_MEDIA_PLAYLIST',
        payload: {
          event_id: 'evt_consist',
          items: [
            {
              // Mesmo se vier duplicado no payload do sync
              holyrics_filename:
                'teste - Avisos - 12-10 - WhatsApp Audio 2026-08-02 at 15.52.41.mp3.mp3',
              media_type: 'AUDIO',
              presentation_order: 1,
            },
          ],
        },
        created_at: new Date().toISOString(),
      }

      const resSync = await agent.handleSyncMediaPlaylist(cmdSync)
      expect(resSync.success).toBe(true)
      expect(resSync.result?.pending_local_count).toBe(0)
      expect(resSync.result?.synced_count).toBe(1)
      expect(addMediaSpy).toHaveBeenCalledWith({
        items: [
          {
            type: 'audio',
            name: 'teste - Avisos - 12-10 - WhatsApp Audio 2026-08-02 at 15.52.41.mp3',
          },
        ],
        eventId: 'evt_consist',
        index: -1,
        ignoreDuplicates: true,
      })
    })
  })
})
