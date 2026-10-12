import os from 'os'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { AgentConfig, AgentCommand, AgentStatusInfo } from './types.js'
import { HolyricsClient } from './holyricsClient.js'
import { saveConfig } from './config.js'

export class LouvorFlowAgent {
  private config: AgentConfig
  private holyrics: HolyricsClient
  private isRunning = false
  private pollTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null

  private lastHeartbeat: string | undefined
  private lastPoll: string | undefined
  private lastError: string | undefined

  private holyricsDetected = false
  private holyricsVersion: string | undefined

  constructor(config: AgentConfig) {
    this.config = config
    this.holyrics = new HolyricsClient(
      config.holyricsHost,
      config.holyricsPort,
      config.holyricsToken,
    )
  }

  public updateConfig(newConfig: Partial<AgentConfig>) {
    this.config = { ...this.config, ...newConfig }
    this.holyrics.updateConfig(
      this.config.holyricsHost,
      this.config.holyricsPort,
      this.config.holyricsToken,
    )
  }

  public getConfig(): AgentConfig {
    return { ...this.config }
  }

  public getStatusInfo(): AgentStatusInfo {
    const isPaired = Boolean(this.config.agentId && this.config.agentToken)
    let agentStatus: 'CONNECTED' | 'DISCONNECTED' | 'PAIRING_REQUIRED' = 'PAIRING_REQUIRED'

    if (isPaired) {
      agentStatus = this.lastHeartbeat ? 'CONNECTED' : 'DISCONNECTED'
    }

    // Valida permissão do caminho da biblioteca local
    let mediaPathValid = false
    let mediaPathError: string | undefined = undefined
    try {
      if (fs.existsSync(this.config.holyricsMediaPath)) {
        fs.accessSync(this.config.holyricsMediaPath, fs.constants.R_OK | fs.constants.W_OK)
        mediaPathValid = true
      } else {
        mediaPathError = 'Diretório da biblioteca não encontrado no disco local.'
      }
    } catch (err: any) {
      mediaPathError = `Sem permissão de leitura/escrita na pasta: ${err.message}`
    }

    return {
      agentStatus,
      holyricsStatus: this.holyricsDetected
        ? 'DETECTED'
        : !this.config.holyricsToken
          ? 'UNAUTHORIZED'
          : 'NOT_DETECTED',
      holyricsVersion: this.holyricsVersion,
      holyricsHost: this.config.holyricsHost,
      holyricsPort: this.config.holyricsPort,
      holyricsHasToken: Boolean(this.config.holyricsToken),
      saasUrl: this.config.saasUrl,
      churchName: this.config.churchName,
      machineName: this.config.machineName || os.hostname(),
      lastHeartbeat: this.lastHeartbeat,
      lastPoll: this.lastPoll,
      lastError: this.lastError,
      holyricsMediaPath: this.config.holyricsMediaPath,
      mediaPathValid,
      mediaPathError,
    }
  }

  /**
   * Conecta com LouvorFlow usando o código de pareamento de 6 dígitos
   */
  public async pairWithCode(
    code: string,
    saasUrlOverride?: string,
  ): Promise<{ success: boolean; message: string; church_name?: string }> {
    const saasUrl = saasUrlOverride || this.config.saasUrl
    const url = `${saasUrl.replace(/\/+$/, '')}/backend/v1/agent/pair`

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          pairing_code: code,
          machine_name: this.config.machineName || os.hostname(),
          platform: `${os.platform()} ${os.arch()}`,
          version: '0.0.34',
          api_port: this.config.holyricsPort,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        this.config.agentId = data.agent_id
        this.config.agentToken = data.agent_token
        this.config.churchId = data.church_id
        this.config.churchName = data.church_name
        if (saasUrlOverride) {
          this.config.saasUrl = saasUrlOverride
        }

        saveConfig(this.config)
        console.log(`[Agent] Pareado com sucesso à igreja: ${data.church_name}`)

        // Dispara heartbeat imediato
        await this.sendHeartbeat()
        return {
          success: true,
          message: 'Pareado com sucesso!',
          church_name: data.church_name,
        }
      }

