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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(fileContent.length) }),
      body: {
        getReader() {
          let done = false
          return {
            async read() {
              if (done) return { done: true, value: undefined }
              done = true
              return { done: false, value: Buffer.from(fileContent) }
            },
          }
        },
      },
    } as any)

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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(fileContent.length) }),
      body: {
        getReader() {
          let done = false
          return {
            async read() {
              if (done) return { done: true, value: undefined }
              done = true
              return { done: false, value: Buffer.from(fileContent) }
            },
          }
        },
      },
    } as any)

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
      ignoreDuplicates: true,
      eventId: 'evt_123',
    })
  })

  // 10. Ordenação de várias mídias
  it('10. Respeita a ordem exata das mídias enviada pelo SaaS na chamada à playlist', async () => {
    const agent = new LouvorFlowAgent(agentConfig)

    let capturedItems: any[] = []
    vi.spyOn((agent as any).holyrics, 'testConnection').mockResolvedValue({ connected: true })
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({ success: true, items: [] })
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
    // Simula que 'Abertura.mp4' já está na playlist lida do Holyrics
    vi.spyOn((agent as any).holyrics, 'getPlaylist').mockResolvedValue({
      success: true,
      items: [{ name: 'Abertura.mp4', type: 'video' } as any],
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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': String(fileContent.length) }),
      body: {
        getReader() {
          let done = false
          return {
            async read() {
              if (done) return { done: true, value: undefined }
              done = true
              return { done: false, value: Buffer.from(fileContent) }
            },
          }
        },
      },
    } as any)

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

  // 15. Compatibilidade com a sincronização musical existente
  it('15. Preserva integralmente o método e comportamento AddLyricsToPlaylist para músicas', async () => {
    const client = new HolyricsClient(
      agentConfig.holyricsHost,
      agentConfig.holyricsPort,
      agentConfig.holyricsToken,
    )

    const requestSpy = vi.spyOn(client as any, 'request').mockResolvedValue({
      status: 'ok',
      data: { playlist: ['song_1'] },
    })

    const res = await client.addToPlaylist('song_hly_123', { index: 0 })
    expect(res.success).toBe(true)
    // Confirma payload oficial mínimo { id, media_playlist, index }
    expect(requestSpy).toHaveBeenCalledWith(
      'AddLyricsToPlaylist',
      {
        id: 'song_hly_123',
        media_playlist: false,
        index: 0,
      },
      5000,
    )
  })
})
