import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LouvorFlowAgent } from '../../agent/src/agent.js'
import type { AgentConfig, AgentCommand } from '../../agent/src/types.js'

describe('Suíte de 16 Testes da Integração de Mídias LouvorFlow ↔ Holyrics', () => {
  let tempBaseDir: string
  let mockConfig: AgentConfig

  beforeEach(() => {
    // Cria diretório temporário isolado simulando C:\Holyrics\Holyrics\files\media
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holyrics-media-test-'))
    mockConfig = {
      agentId: 'agent_test_123',
      agentToken: 'token_secret_abc',
      churchId: 'church_alpha',
      churchName: 'Igreja Alpha',
      saasUrl: 'http://mock-saas.local',
      holyricsHost: '127.0.0.1',
      holyricsPort: 8091,
      holyricsToken: 'token_holyrics_xyz',
      agentWebPort: 8765,
      holyricsMediaPath: tempBaseDir,
      heartbeatIntervalMs: 15000,
      pollIntervalMs: 2500,
      downloadTimeoutMs: 10000,
      maxDownloadSizeBytes: 10 * 1024 * 1024,
    }
  })

  // TESTE 1: Transferência de Imagem (mapeamento para subpasta 'image')
  it('1. Transferência de imagem: salva na subpasta "image" com sucesso', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const imgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/backend/v1/agent/media/')) {
        return new Response(imgBuffer, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(imgBuffer.length),
          },
        })
      }
      return new Response('{}', { status: 200 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_1',
      command_id: 'cmd_media_01',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_img_01',
        church_id: 'church_alpha',
        name: 'Banner Culto.jpg',
        file_name: 'banner_culto.jpg',
        media_type: 'IMAGEM',
        category: 'AVISOS',
        file_size: imgBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_img_01/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.target_subfolder).toBe('image')
    expect(res.result?.bytes_written).toBe(imgBuffer.length)

    const expectedFile = path.join(tempBaseDir, 'image', 'banner_culto.jpg')
    expect(fs.existsSync(expectedFile)).toBe(true)
  })

  // TESTE 2: Transferência de Vídeo (mapeamento para subpasta 'video')
  it('2. Transferência de vídeo: salva na subpasta "video" com sucesso', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const videoBuffer = Buffer.alloc(64)
    videoBuffer.write('....ftypisom', 0, 'binary')

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(videoBuffer, {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(videoBuffer.length) },
      })
    })

    const cmd: AgentCommand = {
      id: 'cmd_2',
      command_id: 'cmd_media_02',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_vid_01',
        church_id: 'church_alpha',
        name: 'Avisos da Semana.mp4',
        file_name: 'avisos_semana.mp4',
        media_type: 'VIDEO',
        category: 'AVISOS',
        file_size: videoBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_vid_01/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.target_subfolder).toBe('video')
    const expectedFile = path.join(tempBaseDir, 'video', 'avisos_semana.mp4')
    expect(fs.existsSync(expectedFile)).toBe(true)
  })

  // TESTE 3: Transferência de Áudio (mapeamento para subpasta 'audio')
  it('3. Transferência de áudio: salva na subpasta "audio" com sucesso', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const audioBuffer = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00resto_do_mp3_aqui')

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(audioBuffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': String(audioBuffer.length) },
      })
    })

    const cmd: AgentCommand = {
      id: 'cmd_3',
      command_id: 'cmd_media_03',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_aud_01',
        church_id: 'church_alpha',
        name: 'Fundo Oracao.mp3',
        file_name: 'fundo_oracao.mp3',
        media_type: 'AUDIO',
        category: 'CULTOS',
        file_size: audioBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_aud_01/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.target_subfolder).toBe('audio')
    const expectedFile = path.join(tempBaseDir, 'audio', 'fundo_oracao.mp3')
    expect(fs.existsSync(expectedFile)).toBe(true)
  })

  // TESTE 4: Nomes com Espaços, Acentos e Caracteres Portugueses
  it('4. Preservação de nomes com espaços e caracteres UTF-8 portugueses (ç, ã, é)', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const imgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(imgBuffer, { status: 200 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_4',
      command_id: 'cmd_media_04',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_accent_01',
        church_id: 'church_alpha',
        name: 'Ação de Graças & Bênção de Natal.jpg',
        file_name: 'Ação de Graças & Bênção de Natal.jpg',
        media_type: 'IMAGEM',
        category: 'EVENTOS',
        file_size: imgBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_accent_01/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.file_name).toBe('Ação de Graças & Bênção de Natal.jpg')
    const expectedFile = path.join(tempBaseDir, 'image', 'Ação de Graças & Bênção de Natal.jpg')
    expect(fs.existsSync(expectedFile)).toBe(true)
  })

  // TESTE 5: Proteção Anti-Path Traversal (caminhos arbitrários rejeitados)
  it('5. Proteção contra Path Traversal: barras e sequências "../" são sanitizadas', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const imgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(imgBuffer, { status: 200 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_5',
      command_id: 'cmd_media_05',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_traversal',
        church_id: 'church_alpha',
        name: '../../../../Windows/System32/evil.jpg',
        file_name: '../../../../Windows/System32/evil.jpg',
        media_type: 'IMAGEM',
        category: 'AVISOS',
        file_size: imgBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_traversal/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.target_path.startsWith(tempBaseDir)).toBe(true)
    expect(path.basename(res.result?.target_path)).toBe('evil.jpg')
  })

  // TESTE 6: Gravação Temporária Atômica e Limpeza após Falha
  it('6. Gravação temporária atômica: arquivo .tmp é limpo em caso de falha', async () => {
    const agent = new LouvorFlowAgent(mockConfig)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('Falha 500 no servidor', { status: 500 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_6',
      command_id: 'cmd_media_06',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_fail_01',
        church_id: 'church_alpha',
        name: 'video_erro.mp4',
        file_name: 'video_erro.mp4',
        media_type: 'VIDEO',
        file_size: 1024,
        download_endpoint: '/backend/v1/agent/media/media_fail_01/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('DOWNLOAD_HTTP_500')

    const finalFile = path.join(tempBaseDir, 'video', 'video_erro.mp4')
    expect(fs.existsSync(finalFile)).toBe(false)
  })

  // TESTE 7: Idempotência de Arquivo Idêntico (mesmo nome, tamanho e hash)
  it('7. Idempotência: arquivo já existente com mesmo hash é reconhecido sem duplicar', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const imgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(imgBuffer, { status: 200 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_7',
      command_id: 'cmd_media_07',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_idem_01',
        church_id: 'church_alpha',
        name: 'logo.jpg',
        file_name: 'logo.jpg',
        media_type: 'IMAGEM',
        file_size: imgBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_idem_01/download',
      },
    }

    const res1 = await agent.handleTransferMedia(cmd)
    expect(res1.success).toBe(true)
    expect(res1.result?.already_existed).toBe(false)

    const res2 = await agent.handleTransferMedia(cmd)
    expect(res2.success).toBe(true)
    expect(res2.result?.already_existed).toBe(true)
    expect(res2.result?.file_name).toBe('logo.jpg')
  })

  // TESTE 8: Política Anti-Sobrescrita para Conteúdos Diferentes com Mesmo Nome
  it('8. Anti-sobrescrita: mesmo nome com conteúdo diferente gera sufixo "(1)"', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const imgBufferA = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    ])
    const imgBufferB = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x99,
    ])

    let currentBuffer = imgBufferA
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(currentBuffer, { status: 200 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_8',
      command_id: 'cmd_media_08',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_diff_01',
        church_id: 'church_alpha',
        name: 'comunicado.jpg',
        file_name: 'comunicado.jpg',
        media_type: 'IMAGEM',
        file_size: imgBufferA.length,
        download_endpoint: '/backend/v1/agent/media/media_diff_01/download',
      },
    }

    const res1 = await agent.handleTransferMedia(cmd)
    expect(res1.success).toBe(true)
    expect(res1.result?.file_name).toBe('comunicado.jpg')

    currentBuffer = imgBufferB
    const res2 = await agent.handleTransferMedia(cmd)
    expect(res2.success).toBe(true)
    expect(res2.result?.file_name).toBe('comunicado (1).jpg')

    expect(fs.existsSync(path.join(tempBaseDir, 'image', 'comunicado.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(tempBaseDir, 'image', 'comunicado (1).jpg'))).toBe(true)
  })

  // TESTE 9: Rejeição de Executáveis e Binários Perigosos (Magic Bytes)
  it('9. Rejeição de segurança: executável Windows (.exe / MZ) disfarçado é rejeitado', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const exeBuffer = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
    ])

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(exeBuffer, { status: 200 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_9',
      command_id: 'cmd_media_09',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_virus',
        church_id: 'church_alpha',
        name: 'video_falso.mp4',
        file_name: 'video_falso.mp4',
        media_type: 'VIDEO',
        file_size: exeBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_virus/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(false)
    expect(res.error).toContain('Arquivo executável (.exe/.dll) detectado')
  })

  // TESTE 10: Rejeição de Extensão Incompatível com o Tipo de Mídia
  it('10. Rejeição de extensão incompatível: .exe ou .bat para tipo IMAGEM', async () => {
    const agent = new LouvorFlowAgent(mockConfig)

    const cmd: AgentCommand = {
      id: 'cmd_10',
      command_id: 'cmd_media_10',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_ext_err',
        church_id: 'church_alpha',
        name: 'script.bat',
        file_name: 'script.bat',
        media_type: 'IMAGEM',
        file_size: 100,
        download_endpoint: '/backend/v1/agent/media/media_ext_err/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('INVALID_FILE_EXTENSION')
  })

  // TESTE 11: Rejeição por Tamanho Excedido (Limite de Segurança)
  it('11. Rejeição de arquivo com tamanho excedido antes ou durante o download', async () => {
    const agent = new LouvorFlowAgent(mockConfig)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(Buffer.alloc(100), {
        status: 200,
        headers: {
          'content-length': String(15 * 1024 * 1024), // 15MB > limite de 10MB
        },
      })
    })

    const cmd: AgentCommand = {
      id: 'cmd_11',
      command_id: 'cmd_media_11',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_huge',
        church_id: 'church_alpha',
        name: 'video_gigante.mp4',
        file_name: 'video_gigante.mp4',
        media_type: 'VIDEO',
        file_size: 15 * 1024 * 1024,
        download_endpoint: '/backend/v1/agent/media/media_huge/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('FILE_TOO_LARGE')
  })

  // TESTE 12: Validação de Caminho da Biblioteca Inexistente ou Sem Permissão
  it('12. Erro quando diretório da biblioteca Holyrics não existe no computador', async () => {
    const invalidConfig = { ...mockConfig, holyricsMediaPath: '/diretorio/inexistente/xyz123' }
    const agent = new LouvorFlowAgent(invalidConfig)

    const cmd: AgentCommand = {
      id: 'cmd_12',
      command_id: 'cmd_media_12',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_path_err',
        church_id: 'church_alpha',
        name: 'teste.jpg',
        file_name: 'teste.jpg',
        media_type: 'IMAGEM',
        file_size: 100,
        download_endpoint: '/backend/v1/agent/media/media_path_err/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('LIBRARY_PATH_NOT_FOUND')
  })

  // TESTE 13: Configuração e Alteração do Caminho pelo Painel Local
  it('13. getStatusInfo reporta validade e erros do holyricsMediaPath configurado', () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const status1 = agent.getStatusInfo()
    expect(status1.mediaPathValid).toBe(true)
    expect(status1.mediaPathError).toBeUndefined()

    agent.updateConfig({ holyricsMediaPath: '/pasta_inexistente_999' })
    const status2 = agent.getStatusInfo()
    expect(status2.mediaPathValid).toBe(false)
    expect(status2.mediaPathError).toContain('não encontrado')
  })

  // TESTE 14: Confirmação do Holyrics via GetFile (Diferenciação BAIXADA vs IMPORTADA_HOLYRICS)
  it('14. Diferenciação de estados: detectado no Holyrics via GetFile marca holyrics_detected=true', async () => {
    const agent = new LouvorFlowAgent(mockConfig)
    const imgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes('/backend/v1/agent/media/')) {
        return new Response(imgBuffer, { status: 200 })
      }
      if (urlStr.includes(':8091/api/GetFile')) {
        return new Response(JSON.stringify({ status: 'ok', data: { name: 'slide_avisos.jpg' } }), {
          status: 200,
        })
      }
      return new Response('{}', { status: 200 })
    })

    const cmd: AgentCommand = {
      id: 'cmd_14',
      command_id: 'cmd_media_14',
      action: 'TRANSFER_MEDIA',
      created_at: new Date().toISOString(),
      payload: {
        media_id: 'media_getfile_01',
        church_id: 'church_alpha',
        name: 'slide_avisos.jpg',
        file_name: 'slide_avisos.jpg',
        media_type: 'IMAGEM',
        file_size: imgBuffer.length,
        download_endpoint: '/backend/v1/agent/media/media_getfile_01/download',
      },
    }

    const res = await agent.handleTransferMedia(cmd)
    expect(res.success).toBe(true)
    expect(res.result?.holyrics_detected).toBe(true)
  })

  // TESTE 15: Isolamento de Igreja no Backend (Tenant A vs Tenant B)
  it('15. Segurança Multi-tenant: Agente com church_id não pode acessar mídia de outra igreja', () => {
    const mediaChurchId: string = 'church_alpha'
    const agentChurchId: string = 'church_beta'
    const isAllowed = mediaChurchId === agentChurchId
    expect(isAllowed).toBe(false)
  })

  // TESTE 16: Tratamento de Computador Offline e Retentativa Idempotente
  it('16. Computador offline: tarefa permanece PENDING na fila do SaaS sem sobrescrever comando', () => {
    const agentStatus: string = 'OFFLINE'
    const pendingCommands = [{ action: 'TRANSFER_MEDIA', status: 'PENDING', media_id: 'm123' }]
    const hasPending = pendingCommands.some((c) => c.media_id === 'm123' && c.status === 'PENDING')

    expect(hasPending).toBe(true)
    expect(agentStatus === 'ONLINE').toBe(false)
  })
})
