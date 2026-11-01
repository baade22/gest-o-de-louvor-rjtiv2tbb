import os from 'os'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { AgentConfig, AgentCommand, AgentStatusInfo } from './types.js'
import { HolyricsClient } from './holyricsClient.js'
import { saveConfig } from './config.js'
import {
  findEventSchedule,
  findItemIdsToRemove,
  getMediaPlaylist,
  planSongReorder,
} from './eventPlaylist.js'

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
          version: '0.0.41',
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
          version: '0.0.41',
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
          // Extrai ID da música (pode vir no item unificado ou direto)
          let holyricsSongId = String(cmd.payload?.holyrics_song_id || cmd.payload?.id || '').trim()
          if (
            !holyricsSongId &&
            Array.isArray(cmd.payload?.items) &&
            cmd.payload.items.length > 0
          ) {
            const firstItem = cmd.payload.items[0]
            holyricsSongId = String(firstItem?.id || firstItem?.holyrics_song_id || '').trim()
          }

          if (!holyricsSongId) {
            status = 'FAILED'
            errorMsg = 'holyrics_song_id não informado no payload.'
            errorCode = 'MISSING_SONG_ID'
            break
          }

          // Etapa 3B: event_id da ocorrência no Holyrics é OBRIGATÓRIO
          const eventId = String(cmd.payload?.event_id || '').trim()
          if (!eventId) {
            status = 'FAILED'
            errorMsg = 'event_id da ocorrência do culto no Holyrics é obrigatório.'
            errorCode = 'MISSING_EVENT_ID'
            resultPayload = { error_code: errorCode }
            break
          }

          const playlistIndex =
            cmd.payload?.index !== undefined && cmd.payload?.index !== null
              ? Number(cmd.payload.index)
              : -1
          const ignoreDuplicates = cmd.payload?.ignore_duplicates ?? true
          const mediaPlaylist = cmd.payload?.media_playlist ?? false

          const addRes = await this.holyrics.addToPlaylist(holyricsSongId, {
            eventId,
            index: playlistIndex,
            ignoreDuplicates,
            media_playlist: mediaPlaylist,
          })

          if (addRes.success) {
            status = 'DONE'
            resultPayload = {
              added: true,
              holyrics_song_id: holyricsSongId,
              event_id: eventId,
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

        case 'GET_SCHEDULES': {
          // Payload mínimo esperado pelo Holyrics: { month, year } (1-12, ano de 4 dígitos)
          const monthNum = Number(cmd.payload?.month)
          const yearNum = Number(cmd.payload?.year)
          if (
            !Number.isFinite(monthNum) ||
            !Number.isFinite(yearNum) ||
            monthNum < 1 ||
            monthNum > 12 ||
            yearNum < 1900 ||
            yearNum > 2999
          ) {
            status = 'FAILED'
            errorMsg = 'Parâmetros month (1-12) e year são obrigatórios para GetSchedules.'
            errorCode = 'MISSING_SCHEDULE_PARAMS'
            resultPayload = { error_code: errorCode }
            break
          }

          const schedulesRes = await this.holyrics.getSchedules(monthNum, yearNum)

          console.log(
            `[Agent] [${new Date().toISOString()}] GET_SCHEDULES executado: duração=${schedulesRes.durationMs}ms, HTTP=${schedulesRes.httpStatus}, agendamentos=${schedulesRes.schedules.length}`,
          )

          if (schedulesRes.success) {
            status = 'DONE'
            resultPayload = {
              schedules: schedulesRes.schedules,
              count: schedulesRes.schedules.length,
              month: monthNum,
              year: yearNum,
            }
          } else {
            status = 'FAILED'
            errorMsg = schedulesRes.error || 'Erro ao consultar GetSchedules no Holyrics.'
            errorCode = schedulesRes.error_code || 'GET_SCHEDULES_FAILED'
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

        case 'REMOVE_FROM_EVENT_PLAYLIST': {
          const removeRes = await this.handleRemoveFromEventPlaylist(cmd)
          if (removeRes.success) {
            status = 'DONE'
            resultPayload = removeRes.result
          } else {
            status = 'FAILED'
            errorMsg = removeRes.error || 'Erro ao remover itens da playlist do culto.'
            errorCode = removeRes.error_code || 'REMOVE_FROM_PLAYLIST_FAILED'
            resultPayload = { error_code: errorCode, ...removeRes.result }
          }
          break
        }

        case 'REORDER_EVENT_SONGS': {
          const reorderRes = await this.handleReorderEventSongs(cmd)
          if (reorderRes.success) {
            status = 'DONE'
            resultPayload = reorderRes.result
          } else {
            status = 'FAILED'
            errorMsg = reorderRes.error || 'Erro ao ordenar as músicas na playlist do culto.'
            errorCode = reorderRes.error_code || 'REORDER_FAILED'
            resultPayload = { error_code: errorCode, ...reorderRes.result }
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

    await this.reportCommandResult(cmd, status, resultPayload, errorMsg, duration)

    return {
      status,
      result: resultPayload,
      error: errorMsg,
      error_code: errorCode,
      duration_ms: duration,
    }
  }

  /**
   * Reporta resultado ao LouvorFlow com 1 retry simples (1s) em caso de falha de rede
   */
  private async reportCommandResult(
    cmd: AgentCommand,
    status: 'DONE' | 'FAILED',
    resultPayload: any,
    errorMsg: string,
    duration: number,
  ) {
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
   * Lê a media_playlist da ocorrência do culto via GetSchedules({ month, year }).
   */
  private async readEventMediaPlaylist(payload: Record<string, any>): Promise<{
    success: boolean
    playlist: import('./eventPlaylist.js').PlaylistItem[]
    error?: string
    error_code?: string
  }> {
    const eventId = String(payload.event_id || '').trim()
    const month = Number(payload.month)
    const year = Number(payload.year)
    if (!eventId) {
      return {
        success: false,
        playlist: [],
        error: 'event_id da ocorrência do culto no Holyrics ausente.',
        error_code: 'MISSING_EVENT_ID',
      }
    }
    if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year)) {
      return {
        success: false,
        playlist: [],
        error: 'month e year do culto são obrigatórios.',
        error_code: 'MISSING_SCHEDULE_PARAMS',
      }
    }
    const schedulesRes = await this.holyrics.getSchedules(month, year)
    if (!schedulesRes.success) {
      return {
        success: false,
        playlist: [],
        error: schedulesRes.error || 'Erro ao consultar GetSchedules no Holyrics.',
        error_code: schedulesRes.error_code || 'GET_SCHEDULES_FAILED',
      }
    }
    const schedule = findEventSchedule(schedulesRes.schedules, eventId)
    if (!schedule) {
      return {
        success: false,
        playlist: [],
        error: `Culto #${eventId} não encontrado na programação de ${month}/${year} do Holyrics.`,
        error_code: 'EVENT_NOT_FOUND_IN_SCHEDULES',
      }
    }
    return { success: true, playlist: getMediaPlaylist(schedule) }
  }

  /**
   * REMOVE_FROM_EVENT_PLAYLIST: tira da playlist do culto as músicas (song_ids) e as
   * mídias (media: [{ media_type, file_name }]) que saíram do LouvorFlow. Com
   * delete_files: true, apaga também os arquivos que o Agent gravou na biblioteca.
   */
  public async handleRemoveFromEventPlaylist(cmd: AgentCommand): Promise<{
    success: boolean
    result?: Record<string, any>
    error?: string
    error_code?: string
  }> {
    const payload = cmd.payload || {}
    const songIds: string[] = Array.isArray(payload.song_ids)
      ? payload.song_ids.map((s: any) => String(s || '').trim()).filter(Boolean)
      : []
    const media: Array<{ media_type?: string; file_name?: string }> = Array.isArray(payload.media)
      ? payload.media
      : []
    const mediaNames = media.map((m) => String(m?.file_name || '').trim()).filter(Boolean)

    let removedIds: string[] = []
    let playlistError = ''
    let playlistErrorCode = ''

    if (songIds.length > 0 || mediaNames.length > 0) {
      const read = await this.readEventMediaPlaylist(payload)
      if (!read.success) {
        playlistError = read.error || ''
        playlistErrorCode = read.error_code || ''
      } else {
        removedIds = findItemIdsToRemove(read.playlist, songIds, mediaNames)
        const removeRes = await this.holyrics.removeFromMediaPlaylist(
          removedIds,
          String(payload.event_id),
        )
        if (!removeRes.success) {
          playlistError = removeRes.error || ''
          playlistErrorCode = removeRes.error_code || 'REMOVE_FROM_PLAYLIST_FAILED'
          removedIds = []
        }
      }
    }

    const deletedFiles: string[] = []
    if (payload.delete_files === true) {
      for (const m of media) {
        const filePath = this.resolveLibraryFile(m?.media_type, m?.file_name)
        if (filePath && fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath)
            deletedFiles.push(path.basename(filePath))
          } catch (err: any) {
            console.error(`[Agent Media] Não foi possível apagar "${filePath}": ${err.message}`)
          }
        }
      }
    }

    const result = {
      removed_items: removedIds.length,
      deleted_files: deletedFiles,
    }
    if (playlistError) {
      return { success: false, result, error: playlistError, error_code: playlistErrorCode }
    }
    return { success: true, result }
  }

  /**
   * Caminho de um arquivo dentro da biblioteca de mídias do Holyrics, na subpasta do tipo.
   * Nunca sai da biblioteca: usa só o nome do arquivo (sem pastas).
   */
  private resolveLibraryFile(mediaType?: string, fileName?: string): string {
    const folders: Record<string, string> = {
      IMAGEM: 'image',
      VIDEO: 'video',
      AUDIO: 'audio',
      DOCUMENTO: 'automaticPresentations',
    }
    const folder = folders[String(mediaType || '').toUpperCase()]
    const baseName = path.basename(String(fileName || '').replace(/\\/g, '/'))
    if (!folder || !baseName || baseName === '.' || baseName === '..') return ''
    return path.join(path.resolve(this.config.holyricsMediaPath), folder, baseName)
  }

  /**
   * REORDER_EVENT_SONGS: deixa as músicas do culto na ordem do repertório
   * (song_ids em ordem). Como a API não move itens, remove as músicas fora de ordem e
   * as reinsere nas mesmas posições, na ordem certa. Mídias não se movem.
   */
  public async handleReorderEventSongs(cmd: AgentCommand): Promise<{
    success: boolean
    result?: Record<string, any>
    error?: string
    error_code?: string
  }> {
    const payload = cmd.payload || {}
    const eventId = String(payload.event_id || '').trim()
    const songIds: string[] = Array.isArray(payload.song_ids)
      ? payload.song_ids.map((s: any) => String(s || '').trim()).filter(Boolean)
      : []

    const read = await this.readEventMediaPlaylist(payload)
    if (!read.success) {
      return { success: false, error: read.error, error_code: read.error_code }
    }

    const plan = planSongReorder(read.playlist, songIds)
    if (!plan) return { success: true, result: { reordered: false } }

    const removeRes = await this.holyrics.removeFromMediaPlaylist(plan.removeIds, eventId)
    if (!removeRes.success) {
      return { success: false, error: removeRes.error, error_code: removeRes.error_code }
    }
    for (const insert of plan.inserts) {
      const addRes = await this.holyrics.addToPlaylist(insert.songId, {
        eventId,
        index: insert.index,
        ignoreDuplicates: true,
      })
      if (!addRes.success) {
        return {
          success: false,
          result: { reordered: false, failed_song_id: insert.songId },
          error: addRes.error || 'Falha ao reinserir música na playlist.',
          error_code: addRes.error_code || 'ADD_PLAYLIST_FAILED',
        }
      }
    }
    return { success: true, result: { reordered: true, moved: plan.inserts.length } }
  }

  /** Executa a leitura da playlist do culto sem deixar exceção escapar. */
  private async readEventMediaNamesSafe(
    reader: () => Promise<{ found: boolean; names: Set<string>; error?: string; snapshot?: any }>,
  ): Promise<{ found: boolean; names: Set<string>; error?: string; snapshot?: any }> {
    try {
      return await reader()
    } catch (err: any) {
      return { found: false, names: new Set(), error: err?.message || String(err) }
    }
  }

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
    const eventId = String(payload.event_id || '').trim()
    const itemsRaw = Array.isArray(payload.items) ? payload.items : []

    // Validação estrita de event_id da ocorrência vinculada (Regra Etapa 3B)
    if (!eventId) {
      const errMissingEvent =
        'event_id da ocorrência do culto no Holyrics ausente no payload do comando SYNC_MEDIA_PLAYLIST.'
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'sync_media_error',
          command_id: cmd.command_id,
          stage: 'VALIDATE_EVENT_ID',
          holyrics_event_id: null,
          api_method: null,
          http_status: null,
          error_message: errMissingEvent,
          error_code: 'MISSING_EVENT_ID',
        }),
      )
      return {
        success: false,
        error: errMissingEvent,
        error_code: 'MISSING_EVENT_ID',
        result: { synced_count: 0, failed_count: itemsRaw.length, items: [] },
      }
    }

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

    // Deriva mês e ano para consultar GetSchedules da ocorrência vinculada
    let eventDateMonth = new Date().getMonth() + 1
    let eventDateYear = new Date().getFullYear()
    if (payload.event_date && typeof payload.event_date === 'string') {
      const dMatch = payload.event_date.match(/^(\d{4})-(\d{2})/)
      if (dMatch) {
        eventDateYear = parseInt(dMatch[1], 10)
        eventDateMonth = parseInt(dMatch[2], 10)
      }
    }

    // Playlist do culto: GetSchedules({ month, year }) → ocorrência por metadata.event.id →
    // itens em media_playlist (mídias aparecem com type video/image/audio/file e name).
    // Antes procurava em playlist.items e casava pelo id da lista, que nunca batia.
    const MEDIA_ITEM_TYPES = new Set(['video', 'image', 'audio', 'file', 'automatic_presentation'])
    const readEventMediaNames = async (): Promise<{
      found: boolean
      names: Set<string>
      error?: string
      snapshot?: any
    }> => {
      const names = new Set<string>()
      try {
        const schedRes = await this.holyrics.getSchedules(eventDateMonth, eventDateYear)
        if (!schedRes.success || !Array.isArray(schedRes.schedules)) {
          return { found: false, names, error: schedRes.error || 'GetSchedules falhou' }
        }
        const schedule = findEventSchedule(schedRes.schedules, eventId)
        if (!schedule) return { found: false, names }
        // media_playlist é o formato real; os demais só por compatibilidade com versões antigas.
        const mediaItems: any[] = Array.isArray(schedule.media_playlist)
          ? getMediaPlaylist(schedule)
          : [schedule.playlist?.items, schedule.playlist, schedule.items].find((x) =>
              Array.isArray(x),
            ) || []
        for (const it of mediaItems) {
          // Só mídias contam (músicas, títulos e versículos ficam de fora)
          const itType = String(it?.type || '').toLowerCase()
          if (itType && !MEDIA_ITEM_TYPES.has(itType)) continue
          const n = String(it?.name || it?.title || it?.file_name || '')
            .trim()
            .toLowerCase()
          if (n) {
            names.add(n)
            // Itens em subpasta podem vir como "pasta/arquivo.mp4"
            const base = n.split(/[\\/]/).pop()
            if (base) names.add(base)
          }
        }
        // Retrato do que foi lido, para diagnóstico no registro do comando
        const snapshot = {
          name: schedule.name || schedule.metadata?.event?.name || '',
          datetime: schedule.datetime || schedule.metadata?.event?.datetime || '',
          type: schedule.type || '',
          source: Array.isArray(schedule.media_playlist) ? 'media_playlist' : 'outro',
          items: mediaItems.slice(0, 40).map((it: any) => ({
            type: String(it?.type || ''),
            name: String(it?.name || it?.title || '').slice(0, 120),
          })),
        }
        return { found: true, names, snapshot }
      } catch (err: any) {
        return { found: false, names, error: err?.message || 'Erro em GetSchedules' }
      }
    }

    // Se a leitura falhar, segue: a conferência depois da inclusão explica o problema.
    const before = await this.readEventMediaNamesSafe(readEventMediaNames)
    const existingItemNames = before.names

    const itemsToAdd: Array<{ type: 'video' | 'image' | 'audio' | 'file'; name: string }> = []
    const detailedResults: Array<{
      id?: string
      name: string
      status: 'ADDED' | 'ALREADY_PRESENT' | 'FAILED' | 'PENDING_LOCAL_FILE' | 'MEDIA_NOT_RECOGNIZED'
      error?: string
      error_code?: string
      stage?: string
      media_type?: string
      http_status?: number
    }> = []

    for (const item of sortedItems) {
      // Usa o nome físico exato com extensão (holyrics_filename) desduplicando extensões repetidas
      const rawFileName = String(item.holyrics_filename || item.name || '').trim()
      const fileName = this.cleanRepeatedExtension(rawFileName)
      const mediaType = String(item.media_type || '').toUpperCase()

      if (!fileName) {
        const errorMsg = 'Nome físico do arquivo de mídia ausente no payload.'
        const errorCode = 'MISSING_MEDIA_FILENAME'
        console.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'sync_media_error',
            command_id: cmd.command_id,
            stage: 'VALIDATE_FILENAME',
            holyrics_event_id: eventId,
            media_type: mediaType || 'UNKNOWN',
            file_name: 'UNKNOWN',
            api_method: null,
            http_status: null,
            error_message: errorMsg,
            error_code: errorCode,
          }),
        )
        detailedResults.push({
          id: item.id,
          name: 'Desconhecido',
          status: 'FAILED',
          error: `${errorMsg} Ação recomendada: recadastre a mídia com nome válido.`,
          error_code: errorCode,
          stage: 'VALIDATE_FILENAME',
          media_type: mediaType,
        })
        continue
      }

      // Passo 1 & 2: Validação local prévia: confirmação em disco no caminho esperado e nome físico
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
        const errorMsg = `Arquivo físico "${fileName}" não encontrado na biblioteca local (${subfolder}).`
        const errorCode = 'PENDING_LOCAL_FILE'
        console.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'sync_media_error',
            command_id: cmd.command_id,
            stage: 'CHECK_LOCAL_DISK',
            holyrics_event_id: eventId,
            media_type: holyricsType,
            file_name: fileName,
            api_method: null,
            http_status: null,
            error_message: errorMsg,
            error_code: errorCode,
          }),
        )
        detailedResults.push({
          id: item.id,
          name: fileName,
          status: 'PENDING_LOCAL_FILE',
          error: `${errorMsg} Ação recomendada: execute a transferência do arquivo para o computador antes de sincronizar com a playlist.`,
          error_code: errorCode,
          stage: 'CHECK_LOCAL_DISK',
          media_type: holyricsType,
        })
        continue
      }

      // Passo 3: Consultar Holyrics pelos métodos disponíveis (GetFile mínimo + tipado, GetFiles)
      // com retries espaçados e limitados para permitir indexação assíncrona da biblioteca.
      let mediaRecognized = false
      let recognitionMethodUsed = 'none'
      let lastRecognitionError = ''
      let lastRecognitionHttpStatus: number | undefined = undefined
      const maxRetries = 3
      const retryDelayMs = 500

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const checkRes = await this.holyrics.verifyMediaRecognition(holyricsType, fileName)
          lastRecognitionHttpStatus = checkRes.httpStatus
          if (checkRes.recognized) {
            mediaRecognized = true
            recognitionMethodUsed = checkRes.methodUsed
            break
          }
          lastRecognitionError =
            checkRes.error || 'Arquivo não indexado ou não reconhecido pelo Holyrics.'
        } catch (err: any) {
          lastRecognitionError = err.message || 'Falha ao consultar reconhecimento no Holyrics.'
        }

        // Se ainda não reconhecido e restam tentativas, aguarda intervalo não-bloqueante
        if (!mediaRecognized && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        }
      }

      if (!mediaRecognized) {
        const errorCode = 'MEDIA_NOT_RECOGNIZED'
        console.warn(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'sync_media_error',
            command_id: cmd.command_id,
            stage: 'VERIFY_HOLYRICS_RECOGNITION',
            holyrics_event_id: eventId,
            media_type: holyricsType,
            file_name: fileName,
            api_method: HolyricsClient.mediaApiAction(holyricsType, false),
            http_status: lastRecognitionHttpStatus ?? null,
            error_message: lastRecognitionError,
            error_code: errorCode,
            attempts: maxRetries,
          }),
        )
        detailedResults.push({
          id: item.id,
          name: fileName,
          status: 'MEDIA_NOT_RECOGNIZED',
          error: `"${fileName}" está na pasta ${subfolder} do computador, mas o Holyrics não o encontrou na aba ${holyricsType === 'video' ? 'Vídeos' : holyricsType === 'image' ? 'Imagens' : holyricsType === 'audio' ? 'Áudios' : 'Arquivos'} (${lastRecognitionError}). Confira se a pasta de mídias configurada no Agent é a mesma pasta de mídias do Holyrics, ou abra a aba no Holyrics e tente de novo.`,
          error_code: errorCode,
          stage: 'VERIFY_HOLYRICS_RECOGNITION',
          media_type: holyricsType,
          http_status: lastRecognitionHttpStatus,
        })
        continue
      }

      // Não pula itens "já presentes": o AddToPlaylist usa ignore_duplicates=true, então o
      // próprio Holyrics não duplica. Pular aqui escondia a mídia quando a leitura enganava.
      // Passo 4: Monta o item oficial com name (nome físico) e type ('image' | 'video' | 'audio' | 'file')
      itemsToAdd.push({
        type: holyricsType,
        name: fileName,
      })
    }

    let addedCount = 0
    let failedCount = 0
    let afterSnapshot: any = null

    // Passo 5: Chamar AddToPlaylist com event_id obrigatório da ocorrência do culto
    if (itemsToAdd.length > 0) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'sync_media_execute',
          command_id: cmd.command_id,
          stage: 'ADD_TO_PLAYLIST',
          holyrics_event_id: eventId,
          items_count: itemsToAdd.length,
          api_method: 'AddToPlaylist',
        }),
      )

      const addRes = await this.holyrics.addMediaToPlaylist({
        items: itemsToAdd,
        eventId: eventId,
        index: -1,
        ignoreDuplicates: true,
      })

      if (addRes.success) {
        // Passo 6: Verificação rigorosa pós-inserção na playlist da ocorrência de destino.
        // O status "ok" da API HTTP NÃO é prova de inserção efetiva.
        // Consultamos a ocorrência via GetSchedules (payload mínimo {month, year})
        // com fallback para GetPlaylist({ type: 'all', event_id: eventId }).
        const after = await this.readEventMediaNamesSafe(readEventMediaNames)
        afterSnapshot = after.snapshot || null
        const verifiedNames = after.names
        const verificationMethodUsed: string = 'GetSchedules'
        const postPlaylistError = after.found
          ? ''
          : after.error
            ? `não consegui ler a programação do Holyrics (${after.error})`
            : `o culto #${eventId} não está na programação do Holyrics de ${String(eventDateMonth).padStart(2, '0')}/${eventDateYear}; ele pode ter sido apagado ou mudado de data no Holyrics, vincule o culto de novo`

        for (const added of itemsToAdd) {
          const isVerified = verifiedNames.has(added.name.toLowerCase())
          // Se a verificação confirmou o item na playlist da ocorrência
          if (isVerified && existingItemNames.has(added.name.toLowerCase())) {
            detailedResults.push({
              name: added.name,
              status: 'ALREADY_PRESENT',
              media_type: added.type,
            })
          } else if (isVerified) {
            detailedResults.push({
              name: added.name,
              status: 'ADDED',
              media_type: added.type,
            })
            addedCount++
          } else {
            // Se o item não pôde ser confirmado na playlist da ocorrência de destino,
            // marca como FAILED com erro técnico de inclusão/verificação.
            // O arquivo físico permanece intacto em disco para que a retentativa
            // ocorra sem precisar re-transferir o arquivo!
            const errorCode = 'PLAYLIST_VERIFICATION_FAILED'
            const errorMsg = postPlaylistError
              ? `Holyrics aceitou AddToPlaylist para a ocorrência #${eventId}, mas a verificação falhou: ${postPlaylistError}`
              : `Holyrics respondeu ok em AddToPlaylist, mas a mídia "${added.name}" não foi confirmada na playlist do culto #${eventId}. Confira se o Holyrics tem o Holyrics Plan (necessário para mexer na playlist de um culto pela API) e versão 2.26 ou mais nova.`

            console.error(
              JSON.stringify({
                timestamp: new Date().toISOString(),
                event: 'sync_media_error',
                command_id: cmd.command_id,
                stage: 'VERIFY_SCHEDULE_PLAYLIST',
                holyrics_event_id: eventId,
                media_type: added.type,
                file_name: added.name,
                api_method:
                  verificationMethodUsed !== 'none' ? verificationMethodUsed : 'GetSchedules',
                http_status: 200,
                error_message: errorMsg,
                error_code: errorCode,
              }),
            )

            detailedResults.push({
              name: added.name,
              status: 'FAILED',
              error: `${errorMsg} (O arquivo está salvo em disco; nova tentativa não re-transferirá).`,
              error_code: errorCode,
              stage: 'VERIFY_SCHEDULE_PLAYLIST',
              media_type: added.type,
            })
            failedCount++
          }
        }
      } else {
        // Falha no AddToPlaylist HTTP
        const errorCode = addRes.error_code || 'ADD_TO_PLAYLIST_API_ERROR'
        const errorMsg = addRes.error || 'Erro na API Holyrics AddToPlaylist'
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'sync_media_error',
            command_id: cmd.command_id,
            stage: 'ADD_TO_PLAYLIST',
            holyrics_event_id: eventId,
            media_type: 'multiple',
            file_name: itemsToAdd.map((it) => it.name).join(', '),
            api_method: 'AddToPlaylist',
            http_status: addRes.httpStatus ?? null,
            error_message: errorMsg,
            error_code: errorCode,
          }),
        )

        for (const added of itemsToAdd) {
          detailedResults.push({
            name: added.name,
            status: 'FAILED',
            error: `${errorMsg} (Arquivo preservado em disco para retentativa sem re-transferência).`,
            error_code: errorCode,
            stage: 'ADD_TO_PLAYLIST',
            media_type: added.type,
            http_status: addRes.httpStatus,
          })
          failedCount++
        }
      }
    }

    const alreadyPresentCount = detailedResults.filter((r) => r.status === 'ALREADY_PRESENT').length
    const pendingLocalCount = detailedResults.filter(
      (r) => r.status === 'PENDING_LOCAL_FILE',
    ).length
    const notRecognizedCount = detailedResults.filter(
      (r) => r.status === 'MEDIA_NOT_RECOGNIZED',
    ).length

    // Determina erro estável para o SaaS se todos falharam ou nenhum foi adicionado
    let summaryError: string | undefined = undefined
    let summaryErrorCode: string | undefined = undefined

    if (failedCount > 0 && addedCount === 0 && alreadyPresentCount === 0) {
      const firstFailure = detailedResults.find((r) => r.status === 'FAILED')
      summaryError = firstFailure?.error || 'Falha ao incluir mídias na playlist da ocorrência.'
      summaryErrorCode = firstFailure?.error_code || 'SYNC_MEDIA_PLAYLIST_FAILED'
    } else if (notRecognizedCount > 0 && addedCount === 0 && alreadyPresentCount === 0) {
      summaryError = 'Mídia física presente no disco, mas ainda não reconhecida pelo Holyrics.'
      summaryErrorCode = 'MEDIA_NOT_RECOGNIZED'
    } else if (pendingLocalCount > 0 && addedCount === 0 && alreadyPresentCount === 0) {
      summaryError = 'Arquivos de mídia ainda não foram encontrados no disco local.'
      summaryErrorCode = 'PENDING_LOCAL_FILE'
    }

    return {
      success:
        (failedCount === 0 && pendingLocalCount === 0 && notRecognizedCount === 0) ||
        addedCount > 0 ||
        alreadyPresentCount > 0,
      result: {
        event_id: eventId,
        synced_count: addedCount,
        already_present_count: alreadyPresentCount,
        pending_local_count: pendingLocalCount,
        not_recognized_count: notRecognizedCount,
        failed_count: failedCount,
        items: detailedResults,
        playlist_before: before.snapshot || null,
        playlist_after: afterSnapshot,
      },
      error: summaryError,
      error_code: summaryErrorCode,
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
    let sanitizedFileName = this.cleanRepeatedExtension(
      rawFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim(),
    )
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

      // 7. Confirmação no Holyrics via API local (GetFile e GetFiles com retries espaçados e limitados)
      let holyricsDetected = false
      let holyricsFileInfo: any = null
      const maxTransferRetries = 3
      const transferRetryDelayMs = 400

      for (let attempt = 1; attempt <= maxTransferRetries; attempt++) {
        try {
          const checkRes = await this.holyrics.verifyMediaRecognition(
            typeConfig.type,
            finalFileName,
          )
          if (checkRes.recognized) {
            holyricsDetected = true
            holyricsFileInfo = checkRes.fileInfo
            break
          }
        } catch (_) {
          // Se API do Holyrics não responder ou der timeout, tenta próxima tentativa
        }

        if (!holyricsDetected && attempt < maxTransferRetries) {
          await new Promise((resolve) => setTimeout(resolve, transferRetryDelayMs))
        }
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
   * Colapsa extensões repetidas sucessivas ancoradas ao final da string para apenas uma ocorrência.
   * Exemplo: "audio.mp3.mp3" -> "audio.mp3"
   */
  public cleanRepeatedExtension(fileName: string): string {
    if (!fileName) return ''
    const trimmed = String(fileName).trim()
    const match = trimmed.match(/\.([a-zA-Z0-9]+)$/)
    if (!match) return trimmed
    const ext = match[1]
    const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const repeatedRegex = new RegExp(`(?:\\.${escapedExt})+$`, 'i')
    const base = trimmed.replace(repeatedRegex, '')
    return `${base}.${ext}`
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
