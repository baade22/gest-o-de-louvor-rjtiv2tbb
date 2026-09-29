import os from 'node:os'
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
          version: '0.0.15',
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
          version: '0.0.15',
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
    console.log(`[Agent] Executando comando ${cmd.action} (id: ${cmd.command_id})...`)

    let status: 'DONE' | 'FAILED' = 'DONE'
    let resultPayload: any = {}
    let errorMsg = ''

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
            resultPayload = { error_code: testRes.code }
          }
          break
        }

        case 'SEARCH_SONG': {
          const query = String(cmd.payload?.query || '').trim()
          if (!query) {
            status = 'FAILED'
            errorMsg = 'Parâmetro query ausente.'
            break
          }
          const searchRes = await this.holyrics.searchSong(query, {
            title: true,
            artist: true,
            lyrics: false,
          })
          if (searchRes.success) {
            status = 'DONE'
            resultPayload = {
              matches: searchRes.matches,
              count: searchRes.matches.length,
            }
          } else {
            status = 'FAILED'
            errorMsg = searchRes.error || 'Erro ao buscar no Holyrics.'
          }
          break
        }

        case 'ADD_TO_PLAYLIST': {
          const holyricsSongId = String(cmd.payload?.holyrics_song_id || '').trim()
          if (!holyricsSongId) {
            status = 'FAILED'
            errorMsg = 'holyrics_song_id não informado no payload.'
            break
          }
          const addRes = await this.holyrics.addToPlaylist(holyricsSongId)
          if (addRes.success) {
            status = 'DONE'
            resultPayload = {
              added: true,
              holyrics_song_id: holyricsSongId,
              title: cmd.payload?.title,
            }
          } else {
            status = 'FAILED'
            errorMsg = addRes.error || 'Falha ao adicionar à playlist.'
          }
          break
        }

        default:
          status = 'FAILED'
          errorMsg = `Ação desconhecida: ${cmd.action}`
      }
    } catch (err: any) {
      status = 'FAILED'
      errorMsg = err.message || 'Erro inesperado na execução do comando.'
    }

    const duration = Date.now() - startTime
    console.log(
      `[Agent] Comando ${cmd.command_id} finalizado em ${duration}ms com status: ${status}`,
    )

    // Reporta resultado ao LouvorFlow
    const reportUrl = `${this.config.saasUrl.replace(/\/+$/, '')}/backend/v1/agent/commands/${cmd.command_id}/result`
    try {
      await fetch(reportUrl, {
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
    } catch (err: any) {
      console.error(`[Agent] Erro ao enviar resultado do comando ${cmd.command_id}:`, err.message)
    }
  }
}
