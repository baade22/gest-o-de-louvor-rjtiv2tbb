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
   * Formato oficial mínimo recomendado pela Holyrics API e jslib: { text: query }
   * Timeout por chamada: 3000ms.
   * Não envia title/artist/lyrics/fields por padrão para evitar que o Holyrics 2.24+ / 2.30+ filtre indevidamente ou descarte a busca.
   * Fallback SearchLyrics só é executado se o erro indicar ação desconhecida ou endpoint inexistente (NÃO em TIMEOUT_HOLYRICS ou CONNECTION_REFUSED).
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
    payloadSent?: Record<string, any>
  }> {
    // Chamada PRIMÁRIA: payload oficial mínimo { text: query }
    // Não enviamos fields, title, artist, lyrics por padrão
    const minimalPayload: Record<string, any> = { text: query }
    if (options.title !== undefined) minimalPayload.title = options.title
    if (options.artist !== undefined) minimalPayload.artist = options.artist
    if (options.lyrics !== undefined) minimalPayload.lyrics = options.lyrics

    const res = await this.request<HolyricsSongItem[]>('SearchSong', minimalPayload, 3000)

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
        payloadSent: minimalPayload,
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
      const fallbackPayload: Record<string, any> = { text: query }
      const fallbackRes = await this.request<HolyricsSongItem[]>(
        'SearchLyrics',
        fallbackPayload,
        3000,
      )
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
          payloadSent: fallbackPayload,
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
        payloadSent: fallbackPayload,
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
      payloadSent: minimalPayload,
    }
  }

  /**
   * Executa diagnóstico SearchSong para a interface local
   * Utiliza a chamada oficial mínima { text: query } e retorna detalhes técnicos completos:
   * endpoint, método, payload, status HTTP, rawText (até 2000 chars), parsedJson, contagem, primeiro item.
   * Se retornar 0 resultados com status ok, informa causa técnica precisa sem falso positivo.
   */
  public async diagnoseSearchSong(
    query: string,
  ): Promise<import('./types.js').SearchSongDiagnosticResult> {
    const checklist: import('./types.js').DiagnosticStep[] = []
    let technicalCause: string | undefined = undefined

    // Etapa 1: Agent em si (Local)
    checklist.push({
      name: 'agent',
      label: 'Agent',
      status: 'OK',
      durationMs: 0,
      detail: 'LouvorFlow Agent ativo em execução',
    })

    // Etapa 2 & 3: Holyrics API / GetVersion / Autenticação via testConnection
    const startConn = Date.now()
    const connTest = await this.testConnection()
    const connDuration = Date.now() - startConn

    if (connTest.connected) {
      checklist.push({
        name: 'holyrics_api',
        label: 'Holyrics API',
        status: 'OK',
        durationMs: connDuration,
        detail: `Conectado em ${this.getBaseUrl()}`,
      })

      checklist.push({
        name: 'get_version',
        label: 'GetVersion',
        status: 'OK',
        durationMs: connDuration,
        detail: connTest.version ? `Versão Holyrics: ${connTest.version}` : 'Versão 2.x detectada',
      })

      if (connTest.tokenValid) {
        checklist.push({
          name: 'authentication',
          label: 'Autenticação',
          status: 'OK',
          durationMs: connDuration,
          detail: 'Token aceito pelo Holyrics API Server',
        })
      } else {
        technicalCause = connTest.error || 'Token do Holyrics inválido ou permissão negada'
        checklist.push({
          name: 'authentication',
          label: 'Autenticação',
          status: 'ERROR',
          durationMs: connDuration,
          detail: connTest.error || 'Token inválido',
          technicalCause,
        })
      }
    } else {
      const isTimeout = (connTest.error || '').includes('TIMEOUT')
      const statusType = isTimeout ? 'TIMEOUT' : 'ERROR'
      technicalCause =
        connTest.error || 'Holyrics API Server não está acessível na porta configurada'

      checklist.push({
        name: 'holyrics_api',
        label: 'Holyrics API',
        status: statusType,
        durationMs: connDuration,
        detail: connTest.error || 'Porta inacessível',
        technicalCause,
      })
      checklist.push({
        name: 'get_version',
        label: 'GetVersion',
        status: 'SKIPPED',
        durationMs: 0,
        detail: 'Não executado devido à falha de conexão',
      })
      checklist.push({
        name: 'authentication',
        label: 'Autenticação',
        status: 'SKIPPED',
        durationMs: 0,
        detail: 'Não executado devido à falha de conexão',
      })
    }

    // Etapa 4: SearchSong (Busca real com chamada oficial mínima { text: query })
    const payload = {
      text: query,
    }

    const res = await this.request<HolyricsSongItem[]>('SearchSong', payload, 3000)
    const list = Array.isArray(res.data) ? res.data : []
    const firstMatch = list.length > 0 ? list[0] : undefined
    const firstMatchSummary = firstMatch
      ? {
          id: firstMatch.id,
          title: firstMatch.title,
          artist: firstMatch.artist,
          author: firstMatch.author,
        }
      : undefined

    const errStr = res.error
      ? typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Erro'
      : undefined

    const searchDuration = res.durationMs || 0
    let searchStepStatus: 'OK' | 'TIMEOUT' | 'ERROR' = 'OK'
    let searchStepCause: string | undefined = undefined

    if (res.status === 'ok') {
      searchStepStatus = 'OK'
      if (list.length === 0 && !technicalCause) {
        technicalCause =
          'Resposta válida (status ok) com 0 resultados para payload mínimo {text}. Se a busca nativa do Holyrics encontra a música, verificar se o item está arquivado ou em categoria não pesquisada.'
      }
    } else if (errStr === 'TIMEOUT_HOLYRICS') {
      searchStepStatus = 'TIMEOUT'
      searchStepCause = 'Tempo limite excedido na chamada SearchSong ao Holyrics (>= 3000ms).'
      if (!technicalCause) technicalCause = searchStepCause
    } else {
      searchStepStatus = 'ERROR'
      searchStepCause = errStr || `Erro HTTP ${res.httpStatus || 0}`
      if (!technicalCause) technicalCause = searchStepCause
    }

    checklist.push({
      name: 'search_song',
      label: 'SearchSong',
      status: searchStepStatus,
      durationMs: searchDuration,
      detail:
        searchStepStatus === 'OK'
          ? `${list.length} músicas encontradas`
          : searchStepCause || 'Erro na busca',
      technicalCause: searchStepCause,
    })

    let parsedJson: any = null
    try {
      if (res.rawText) {
        parsedJson = JSON.parse(res.rawText)
      }
    } catch (_) {
      parsedJson = null
    }

    return {
      endpoint: `${this.getBaseUrl()}/api/SearchSong`,
      method: 'POST',
      payloadSent: payload,
      httpStatus: res.httpStatus || 0,
      durationMs: searchDuration,
      count: list.length,
      rawResponse: (res.rawText || '').slice(0, 2000),
      status: res.status,
      error: errStr,
      matches: list,
      checklist,
      technicalCause,
      parsedJson,
      firstMatch: firstMatchSummary,
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
