import type { HolyricsApiResponse, HolyricsTokenInfo, HolyricsSongItem } from './types.js'

/**
 * Cliente HTTP para a Holyrics API Server Local (http://[IP]:[PORT]/api/{action}?token=...)
 * Usa apenas Node.js fetch nativo.
 * O token NUNCA sai da máquina local.
 */
export class HolyricsClient {
  private host: string
  private port: number
  private token: string

  constructor(host = '127.0.0.1', port = 8091, token = '') {
    this.host = host || '127.0.0.1'
    this.port = port || 8091
    this.token = token || ''
  }

  public updateConfig(host: string, port: number, token: string) {
    this.host = host || '127.0.0.1'
    this.port = port || 8091
    this.token = token || ''
  }

  public getBaseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Executa request POST no Holyrics Local
   */
  public async request<T = any>(
    action: string,
    data: Record<string, any> = {},
    timeoutMs = 3000,
  ): Promise<HolyricsApiResponse<T>> {
    const cleanAction = action.replace(/^\/+/, '')
    const url = new URL(`${this.getBaseUrl()}/api/${cleanAction}`)
    if (this.token) {
      url.searchParams.set('token', this.token)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const startReqTime = Date.now()

    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      })

      clearTimeout(timer)
      const durationMs = Date.now() - startReqTime
      const rawText = await res.text()

      let json: any = null
      try {
        json = JSON.parse(rawText)
      } catch (_) {
        return {
          status: 'error',
          error: `Resposta não é JSON válido (HTTP ${res.status})`,
          httpStatus: res.status,
          durationMs,
          rawText: rawText.slice(0, 2000),
        }
      }