      const errMsg = data.message || 'Código de pareamento inválido.'
      this.lastError = errMsg
      return { success: false, message: errMsg }
    } catch (err: any) {
      const errMsg = `Falha de conexão com LouvorFlow (${saasUrl}): ${err.message}`
      this.lastError = errMsg
      return { success: false, message: errMsg }
    }
  }

  /**
   * Testa a Holyrics Local API
   */
  public async testHolyrics(): Promise<{
    connected: boolean
    tokenValid: boolean
    version?: string
    permissions?: string
    message: string
  }> {
    const res = await this.holyrics.testConnection()
    this.holyricsDetected = res.connected && res.tokenValid
    if (res.version) this.holyricsVersion = res.version

    if (res.connected && res.tokenValid) {
      return {
        ...res,
        message: `🟢 Holyrics respondendo com sucesso! Versão: ${res.version || '2.x'}`,
      }
    }

    if (res.connected && !res.tokenValid) {
      return {
        ...res,
        message: '⚠️ Holyrics detectado, mas o token configurado é inválido.',
      }
    }

    return {
      ...res,
      message: res.error || '🔴 Holyrics não detectado na porta 8091.',
    }
  }

  /**
   * Diagnóstico do SearchSong solicitado pelo usuário
   */
  public async diagnoseSearchSong(query: string) {
    const timestamp = new Date().toISOString()
    console.log(
      `[Agent Diagnostic] [${timestamp}] Executando diagnóstico real SearchSong para query: "${query}"`,
    )
    const result = await this.holyrics.diagnoseSearchSong(query)
    console.log(
      `[Agent Diagnostic] Endpoint: ${result.endpoint} | Status HTTP: ${result.httpStatus} | Duração: ${result.durationMs}ms | Resultados: ${result.count}`,
    )
    if (result.error) {
      console.log(`[Agent Diagnostic] Erro retornado: ${result.error}`)
    }
    return result
  }

  /**
   * Inicia loops em background
   */
  public start() {
    if (this.isRunning) return
    this.isRunning = true
    console.log('[Agent] Serviço iniciado.')

    // 1. Testa Holyrics inicialmente
    this.testHolyrics().catch(() => {})

    // 2. Loop de Heartbeat
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat()
    }, this.config.heartbeatIntervalMs)

    // 3. Loop de Polling de Comandos
    this.pollTimer = setInterval(async () => {
      await this.pollCommands()
    }, this.config.pollIntervalMs)

    // Executa primeira rodada agora
    this.sendHeartbeat().catch(() => {})
  }

  public stop() {
    this.isRunning = false
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.pollTimer) clearInterval(this.pollTimer)
    console.log('[Agent] Serviço pausado.')
  }

  /**
   * Heartbeat para LouvorFlow
   */
  private async sendHeartbeat() {
    if (!this.config.agentId || !this.config.agentToken) return

    // Verifica Holyrics
    const hRes = await this.holyrics.testConnection().catch(() => ({
      connected: false,
      tokenValid: false,
      version: undefined,
    }))
    this.holyricsDetected = hRes.connected && hRes.tokenValid
    if (hRes.version) this.holyricsVersion = hRes.version

    const url = `${this.config.saasUrl.replace(/\/+$/, '')}/backend/v1/agent/heartbeat`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-token': this.config.agentToken,
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          version: '0.0.34',
          holyrics_detected: this.holyricsDetected,
          holyrics_version: this.holyricsVersion || '',
          api_port: this.config.holyricsPort,
        }),
      })

      if (res.ok) {
        this.lastHeartbeat = new Date().toISOString()
        this.lastError = undefined
      } else if (res.status === 403 || res.status === 401) {
        this.lastError = 'Token de agente revogado pelo servidor LouvorFlow.'
      }
    } catch (err: any) {
      this.lastError = `Heartbeat falhou: ${err.message}`
    }
  }

  /**
   * Polling de comandos
   */
  private async pollCommands() {
    if (!this.config.agentId || !this.config.agentToken) return

    const url = `${this.config.saasUrl.replace(/\/+$/, '')}/backend/v1/agent/commands/poll`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-token': this.config.agentToken,
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
        }),
      })

      if (!res.ok) return
      const data = await res.json()
      this.lastPoll = new Date().toISOString()

      const commands: AgentCommand[] = data.commands || []
      for (const cmd of commands) {
        console.log(
          `[Agent] [${new Date().toISOString()}] Comando recebido via poll: action="${cmd.action}", command_id="${cmd.command_id}"`,
        )
        await this.executeCommand(cmd)
      }
    } catch (err: any) {
      // Falha de rede silenciosa com retry no próximo intervalo
    }
  }

  /**
   * Executa comando atribuído e envia resultado
   */
  private async executeCommand(cmd: AgentCommand) {
    const startTime = Date.now()
    const timestampStart = new Date().toISOString()
    console.log(
      JSON.stringify({
        timestamp: timestampStart,
        event: 'command_start',
        command_id: cmd.command_id,
        operation: cmd.action,
        status: 'RUNNING',
      }),
    )

    let status: 'DONE' | 'FAILED' = 'DONE'
    let resultPayload: any = {}
    let errorMsg = ''
    let errorCode: string | undefined = undefined

    try {
      switch (cmd.action) {
        case 'TEST_CONNECTION': {
          const testRes = await this.holyrics.testConnection()
          if (testRes.connected && testRes.tokenValid) {
            status = 'DONE'
            resultPayload = {
              version: testRes.version,
              permissions: testRes.permissions,
              status: 'ok',
            }
          } else {
            status = 'FAILED'
            errorMsg = testRes.error || 'Holyrics indisponível.'
            errorCode = testRes.code
            resultPayload = { error_code: testRes.code }
          }
          break
        }

        case 'SEARCH_SONG': {
          const query = String(cmd.payload?.query || '').trim()
          if (!query) {
            status = 'FAILED'
            errorMsg = 'Parâmetro query ausente.'
            errorCode = 'MISSING_QUERY'
            break
          }
          // Chamada oficial mínima recomendada pelo Holyrics ({ text: query })
          const searchRes = await this.holyrics.searchSong(query)

          console.log(
            `[Agent] [${new Date().toISOString()}] SEARCH_SONG executado via Holyrics endpoint "${searchRes.endpointUsed || 'SearchSong'}": duração=${searchRes.durationMs}ms, HTTP=${searchRes.httpStatus}, resultados=${searchRes.matches?.length ?? 0}, chaves_json=${JSON.stringify(searchRes.keys || [])}`,
          )

          if (searchRes.success) {
            status = 'DONE'
            resultPayload = {
              matches: searchRes.matches,
              count: searchRes.matches.length,
            }
          } else {
            status = 'FAILED'
            errorMsg = searchRes.error || 'Erro ao buscar no Holyrics.'
            errorCode =
              searchRes.error === 'TIMEOUT_HOLYRICS' ? 'TIMEOUT_HOLYRICS' : 'SEARCH_FAILED'
          }
          break
        }

        case 'ADD_TO_PLAYLIST':
        case 'ADD_LYRICS_TO_PLAYLIST': {
          const holyricsSongId = String(
            cmd.payload?.holyrics_song_id || cmd.payload?.id || '',
          ).trim()
          if (!holyricsSongId) {
            status = 'FAILED'
            errorMsg = 'holyrics_song_id não informado no payload.'
            errorCode = 'MISSING_SONG_ID'
            break
          }
          const playlistIndex =
            cmd.payload?.index !== undefined && cmd.payload?.index !== null
              ? Number(cmd.payload.index)
              : undefined
          const mediaPlaylist = cmd.payload?.media_playlist ?? false

          const addRes = await this.holyrics.addToPlaylist(holyricsSongId, {
            index: playlistIndex,
            media_playlist: mediaPlaylist,
          })
          if (addRes.success) {
            status = 'DONE'
            resultPayload = {
              added: true,
              holyrics_song_id: holyricsSongId,
              title: cmd.payload?.title,
              index: playlistIndex,
              data: addRes.data,
            }
          } else {
            status = 'FAILED'
            errorMsg = addRes.error || 'Falha ao adicionar à playlist.'
            errorCode = addRes.error_code || 'ADD_PLAYLIST_FAILED'
            resultPayload = { error_code: errorCode }
          }
          break
        }

        case 'GET_SONGS': {
          const fields = cmd.payload?.fields ? String(cmd.payload.fields) : undefined
          const songsRes = await this.holyrics.getSongs(fields)
          if (songsRes.success) {
            status = 'DONE'
            resultPayload = {
              songs: songsRes.songs,
              count: songsRes.songs.length,
            }
          } else {
            status = 'FAILED'
            errorMsg = songsRes.error || 'Erro ao consultar GetSongs no Holyrics.'
            errorCode = songsRes.error_code || 'GET_SONGS_FAILED'
            resultPayload = { error_code: errorCode }
          }
          break
        }

        case 'GET_SONG_PLAYLIST': {
          const playlistRes = await this.holyrics.getSongPlaylist()
          if (playlistRes.success) {
            status = 'DONE'
            resultPayload = {
              items: playlistRes.items,
              count: playlistRes.items.length,
            }
          } else {
            status = 'FAILED'
            errorMsg = playlistRes.error || 'Erro ao consultar GetSongPlaylist no Holyrics.'
            errorCode = playlistRes.error_code || 'GET_SONG_PLAYLIST_FAILED'
            resultPayload = { error_code: errorCode }
          }
          break
        }

        case 'CREATE_SONG': {
          const title = String(cmd.payload?.title || '').trim()
          if (!title) {
            status = 'FAILED'
            errorMsg = 'Título da música é obrigatório para CreateSong.'
            errorCode = 'MISSING_TITLE'
            break
          }
          const createRes = await this.holyrics.createSong({
            title,
            artist: cmd.payload?.artist,
            author: cmd.payload?.author,
            note: cmd.payload?.note,
            copyright: cmd.payload?.copyright,
            slides: cmd.payload?.slides || [],
            formatting_type: cmd.payload?.formatting_type || 'basic',
            order: cmd.payload?.order,
            key: cmd.payload?.key,
            bpm: cmd.payload?.bpm,
            time_sig: cmd.payload?.time_sig,
          })

          if (createRes.success && createRes.id) {
            status = 'DONE'
            resultPayload = {
              created: true,
              holyrics_song_id: createRes.id,
              data: createRes.data,
            }
          } else {
            status = 'FAILED'
            errorMsg = createRes.error || 'Erro ao criar música no Holyrics.'
            errorCode = createRes.error_code || 'CREATE_SONG_FAILED'
            resultPayload = { error_code: errorCode }
          }
          break
        }

        case 'GET_LYRICS_PLAYLIST': {
          const playlistRes = await this.holyrics.getLyricsPlaylist()
          if (playlistRes.success) {
            status = 'DONE'
            resultPayload = {
              items: playlistRes.items,
              count: playlistRes.items.length,
            }
          } else {
            status = 'FAILED'
            errorMsg = playlistRes.error || 'Erro ao consultar playlist do Holyrics.'
            errorCode = playlistRes.error_code || 'GET_PLAYLIST_FAILED'
            resultPayload = { error_code: errorCode }
          }
          break
        }

        case 'TRANSFER_MEDIA': {
          const transferRes = await this.handleTransferMedia(cmd)
          if (transferRes.success) {
            status = 'DONE'
            resultPayload = transferRes.result
          } else {
            status = 'FAILED'
            errorMsg = transferRes.error || 'Erro na transferência da mídia.'
            errorCode = transferRes.error_code || 'TRANSFER_MEDIA_FAILED'
            resultPayload = { error_code: errorCode, ...transferRes.result }
          }
          break
        }

        case 'SYNC_MEDIA_PLAYLIST': {
          const syncMediaRes = await this.handleSyncMediaPlaylist(cmd)
          if (syncMediaRes.success) {
            status = 'DONE'
            resultPayload = syncMediaRes.result
          } else {
            status = 'FAILED'
            errorMsg = syncMediaRes.error || 'Erro na sincronização de mídias com a playlist.'
            errorCode = syncMediaRes.error_code || 'SYNC_MEDIA_PLAYLIST_FAILED'
            resultPayload = { error_code: errorCode, ...syncMediaRes.result }
          }
          break
        }

        default:
          status = 'FAILED'
          errorMsg = `Ação desconhecida: ${cmd.action}`
          errorCode = 'UNKNOWN_ACTION'
      }
    } catch (err: any) {
      status = 'FAILED'
      errorMsg = err.message || 'Erro inesperado na execução do comando.'
      errorCode = err.code || 'UNEXPECTED_ERROR'
    }

    const duration = Date.now() - startTime
    const timestampEnd = new Date().toISOString()

    console.log(
      JSON.stringify({
        timestamp: timestampEnd,
        event: 'command_finish',
        command_id: cmd.command_id,
        operation: cmd.action,
        status,
        duration_ms: duration,
        error_code: errorCode || null,
      }),
    )

    // Reporta resultado ao LouvorFlow com 1 retry simples (1s) em caso de falha de rede
    const reportUrl = `${this.config.saasUrl.replace(/\/+$/, '')}/backend/v1/agent/commands/${cmd.command_id}/result`
    const sendReport = async (): Promise<boolean> => {
      const res = await fetch(reportUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-token': this.config.agentToken,
        },
        body: JSON.stringify({
          command_id: cmd.command_id,
          status,
          result: resultPayload,
          error: errorMsg,
          duration_ms: duration,
        }),
      })
      return res.ok
    }

    try {
      const ok = await sendReport()
      if (!ok) {
        console.warn(
          `[Agent] Tentativa 1 de envio do resultado de ${cmd.command_id} retornou não-200. Tentando novamente em 1s...`,
        )
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await sendReport()
      }
    } catch (err: any) {
      console.warn(
        `[Agent] Falha de rede ao enviar resultado do comando ${cmd.command_id}: ${err.message}. Tentando novamente em 1s...`,
      )
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await sendReport()
        console.log(`[Agent] Resultado do comando ${cmd.command_id} entregue com sucesso no retry.`)
      } catch (retryErr: any) {
        console.error(
          `[Agent] Falha definitiva no retry ao enviar resultado do comando ${cmd.command_id}:`,
          retryErr.message,
        )
      }
    }
  }

  /**
   * Executa transferência segura de mídia para o disco local do Holyrics:
   * 1. Valida biblioteca base autorizada no Agent (NUNCA vinda do SaaS)
   * 2. Mapeia subpasta estrita controlada pelo Agent (image, video, audio, automaticPresentations)
   * 3. Baixa em arquivo temporário .tmp com stream
   * 4. Valida tamanho, extensão permitida e conteúdo real (magic bytes)
   * 5. Aplica política anti-duplicação e anti-sobrescrita atômica
   * 6. Move atomicamente para o destino final
   * 7. Consulta GetFile no Holyrics para testar indexação/reconhecimento
   */
  /**
   * handleSyncMediaPlaylist:
   * Processa o comando SYNC_MEDIA_PLAYLIST
   * Adiciona mídias do evento à playlist do Holyrics respeitando ordem e unicidade
   */
  public async handleSyncMediaPlaylist(cmd: AgentCommand): Promise<{
    success: boolean
    result?: any
    error?: string
    error_code?: string
  }> {
    const payload = cmd.payload || {}
    const eventId = payload.event_id ? String(payload.event_id) : undefined
    const itemsRaw = Array.isArray(payload.items) ? payload.items : []

    if (itemsRaw.length === 0) {
      return {
        success: true,
        result: {
          synced_count: 0,
          already_present_count: 0,
          failed_count: 0,
          items: [],
          message: 'Nenhuma mídia para sincronizar na playlist.',
        },
      }
    }

    // Valida se o Holyrics está respondendo
    const ping = await this.holyrics.testConnection()
    if (!ping.connected) {
      return {
        success: false,
        error: ping.error || 'Holyrics API offline ou inacessível no momento da sincronização.',
        error_code: 'HOLYRICS_OFFLINE',
        result: { synced_count: 0, failed_count: itemsRaw.length },
      }
    }

    // Ordena itens pela ordem litúrgica informada (presentation_order)
    const sortedItems = [...itemsRaw].sort((a, b) => {
      const orderA = Number(a.presentation_order) || 0
      const orderB = Number(b.presentation_order) || 0
      return orderA - orderB
    })

    // Consulta playlist atual para verificar existência prévia e não duplicar músicas/versículos/mídias existentes
    let existingItemNames = new Set<string>()
    try {
      const currentPlaylist = await this.holyrics.getPlaylist({
        type: 'all',
        event_id: eventId,
      })
      if (currentPlaylist.success && Array.isArray(currentPlaylist.items)) {
        for (const item of currentPlaylist.items) {
          const name = String(item.name || item.title || '')
            .trim()
            .toLowerCase()
          if (name) existingItemNames.add(name)
        }
      }
    } catch (_) {
      // Falha não impeditiva na leitura prévia
    }

    const itemsToAdd: Array<{ type: 'video' | 'image' | 'audio' | 'file'; name: string }> = []
    const detailedResults: Array<{
      id?: string
      name: string
      status: 'ADDED' | 'ALREADY_PRESENT' | 'FAILED' | 'PENDING_LOCAL_FILE'
      error?: string
    }> = []

    for (const item of sortedItems) {
      // Usa o nome físico exato com extensão (holyrics_filename)
      const fileName = String(item.holyrics_filename || item.name || '').trim()
      const mediaType = String(item.media_type || '').toUpperCase()

      if (!fileName) {
        detailedResults.push({
          id: item.id,
          name: 'Desconhecido',
          status: 'FAILED',
          error:
            'Nome do arquivo de mídia ausente. Ação recomendada: recadastre a mídia com nome válido.',
        })
        continue
      }

      // Validação local prévia: verifica se o arquivo físico existe na biblioteca local antes de chamar o Holyrics
      let holyricsType: 'video' | 'image' | 'audio' | 'file' = 'file'
      let subfolder = 'video'
      if (mediaType === 'VIDEO') {
        holyricsType = 'video'
        subfolder = 'video'
      } else if (mediaType === 'IMAGEM') {
        holyricsType = 'image'
        subfolder = 'image'
      } else if (mediaType === 'AUDIO') {
        holyricsType = 'audio'
        subfolder = 'audio'
      } else if (mediaType === 'DOCUMENTO') {
        holyricsType = 'file'
        subfolder = 'automaticPresentations'
      }

      const expectedLocalPath = path.join(
        path.resolve(this.config.holyricsMediaPath),
        subfolder,
        fileName,
      )
      const fileExistsOnDisk = fs.existsSync(expectedLocalPath)

      if (!fileExistsOnDisk) {
        detailedResults.push({
          id: item.id,
          name: fileName,
          status: 'PENDING_LOCAL_FILE',
          error: `Arquivo "${fileName}" não encontrado na biblioteca local (${subfolder}). Ação recomendada: execute a transferência do arquivo para o computador antes de sincronizar com a playlist.`,
        })
        continue
      }

      const lowerName = fileName.toLowerCase()
      if (existingItemNames.has(lowerName)) {
        detailedResults.push({
          id: item.id,
          name: fileName,
          status: 'ALREADY_PRESENT',
        })
        continue
      }

      itemsToAdd.push({
        type: holyricsType,
        name: fileName,
      })
    }

    let addedCount = 0
    let failedCount = 0

    if (itemsToAdd.length > 0) {
      const addRes = await this.holyrics.addMediaToPlaylist({
        items: itemsToAdd,
        ignoreDuplicates: true,
        eventId,
      })

      if (addRes.success) {
        // Verificação pós-operação via GetPlaylist para comprovar que os itens foram realmente inseridos na ordem
        let verifiedNames = new Set<string>()
        try {
          const postPlaylist = await this.holyrics.getPlaylist({
            type: 'all',
            event_id: eventId,
          })
          if (postPlaylist.success && Array.isArray(postPlaylist.items)) {
            for (const item of postPlaylist.items) {
              const name = String(item.name || item.title || '')
                .trim()
                .toLowerCase()
              if (name) verifiedNames.add(name)
            }
          }
        } catch (_) {}

        for (const added of itemsToAdd) {
          const isVerified = verifiedNames.size === 0 || verifiedNames.has(added.name.toLowerCase())
          if (isVerified) {
            detailedResults.push({
              name: added.name,
              status: 'ADDED',
            })
            addedCount++
          } else {
            detailedResults.push({
              name: added.name,
              status: 'FAILED',
              error:
                'Holyrics retornou sucesso mas o arquivo não consta na playlist verificada. Ação recomendada: verifique se o arquivo foi indexado pelo Holyrics.',
            })
            failedCount++
          }
        }
      } else {
        for (const added of itemsToAdd) {
          detailedResults.push({
            name: added.name,
            status: 'FAILED',
            error: `${addRes.error || 'Erro na API Holyrics AddToPlaylist'}. Ação recomendada: verifique se a API do Holyrics está habilitada com permissão de playlist.`,
          })
          failedCount++
        }
      }
    }

    const alreadyPresentCount = detailedResults.filter((r) => r.status === 'ALREADY_PRESENT').length
    const pendingLocalCount = detailedResults.filter(
      (r) => r.status === 'PENDING_LOCAL_FILE',
    ).length

    return {
      success:
        (failedCount === 0 && pendingLocalCount === 0) || addedCount > 0 || alreadyPresentCount > 0,
      result: {
        synced_count: addedCount,
        already_present_count: alreadyPresentCount,
        pending_local_count: pendingLocalCount,
        failed_count: failedCount,
        items: detailedResults,
      },
      error:
        failedCount > 0 && addedCount === 0 && alreadyPresentCount === 0
          ? 'Falha ao incluir mídias na playlist'
          : undefined,
    }
  }

  public async handleTransferMedia(cmd: AgentCommand): Promise<{
    success: boolean
    result?: Record<string, any>
    error?: string
    error_code?: string
  }> {
    const payload = cmd.payload || {}
    const mediaId = String(payload.media_id || '').trim()
    // Prioriza o nome físico padronizado gerado pelo SaaS (holyrics_filename)
    const fileNameParam = String(
      payload.holyrics_filename || payload.file_name || payload.name || '',
    ).trim()
    const mediaType = String(payload.media_type || '').toUpperCase()
    const expectedSize = Number(payload.file_size) || 0
    const downloadEndpoint = String(
      payload.download_endpoint || `/backend/v1/agent/media/${mediaId}/download`,
    ).trim()

    if (!mediaId) {
      return {
        success: false,
        error: 'media_id ausente no payload de transferência.',
        error_code: 'MISSING_MEDIA_ID',
      }
    }

    // 1. Sanitiza nome do arquivo para gravação no SO local
    // Preserva acentos, espaços e caracteres portugueses (ex: "Avisos Domingo Culto 10h.mp4", "Ação de Graças.jpeg")
    // Remove apenas caracteres ilegais em caminhos de arquivos Windows/Linux (< > : " / \ | ? *) e controles ASCII
    let rawFileName = fileNameParam || `media_${mediaId}`
    // Normaliza barras para prevenir path traversal
    rawFileName = path.basename(rawFileName.replace(/\\/g, '/'))
    let sanitizedFileName = rawFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
    if (!sanitizedFileName || sanitizedFileName === '.' || sanitizedFileName === '..') {
      sanitizedFileName = `media_${mediaId}`
    }

    // Extrai extensão
    const extMatch = sanitizedFileName.match(/\.([a-zA-Z0-9]+)$/)
    const ext = extMatch ? extMatch[1].toLowerCase() : ''

    // 2. Mapeamento de subpasta CONTROLADO ESTRITAMENTE PELO AGENT
    // NUNCA aceita caminhos absolutos do SaaS.
    // Pastas oficiais do Holyrics: media\image, media\video, media\audio, media\automaticPresentations
    const subfolderMap: Record<
      string,
      { folder: string; type: 'video' | 'image' | 'audio' | 'file'; allowedExts: string[] }
    > = {
      IMAGEM: {
        folder: 'image',
        type: 'image',
        allowedExts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
      },
      VIDEO: {
        folder: 'video',
        type: 'video',
        allowedExts: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'],
      },
      AUDIO: {
        folder: 'audio',
        type: 'audio',
        allowedExts: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'flac'],
      },
      DOCUMENTO: {
        folder: 'automaticPresentations',
        type: 'file',
        allowedExts: ['pdf', 'pptx', 'ppt', 'ppsx', 'pps'],
      },
    }

    const typeConfig = subfolderMap[mediaType] || {
      folder: 'video',
      type: 'video',
      allowedExts: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'jpg', 'jpeg', 'png', 'mp3', 'wav'],
    }

    // Valida extensão permitida para o tipo
    if (ext && !typeConfig.allowedExts.includes(ext)) {
      return {
        success: false,
        error: `Extensão .${ext} não permitida para o tipo de mídia ${mediaType}. Extensões aceitas: ${typeConfig.allowedExts.join(', ')}`,
        error_code: 'INVALID_FILE_EXTENSION',
      }
    }

    // 3. Valida diretório raiz da biblioteca local
    const baseLibrary = path.resolve(this.config.holyricsMediaPath)
    if (!fs.existsSync(baseLibrary)) {
      return {
        success: false,
        error: `O diretório da biblioteca do Holyrics não existe: "${baseLibrary}". Configure o caminho correto no painel local (http://localhost:${this.config.agentWebPort}).`,
        error_code: 'LIBRARY_PATH_NOT_FOUND',
      }
    }

    // Testa permissão de escrita
    try {
      fs.accessSync(baseLibrary, fs.constants.W_OK | fs.constants.R_OK)
    } catch (err: any) {
      return {
        success: false,
        error: `Sem permissão de gravação no diretório da biblioteca: "${baseLibrary}". Detalhes: ${err.message}`,
        error_code: 'LIBRARY_PATH_NO_PERMISSION',
      }
    }

    // Subpasta de destino
    const targetDir = path.join(baseLibrary, typeConfig.folder)
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Não foi possível criar a subpasta "${typeConfig.folder}" na biblioteca: ${err.message}`,
        error_code: 'CANNOT_CREATE_SUBFOLDER',
      }
    }

    // 4. Cria diretório temporário para download seguro
    const tempDir = path.join(process.cwd(), 'agent_temp')
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
    } catch (_) {}

    const tempFileName = `.tmp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
    const tempFilePath = path.join(tempDir, tempFileName)

    // 5. Download via endpoint dedicado do backend
    // Header x-agent-token obrigatório
    const saasUrl = this.config.saasUrl.replace(/\/+$/, '')
    const downloadUrl = `${saasUrl}${downloadEndpoint.startsWith('/') ? '' : '/'}${downloadEndpoint}`

    console.log(
      `[Agent Media] Iniciando download da mídia "${sanitizedFileName}" (ID: ${mediaId}) via endpoint seguro...`,
    )

    const controller = new AbortController()
    const timeoutMs = this.config.downloadTimeoutMs || 300000 // 5 minutos
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs)

    let bytesReceived = 0
    let tempFileCreated = false

    try {
      const res = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'x-agent-token': this.config.agentToken,
          Accept: '*/*',
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutTimer)

      if (!res.ok) {
        let errBody = ''
        try {
          errBody = await res.text()
        } catch (_) {}
        return {
          success: false,
          error: `Falha ao baixar mídia do LouvorFlow (HTTP ${res.status}): ${errBody.slice(0, 300)}`,
          error_code: `DOWNLOAD_HTTP_${res.status}`,
        }
      }

      // Valida Content-Length se informado
      const contentLengthHeader = res.headers.get('content-length')
      const declaredLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0
      const maxSize = this.config.maxDownloadSizeBytes || 150 * 1024 * 1024
      if (declaredLength > maxSize) {
        return {
          success: false,
          error: `Tamanho do arquivo (${(declaredLength / (1024 * 1024)).toFixed(1)}MB) excede o limite configurado de ${(maxSize / (1024 * 1024)).toFixed(0)}MB.`,
          error_code: 'FILE_TOO_LARGE',
        }
      }

      // Gravação com streaming no arquivo temporário
      const writeStream = fs.createWriteStream(tempFilePath)
      tempFileCreated = true

      if (!res.body) {
        writeStream.close()
        throw new Error('Corpo da resposta HTTP de download vazio.')
      }

      // Converte Web ReadableStream para Node.js Readable
      const nodeReadable = Readable.fromWeb(res.body as any)

      nodeReadable.on('data', (chunk) => {
        bytesReceived += chunk.length
        if (bytesReceived > maxSize) {
          controller.abort()
          throw new Error(
            `Arquivo excedeu o limite máximo durante o download (${(maxSize / (1024 * 1024)).toFixed(0)}MB).`,
          )
        }
      })

      await pipeline(nodeReadable, writeStream)

      // Validação pós-download: tamanho
      const stat = fs.statSync(tempFilePath)
      if (stat.size === 0) {
        throw new Error('Arquivo baixado tem tamanho 0 bytes (vazio).')
      }

      // Validação de conteúdo real (magic bytes para tipos comuns)
      const isContentValid = this.validateFileContent(tempFilePath, ext, mediaType)
      if (!isContentValid.valid) {
        throw new Error(
          isContentValid.error || 'Conteúdo do arquivo não corresponde ao formato esperado.',
        )
      }

      // 6. Política Anti-Duplicação e Anti-Sobrescrita
      // Calcula hash do arquivo baixado para conferência
      const downloadedHash = this.computeFileSha256(tempFilePath)
      let finalTargetFilePath = path.join(targetDir, sanitizedFileName)
      let alreadyExistedWithSameContent = false

      if (fs.existsSync(finalTargetFilePath)) {
        const existingStat = fs.statSync(finalTargetFilePath)
        const existingHash = this.computeFileSha256(finalTargetFilePath)

        if (existingStat.size === stat.size && existingHash === downloadedHash) {
          // Arquivo já existe identicamente no destino! Não sobrescreve, apenas aproveita.
          alreadyExistedWithSameContent = true
          console.log(
            `[Agent Media] Arquivo "${sanitizedFileName}" já existe no destino com mesmo tamanho e hash. Transferência considerada concluída.`,
          )
        } else {
          // Arquivo já existe mas tem conteúdo ou tamanho diferente!
          // Política explícita anti-sobrescrita: salva com sufixo (1), (2), etc.
          finalTargetFilePath = this.generateUniqueFilePath(targetDir, sanitizedFileName)
          console.log(
            `[Agent Media] Arquivo com mesmo nome já existia no destino com conteúdo diferente. Salvo com nome seguro: "${path.basename(finalTargetFilePath)}"`,
          )
        }
      }

      // Move de forma atômica se não era cópia idêntica
      if (!alreadyExistedWithSameContent) {
        try {
          fs.renameSync(tempFilePath, finalTargetFilePath)
          tempFileCreated = false
        } catch (renameErr) {
          // Fallback para cross-device rename: copia e remove
          fs.copyFileSync(tempFilePath, finalTargetFilePath)
          fs.unlinkSync(tempFilePath)
          tempFileCreated = false
        }
      } else {
        // Remove temporário pois o arquivo final já existia
        try {
          fs.unlinkSync(tempFilePath)
          tempFileCreated = false
        } catch (_) {}
      }

      const finalStat = fs.statSync(finalTargetFilePath)
      const finalFileName = path.basename(finalTargetFilePath)

      // 7. Confirmação no Holyrics via API local GetFile
      let holyricsDetected = false
      let holyricsFileInfo: any = null
      try {
        const checkRes = await this.holyrics.getFile(typeConfig.type, finalFileName)
        if (checkRes.detected) {
          holyricsDetected = true
          holyricsFileInfo = checkRes.fileInfo
        }
      } catch (_) {
        // Se API do Holyrics não responder ou der timeout, apenas mantém detected=false
      }

      console.log(
        `[Agent Media] Transferência concluída com sucesso: "${finalFileName}" em ${finalTargetFilePath} (${finalStat.size} bytes). Holyrics detected: ${holyricsDetected}`,
      )

      return {
        success: true,
        result: {
          media_id: mediaId,
          file_name: finalFileName,
          target_path: finalTargetFilePath,
          bytes_written: finalStat.size,
          category: payload.category || '',
          media_type: mediaType,
          target_subfolder: typeConfig.folder,
          holyrics_detected: holyricsDetected,
          holyrics_file_info: holyricsFileInfo,
          already_existed: alreadyExistedWithSameContent,
        },
      }
    } catch (err: any) {
      clearTimeout(timeoutTimer)
      // Limpeza de arquivo temporário após falha para não deixar lixo em disco
      if (tempFileCreated && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath)
        } catch (_) {}
      }

      const errMsg =
        err.name === 'AbortError'
          ? 'Tempo limite de download excedido (timeout).'
          : err.message || 'Erro inesperado no download.'
      console.error(`[Agent Media] Falha na transferência da mídia ${mediaId}:`, errMsg)

      return {
        success: false,
        error: errMsg,
        error_code: err.name === 'AbortError' ? 'DOWNLOAD_TIMEOUT' : 'TRANSFER_FAILED',
      }
    }
  }

  /**
   * Calcula SHA-256 de um arquivo local
   */
  private computeFileSha256(filePath: string): string {
    const hash = crypto.createHash('sha256')
    const buffer = fs.readFileSync(filePath)
    hash.update(buffer)
    return hash.digest('hex')
  }

  /**
   * Gera nome de arquivo único para prevenir sobrescrita de arquivos com mesmo nome e conteúdo diferente
   * Exemplo: "video.mp4" -> "video (1).mp4" -> "video (2).mp4"
   */
  private generateUniqueFilePath(dir: string, originalName: string): string {
    const ext = path.extname(originalName)
    const base = path.basename(originalName, ext)
    let counter = 1
    let candidate = path.join(dir, `${base} (${counter})${ext}`)
    while (fs.existsSync(candidate)) {
      counter++
      candidate = path.join(dir, `${base} (${counter})${ext}`)
    }
    return candidate
  }

  /**
   * Valida magic bytes de formatos de arquivos comuns para evitar arquivos executáveis ou corrompidos disfarçados
   */
  private validateFileContent(
    filePath: string,
    ext: string,
    mediaType: string,
  ): { valid: boolean; error?: string } {
    try {
      const fd = fs.openSync(filePath, 'r')
      const buffer = Buffer.alloc(16)
      fs.readSync(fd, buffer, 0, 16, 0)
      fs.closeSync(fd)

      // Rejeita executáveis do Windows (MZ header)
      if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
        return {
          valid: false,
          error: 'Arquivo executável (.exe/.dll) detectado. Rejeitado por segurança.',
        }
      }

      // Rejeita scripts ELF ou shell Linux
      if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
        return { valid: false, error: 'Binário executável ELF detectado. Rejeitado por segurança.' }
      }

      // Validação por extensão quando conhecida
      if (ext === 'jpg' || ext === 'jpeg') {
        if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
          return { valid: false, error: 'Arquivo JPG não possui cabeçalho JPEG válido.' }
        }
      } else if (ext === 'png') {
        if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
          return { valid: false, error: 'Arquivo PNG não possui cabeçalho válido.' }
        }
      } else if (ext === 'gif') {
        const magic = buffer.toString('utf-8', 0, 3)
        if (magic !== 'GIF') {
          return { valid: false, error: 'Arquivo GIF não possui assinatura válida.' }
        }
      } else if (ext === 'pdf') {
        const magic = buffer.toString('utf-8', 0, 4)
        if (magic !== '%PDF') {
          return { valid: false, error: 'Documento PDF não possui assinatura válida (%PDF).' }
        }
      }

      return { valid: true }
    } catch (err: any) {
      return { valid: false, error: 'Erro ao validar cabeçalho do arquivo: ' + err.message }
    }
  }
}