      return {
        ...(json as HolyricsApiResponse<T>),
        httpStatus: res.status,
        durationMs,
        rawText: rawText.slice(0, 2000),
      }
    } catch (err: any) {
      clearTimeout(timer)
      const durationMs = Date.now() - startReqTime
      if (err.name === 'AbortError') {
        return {
          status: 'error',
          error: 'TIMEOUT_HOLYRICS',
          httpStatus: 0,
          durationMs,
          rawText: 'Request aborted due to timeout',
        }
      }
      return {
        status: 'error',
        error: err.code || err.message || 'CONNECTION_REFUSED',
        httpStatus: 0,
        durationMs,
        rawText: err.message || String(err),
      }
    }
  }

  /**
   * Testa a conexão e verifica o token via GetTokenInfo ou GetVersion
   */
  public async testConnection(): Promise<{
    connected: boolean
    tokenValid: boolean
    version?: string
    permissions?: string
    error?: string
    code?: string
  }> {
    // 1. Tenta GetTokenInfo
    const tokenRes = await this.request<HolyricsTokenInfo>('GetTokenInfo', {})
    if (tokenRes.status === 'ok' && tokenRes.data) {
      return {
        connected: true,
        tokenValid: true,
        version: tokenRes.data.version || '2.x',
        permissions: tokenRes.data.permissions || '',
      }
    }

    // Se erro de token
    const errText =
      typeof tokenRes.error === 'string' ? tokenRes.error : tokenRes.error?.message || ''
    if (errText.toLowerCase().includes('token') || errText.toLowerCase().includes('invalid')) {
      return {
        connected: true,
        tokenValid: false,
        error: 'Token do Holyrics inválido ou não autorizado.',
        code: 'INVALID_TOKEN',
      }
    }

    // Se Holyrics não estiver aberto ou conexão recusada
    if (
      errText.includes('ECONNREFUSED') ||
      errText.includes('CONNECTION_REFUSED') ||
      errText.includes('TIMEOUT_HOLYRICS')
    ) {
      return {
        connected: false,
        tokenValid: false,
        error: `Não foi possível conectar ao Holyrics em ${this.getBaseUrl()}. Certifique-se de que o Holyrics está aberto e o API Server está ativado nas Configurações.`,
        code: 'HOLYRICS_CLOSED',
      }
    }

    // 2. Fallback: GetVersion (ação sem token em algumas versões)
    const verRes = await this.request<{ version: string }>('GetVersion', {})
    if (verRes.status === 'ok') {
      return {
        connected: true,
        tokenValid: false,
        version: verRes.data?.version || '2.x',
        error: 'Holyrics conectado, mas o token fornecido não foi aceito.',
        code: 'INVALID_TOKEN',
      }
    }

    return {
      connected: false,
      tokenValid: false,
      error: errText || 'Holyrics não detectado.',
      code: 'HOLYRICS_NOT_DETECTED',
    }
  }

  /**
   * SearchSong: Busca músicas no acervo local do Holyrics
   * Timeout por chamada: 3000ms.
   * Fallback SearchLyrics só executado se o erro indicar ação desconhecida ou endpoint inexistente (NÃO em TIMEOUT_HOLYRICS).
   */
  public async searchSong(
    query: string,
    options: { title?: boolean; artist?: boolean; lyrics?: boolean } = {},
  ): Promise<{
    success: boolean
    matches: HolyricsSongItem[]
    error?: string
    durationMs?: number
    httpStatus?: number
    keys?: string[]
    rawResponse?: string
    endpointUsed?: string
  }> {
    const payload = {
      text: query,
      title: options.title ?? true,
      artist: options.artist ?? true,
      lyrics: options.lyrics ?? false,
      fields: 'id,title,artist,author,key,bpm,archived',
    }

    const res = await this.request<HolyricsSongItem[]>('SearchSong', payload, 3000)

    if (res.status === 'ok') {
      const list = Array.isArray(res.data) ? res.data : []
      const keys = res.data && typeof res.data === 'object' ? Object.keys(res.data) : []
      return {
        success: true,
        matches: list,
        durationMs: res.durationMs,
        httpStatus: res.httpStatus,
        keys,
        rawResponse: res.rawText,
        endpointUsed: 'SearchSong',
      }
    }

    const errStr = typeof res.error === 'string' ? res.error : res.error?.message || 'Erro na busca'

    // Fallback para SearchLyrics APENAS se erro for de ação desconhecida / endpoint inexistente / 404
    // NUNCA executar fallback se for TIMEOUT_HOLYRICS ou CONNECTION_REFUSED
    const isUnknownAction =
      errStr.toLowerCase().includes('action') ||
      errStr.toLowerCase().includes('not found') ||
      errStr.toLowerCase().includes('unknown') ||
      res.httpStatus === 404

    if (isUnknownAction && errStr !== 'TIMEOUT_HOLYRICS') {
      const fallbackRes = await this.request<HolyricsSongItem[]>('SearchLyrics', payload, 3000)
      if (fallbackRes.status === 'ok') {
        const list = Array.isArray(fallbackRes.data) ? fallbackRes.data : []
        const keys =
          fallbackRes.data && typeof fallbackRes.data === 'object'
            ? Object.keys(fallbackRes.data)
            : []
        return {
          success: true,
          matches: list,
          durationMs: (res.durationMs || 0) + (fallbackRes.durationMs || 0),
          httpStatus: fallbackRes.httpStatus,
          keys,
          rawResponse: fallbackRes.rawText,
          endpointUsed: 'SearchLyrics',
        }
      }

      const fallbackErr =
        typeof fallbackRes.error === 'string'
          ? fallbackRes.error
          : fallbackRes.error?.message || errStr
      return {
        success: false,
        matches: [],
        error: fallbackErr,
        durationMs: (res.durationMs || 0) + (fallbackRes.durationMs || 0),
        httpStatus: fallbackRes.httpStatus,
        rawResponse: fallbackRes.rawText,
        endpointUsed: 'SearchLyrics',
      }
    }

    return {
      success: false,
      matches: [],
      error: errStr,
      durationMs: res.durationMs,
      httpStatus: res.httpStatus,
      rawResponse: res.rawText,
      endpointUsed: 'SearchSong',
    }
  }

  /**
   * Executa diagnóstico SearchSong para a interface local
   */
  public async diagnoseSearchSong(
    query: string,
  ): Promise<import('./types.js').SearchSongDiagnosticResult> {
    const payload = {
      text: query,
      title: true,
      artist: true,
      lyrics: false,
      fields: 'id,title,artist,author,key,bpm,archived',
    }

    const res = await this.request<HolyricsSongItem[]>('SearchSong', payload, 3000)
    const list = Array.isArray(res.data) ? res.data : []
    const errStr = res.error
      ? typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Erro'
      : undefined

    return {
      endpoint: `${this.getBaseUrl()}/api/SearchSong`,
      method: 'POST',
      payloadSent: payload,
      httpStatus: res.httpStatus || 0,
      durationMs: res.durationMs || 0,
      count: list.length,
      rawResponse: (res.rawText || '').slice(0, 2000),
      status: res.status,
      error: errStr,
      matches: list,
    }
  }

  /**
   * AddLyricsToPlaylist: Adiciona uma letra identificada pelo ID à playlist do Holyrics
   * Formato oficial Holyrics API Server:
   * POST /api/AddLyricsToPlaylist?token=...
   * Body: { id: "123" } ou { item: { id: "123" } }
   */
  public async addToPlaylist(
    songId: string,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    // Tenta formato direto { id: "..." }
    const res = await this.request('AddLyricsToPlaylist', { id: songId })
    if (res.status === 'ok') {
      return { success: true, data: res.data }
    }

    // Fallback secundário documentado no Holyrics { item: { id: "..." } }
    const resFallback = await this.request('AddLyricsToPlaylist', { item: { id: songId } })
    if (resFallback.status === 'ok') {
      return { success: true, data: resFallback.data }
    }

    // Fallback AddToPlaylist
    const resGeneric = await this.request('AddToPlaylist', { type: 'song', id: songId })
    if (resGeneric.status === 'ok') {
      return { success: true, data: resGeneric.data }
    }

    const errStr =
      typeof res.error === 'string' ? res.error : res.error?.message || 'Falha ao adicionar'
    return {
      success: false,
      error: errStr,
    }
  }
}
