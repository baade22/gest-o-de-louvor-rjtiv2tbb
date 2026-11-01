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
      // O fetch do Node lança TypeError('fetch failed') com o código real em err.cause.code
      const errCode = err.cause?.code || err.code || ''
      const refused = /ECONNREFUSED|CONNECTION_REFUSED/.test(`${errCode} ${err.message || ''}`)
      return {
        status: 'error',
        error: refused ? 'CONNECTION_REFUSED' : errCode || err.message || 'CONNECTION_REFUSED',
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
   * CreateSong: Cria música no Holyrics Local via API oficial
   * Payload testado e validado no Holyrics 2.30.0:
   * { action: "CreateSong", title, artist, author, note, copyright, slides: [{text, slide_description}], formatting_type: "basic", order: "1,2,3", key, bpm, time_sig }
   * Retorna {"status": "ok", "data": {"id": "1790728009858", ...}}
   */
  public async createSong(songData: import('./types.js').HolyricsCreateSongPayload): Promise<{
    success: boolean
    id?: string
    data?: any
    error?: string
    error_code?: string
  }> {
    const payload: Record<string, any> = {
      title: songData.title,
      artist: songData.artist || '',
      author: songData.author || '',
      note: songData.note || '',
      copyright: songData.copyright || '',
      slides: Array.isArray(songData.slides) ? songData.slides : [],
      formatting_type: songData.formatting_type || 'basic',
      order: songData.order || '',
    }
    if (songData.key) payload.key = songData.key
    if (songData.bpm !== undefined && songData.bpm !== null) payload.bpm = Number(songData.bpm)
    if (songData.time_sig) payload.time_sig = songData.time_sig

    const res = await this.request('CreateSong', payload, 5000)

    if (res.status === 'ok') {
      const returnedId =
        res.data && typeof res.data === 'object'
          ? String(res.data.id || res.data.song_id || res.data.songId || '')
          : typeof res.data === 'string' || typeof res.data === 'number'
            ? String(res.data)
            : ''
      return {
        success: true,
        id: returnedId,
        data: res.data,
      }
    }

    const errStr =
      typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Erro ao criar música no Holyrics'

    const isAuth =
      res.httpStatus === 401 ||
      res.httpStatus === 403 ||
      errStr.toLowerCase().includes('token') ||
      errStr.toLowerCase().includes('permiss') ||
      errStr.toLowerCase().includes('unauthorized') ||
      errStr.toLowerCase().includes('forbidden')

    return {
      success: false,
      error: errStr,
      error_code:
        errStr === 'TIMEOUT_HOLYRICS'
          ? 'TIMEOUT_HOLYRICS'
          : errStr.includes('CONNECTION_REFUSED')
            ? 'CONNECTION_REFUSED'
            : isAuth
              ? 'AUTH_FORBIDDEN'
              : 'CREATE_SONG_FAILED',
    }
  }

  /**
   * GetSongs: Obtém a listagem do acervo de músicas do Holyrics
   * POST /api/GetSongs?token=...
   * Body: { fields: "id,title,artist,author,key,bpm,time_sig,groups,archived" }
   */
  public async getSongs(fields?: string): Promise<{
    success: boolean
    songs: HolyricsSongItem[]
    data?: any
    error?: string
    error_code?: string
    durationMs?: number
    httpStatus?: number
  }> {
    const payload: Record<string, any> = {}
    if (fields) {
      payload.fields = fields
    } else {
      payload.fields = 'id,title,artist,author,key,bpm,time_sig,groups,archived'
    }

    const res = await this.request<HolyricsSongItem[]>('GetSongs', payload, 5000)

    if (res.status === 'ok') {
      const list = Array.isArray(res.data)
        ? res.data
        : res.data && Array.isArray((res.data as any).songs)
          ? (res.data as any).songs
          : []
      return {
        success: true,
        songs: list,
        data: res.data,
        durationMs: res.durationMs,
        httpStatus: res.httpStatus,
      }
    }

    const errStr =
      typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Erro ao consultar GetSongs no Holyrics'

    const isAuthSongs =
      res.httpStatus === 401 ||
      res.httpStatus === 403 ||
      errStr.toLowerCase().includes('token') ||
      errStr.toLowerCase().includes('permiss') ||
      errStr.toLowerCase().includes('unauthorized') ||
      errStr.toLowerCase().includes('forbidden')

    return {
      success: false,
      songs: [],
      error: errStr,
      error_code:
        errStr === 'TIMEOUT_HOLYRICS'
          ? 'TIMEOUT_HOLYRICS'
          : errStr.includes('CONNECTION_REFUSED')
            ? 'CONNECTION_REFUSED'
            : isAuthSongs
              ? 'AUTH_FORBIDDEN'
              : 'GET_SONGS_FAILED',
      durationMs: res.durationMs,
      httpStatus: res.httpStatus,
    }
  }

  /**
   * GetSchedules: Obtém as agendas/eventos cadastrados no Holyrics
   * POST /api/GetSchedules?token=...
   * Payload ESTRITAMENTE mínimo: { month, year } — Holyrics 2.30.0 rejeita campos extras.
   * Extração tolerante da lista: res.data array | res.data.items | res.data.schedules.
   */
  public async getSchedules(
    month: number,
    year: number,
  ): Promise<{
    success: boolean
    schedules: import('./types.js').HolyricsScheduleItem[]
    data?: any
    error?: string
    error_code?: string
    durationMs?: number
    httpStatus?: number
    payloadSent?: Record<string, any>
  }> {
    // Payload mínimo estrito: nada além de month/year (regra do Holyrics 2.30.0)
    const payload: Record<string, any> = { month: Number(month), year: Number(year) }

    const res = await this.request<import('./types.js').HolyricsScheduleItem[]>(
      'GetSchedules',
      payload,
      5000,
    )

    if (res.status === 'ok') {
      let list: import('./types.js').HolyricsScheduleItem[] = []
      if (Array.isArray(res.data)) {
        list = res.data
      } else if (res.data && Array.isArray((res.data as any).items)) {
        list = (res.data as any).items
      } else if (res.data && Array.isArray((res.data as any).schedules)) {
        list = (res.data as any).schedules
      } else if (res.data && Array.isArray((res.data as any).data)) {
        list = (res.data as any).data
      }
      return {
        success: true,
        schedules: list,
        data: res.data,
        durationMs: res.durationMs,
        httpStatus: res.httpStatus,
        payloadSent: payload,
      }
    }

    const errStr =
      typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Erro ao consultar GetSchedules no Holyrics'

    const isAuthSchedules =
      res.httpStatus === 401 ||
      res.httpStatus === 403 ||
      errStr.toLowerCase().includes('token') ||
      errStr.toLowerCase().includes('permiss') ||
      errStr.toLowerCase().includes('unauthorized') ||
      errStr.toLowerCase().includes('forbidden')

    return {
      success: false,
      schedules: [],
      error: errStr,
      error_code:
        errStr === 'TIMEOUT_HOLYRICS'
          ? 'TIMEOUT_HOLYRICS'
          : errStr.includes('CONNECTION_REFUSED')
            ? 'CONNECTION_REFUSED'
            : isAuthSchedules
              ? 'AUTH_FORBIDDEN'
              : 'GET_SCHEDULES_FAILED',
      durationMs: res.durationMs,
      httpStatus: res.httpStatus,
      payloadSent: payload,
    }
  }

  /**
   * GetSongPlaylist: Obtém os itens da playlist de músicas do Holyrics
   * POST /api/GetSongPlaylist?token=...
   * Fallback para GetLyricsPlaylist / GetPlaylist para compatibilidade com versões antigas.
   */
  public async getSongPlaylist(): Promise<{
    success: boolean
    items: import('./types.js').HolyricsPlaylistItem[]
    data?: any
    error?: string
    error_code?: string
    durationMs?: number
    httpStatus?: number
  }> {
    // 1. Tenta GetSongPlaylist oficial
    const res = await this.request('GetSongPlaylist', {}, 4000)
    if (res.status === 'ok') {
      let items: import('./types.js').HolyricsPlaylistItem[] = []
      if (Array.isArray(res.data)) {
        items = res.data
      } else if (res.data && Array.isArray(res.data.items)) {
        items = res.data.items
      } else if (res.data && Array.isArray(res.data.list)) {
        items = res.data.list
      } else if (res.data && Array.isArray(res.data.playlist)) {
        items = res.data.playlist
      }
      return {
        success: true,
        items,
        data: res.data,
        durationMs: res.durationMs,
        httpStatus: res.httpStatus,
      }
    }

    const errStr1 = typeof res.error === 'string' ? res.error : res.error?.message || ''

    // Se falha for de conexão ou timeout, não faz fallback e retorna logo
    if (errStr1 === 'TIMEOUT_HOLYRICS' || errStr1.includes('CONNECTION_REFUSED')) {
      return {
        success: false,
        items: [],
        error: errStr1,
        error_code: errStr1 === 'TIMEOUT_HOLYRICS' ? 'TIMEOUT_HOLYRICS' : 'CONNECTION_REFUSED',
        durationMs: res.durationMs,
        httpStatus: res.httpStatus,
      }
    }

    // 2. Fallback GetLyricsPlaylist
    const res2 = await this.request('GetLyricsPlaylist', {}, 4000)
    if (res2.status === 'ok') {
      let items: import('./types.js').HolyricsPlaylistItem[] = []
      if (Array.isArray(res2.data)) {
        items = res2.data
      } else if (res2.data && Array.isArray(res2.data.items)) {
        items = res2.data.items
      } else if (res2.data && Array.isArray(res2.data.list)) {
        items = res2.data.list
      } else if (res2.data && Array.isArray(res2.data.playlist)) {
        items = res2.data.playlist
      }
      return {
        success: true,
        items,
        data: res2.data,
        durationMs: res2.durationMs,
        httpStatus: res2.httpStatus,
      }
    }

    // 3. Fallback GetPlaylist
    const res3 = await this.request('GetPlaylist', {}, 4000)
    if (res3.status === 'ok') {
      let items: import('./types.js').HolyricsPlaylistItem[] = []
      if (Array.isArray(res3.data)) {
        items = res3.data
      } else if (res3.data && Array.isArray(res3.data.items)) {
        items = res3.data.items
      } else if (res3.data && Array.isArray(res3.data.list)) {
        items = res3.data.list
      }
      return {
        success: true,
        items,
        data: res3.data,
        durationMs: res3.durationMs,
        httpStatus: res3.httpStatus,
      }
    }

    const errFinal = errStr1 || 'Erro ao consultar GetSongPlaylist no Holyrics'
    const isAuthError =
      res.httpStatus === 401 ||
      res.httpStatus === 403 ||
      errFinal.toLowerCase().includes('token') ||
      errFinal.toLowerCase().includes('permiss') ||
      errFinal.toLowerCase().includes('unauthorized') ||
      errFinal.toLowerCase().includes('forbidden')

    return {
      success: false,
      items: [],
      error: errFinal,
      error_code: isAuthError ? 'AUTH_FORBIDDEN' : 'GET_SONG_PLAYLIST_FAILED',
      durationMs: res.durationMs,
      httpStatus: res.httpStatus,
    }
  }

  /**
   * GetLyricsPlaylist: alias legado mantido para retrocompatibilidade
   */
  public async getLyricsPlaylist(): Promise<{
    success: boolean
    items: import('./types.js').HolyricsPlaylistItem[]
    data?: any
    error?: string
    error_code?: string
  }> {
    const res = await this.getSongPlaylist()
    return {
      success: res.success,
      items: res.items,
      data: res.data,
      error: res.error,
      error_code: res.error_code,
    }
  }

  /**
   * AddToPlaylist: Adiciona itens (músicas ou mídias) à playlist da ocorrência do culto no Holyrics.
   * Regra Etapa 3B: Tanto músicas quanto mídias devem ser enviadas exclusivamente pela ação AddToPlaylist
   * do Holyrics, sempre com o event_id da ocorrência vinculada ao culto no SaaS.
   * Payload mínimo oficial:
   * POST /api/AddToPlaylist?token=...
   * Body: {
   *   items: [{ type: "song" | "video" | "image" | "audio" | "file", id?: string, name?: string }],
   *   event_id: string,
   *   index: number,
   *   ignore_duplicates: boolean
   * }
   */
  public async addToPlaylist(
    songId: string,
    options: {
      eventId: string
      index?: number
      ignoreDuplicates?: boolean
      media_playlist?: boolean
    },
  ): Promise<{
    success: boolean
    data?: any
    error?: string
    error_code?: string
    rawResponse?: any
    payloadSent?: Record<string, any>
    httpStatus?: number
  }> {
    const eventId = String(options?.eventId || '').trim()
    if (!eventId) {
      return {
        success: false,
        error: 'event_id da ocorrência no Holyrics é obrigatório para AddToPlaylist.',
        error_code: 'MISSING_EVENT_ID',
      }
    }

    // Payload mínimo oficial conforme regra Holyrics 2.30.0 (sem campos extras)
    const payload: Record<string, any> = {
      items: [{ type: 'song', id: songId }],
      event_id: eventId,
      index: options.index !== undefined && options.index !== null ? Number(options.index) : -1,
      ignore_duplicates: options.ignoreDuplicates ?? true,
    }

    // 1. Chamada primária com a ação unificada AddToPlaylist
    const res = await this.request('AddToPlaylist', payload, 5000)
    if (res.status === 'ok') {
      return {
        success: true,
        data: res.data,
        rawResponse: res.data,
        payloadSent: payload,
        httpStatus: res.httpStatus,
      }
    }

    const errStr =
      typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Falha ao adicionar à playlist'

    // Se falha for de conexão ou timeout, encerra sem fallbacks indesejados
    if (errStr === 'TIMEOUT_HOLYRICS' || errStr.includes('CONNECTION_REFUSED')) {
      return {
        success: false,
        error: errStr,
        error_code: errStr === 'TIMEOUT_HOLYRICS' ? 'TIMEOUT_HOLYRICS' : 'CONNECTION_REFUSED',
        payloadSent: payload,
        httpStatus: res.httpStatus,
      }
    }

    const isAuthAdd =
      res.httpStatus === 401 ||
      res.httpStatus === 403 ||
      errStr.toLowerCase().includes('token') ||
      errStr.toLowerCase().includes('permiss') ||
      errStr.toLowerCase().includes('unauthorized') ||
      errStr.toLowerCase().includes('forbidden')

    return {
      success: false,
      error: errStr,
      error_code: isAuthAdd ? 'AUTH_FORBIDDEN' : 'ADD_PLAYLIST_FAILED',
      payloadSent: payload,
      httpStatus: res.httpStatus,
    }
  }

  /**
   * RemoveFromMediaPlaylist: remove itens (pelo id do item na playlist) da playlist
   * da ocorrência do culto no Holyrics.
   * POST /api/RemoveFromMediaPlaylist?token=...
   * Body: { ids: string[], event_id: string }
   */
  public async removeFromMediaPlaylist(
    ids: string[],
    eventId: string,
  ): Promise<{ success: boolean; error?: string; error_code?: string }> {
    const cleanEventId = String(eventId || '').trim()
    if (!cleanEventId) {
      return {
        success: false,
        error: 'event_id da ocorrência no Holyrics é obrigatório para RemoveFromMediaPlaylist.',
        error_code: 'MISSING_EVENT_ID',
      }
    }
    if (ids.length === 0) return { success: true }

    const res = await this.request('RemoveFromMediaPlaylist', { ids, event_id: cleanEventId }, 5000)
    if (res.status === 'ok') return { success: true }
    const errStr =
      typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Falha ao remover itens da playlist'
    return { success: false, error: errStr, error_code: 'REMOVE_FROM_PLAYLIST_FAILED' }
  }

  /**
   * AddMediaToPlaylist: Adiciona mídias à playlist da ocorrência do culto no Holyrics via AddToPlaylist oficial.
   * Regra Etapa 3B: eventId é obrigatório e repassado no payload:
   * POST /api/AddToPlaylist?token=...
   * Body: {
   *   items: [{ type: "video" | "image" | "audio" | "file", name: "Nome Fisico.mp4" }],
   *   event_id: string,
   *   index: number,
   *   ignore_duplicates: boolean
   * }
   */
  public async addMediaToPlaylist(params: {
    items: Array<{ type: 'video' | 'image' | 'audio' | 'file'; name: string }>
    eventId: string
    index?: number
    ignoreDuplicates?: boolean
  }): Promise<{
    success: boolean
    data?: any
    error?: string
    error_code?: string
    httpStatus?: number
    payloadSent?: Record<string, any>
  }> {
    const eventId = String(params.eventId || '').trim()
    if (!eventId) {
      return {
        success: false,
        error: 'event_id da ocorrência no Holyrics é obrigatório para addMediaToPlaylist.',
        error_code: 'MISSING_EVENT_ID',
      }
    }

    // Payload oficial com event_id da ocorrência vinculada ao culto no SaaS
    const payload: Record<string, any> = {
      items: params.items,
      event_id: eventId,
      index: params.index !== undefined && params.index !== null ? Number(params.index) : -1,
      ignore_duplicates: params.ignoreDuplicates ?? true,
    }

    const res = await this.request('AddToPlaylist', payload, 6000)
    if (res.status === 'ok') {
      return {
        success: true,
        data: res.data,
        httpStatus: res.httpStatus,
        payloadSent: payload,
      }
    }

    const errStr =
      typeof res.error === 'string'
        ? res.error
        : res.error?.message || 'Falha ao adicionar mídia à playlist'

    return {
      success: false,
      error: errStr,
      httpStatus: res.httpStatus,
      payloadSent: payload,
      error_code:
        errStr === 'TIMEOUT_HOLYRICS'
          ? 'TIMEOUT_HOLYRICS'
          : errStr.includes('CONNECTION_REFUSED')
            ? 'CONNECTION_REFUSED'
            : 'ADD_MEDIA_PLAYLIST_FAILED',
    }
  }

  /**
   * GetPlaylist: Obtém os itens da playlist ativa ou de mídias do Holyrics
   * POST /api/GetPlaylist?token=...
   */
  public async getPlaylist(options?: {
    type?: 'all' | 'media' | 'song'
    event_id?: string
  }): Promise<{
    success: boolean
    items: import('./types.js').HolyricsPlaylistItem[]
    data?: any
    error?: string
  }> {
    const payload: Record<string, any> = {}
    if (options?.type) payload.type = options.type
    if (options?.event_id) payload.event_id = options.event_id

    const res = await this.request('GetPlaylist', payload, 4000)
    if (res.status === 'ok') {
      let items: import('./types.js').HolyricsPlaylistItem[] = []
      if (Array.isArray(res.data)) {
        items = res.data
      } else if (res.data && Array.isArray(res.data.items)) {
        items = res.data.items
      } else if (res.data && Array.isArray(res.data.list)) {
        items = res.data.list
      } else if (res.data && Array.isArray(res.data.playlist)) {
        items = res.data.playlist
      }
      return { success: true, items, data: res.data }
    }

    return {
      success: false,
      items: [],
      error:
        typeof res.error === 'string' ? res.error : res.error?.message || 'Erro ao ler playlist',
    }
  }

  /** Método da API do Holyrics para a aba do tipo de mídia (Get<Tipo> ou Get<Tipo>s). */
  public static mediaApiAction(type: 'video' | 'image' | 'audio' | 'file', list: boolean): string {
    const base =
      type === 'video' ? 'Video' : type === 'image' ? 'Image' : type === 'audio' ? 'Audio' : 'File'
    return `Get${base}${list ? 's' : ''}`
  }

  /** <Tipo>Exists da API do Holyrics (v2.21.0+). */
  public static mediaExistsAction(type: 'video' | 'image' | 'audio' | 'file'): string {
    const base =
      type === 'video' ? 'Video' : type === 'image' ? 'Image' : type === 'audio' ? 'Audio' : 'File'
    return `${base}Exists`
  }

  /**
   * GetFile: Consulta se um arquivo específico foi detectado/indexado pelo Holyrics
   * POST /api/GetFile?token=...
   * Documentação oficial Holyrics API Server:
   * Body mínimo: { name: fileName } (na aba respectiva)
   * Algumas versões aceitam { type, name, folder?: "subpasta" }.
   * Retorna { detected, fileInfo, error, httpStatus, rawResponse }.
   */
  public async getFile(
    type: 'video' | 'image' | 'audio' | 'file',
    fileName: string,
    folder?: string,
  ): Promise<{
    detected: boolean
    fileInfo?: any
    error?: string
    httpStatus?: number
    rawResponse?: string
    payloadSent?: Record<string, any>
  }> {
    // Cada aba do Holyrics tem o seu método (documentação oficial "API-Server", v2.24.0+):
    // GetVideo / GetImage / GetAudio / GetFile. GetFile só olha a aba "Arquivos", então
    // um vídeo nunca era achado por ele. { name } aceita subpasta ("pasta/arquivo.mp4").
    const singleAction = HolyricsClient.mediaApiAction(type, false)
    const minimalPayload: Record<string, any> = {
      name: folder ? `${folder}/${fileName}` : fileName,
    }

    const resMin = await this.request(singleAction, minimalPayload, 3000)
    if (resMin.status === 'ok' && resMin.data) {
      return {
        detected: true,
        fileInfo: resMin.data,
        httpStatus: resMin.httpStatus,
        rawResponse: resMin.rawText,
        payloadSent: minimalPayload,
      }
    }

    const errMin =
      typeof resMin.error === 'string'
        ? resMin.error
        : resMin.error?.message || 'Arquivo não indexado ou não encontrado.'

    // Se a falha for de conexão/timeout/auth, não adianta tentar outro formato
    if (
      errMin === 'TIMEOUT_HOLYRICS' ||
      errMin.includes('CONNECTION_REFUSED') ||
      resMin.httpStatus === 401 ||
      resMin.httpStatus === 403
    ) {
      return {
        detected: false,
        error: errMin,
        httpStatus: resMin.httpStatus,
        rawResponse: resMin.rawText,
        payloadSent: minimalPayload,
      }
    }

    // 2. Fallback: <Tipo>Exists { file } (v2.21.0+), para versões sem Get<Tipo>
    const existsAction = HolyricsClient.mediaExistsAction(type)
    const typedPayload: Record<string, any> = { file: minimalPayload.name }
    const resExists = await this.request(existsAction, typedPayload, 3000)
    const resTyped =
      resExists.status === 'ok' && resExists.data === true
        ? { ...resExists, data: { name: minimalPayload.name } }
        : resExists.status === 'ok'
          ? { ...resExists, status: 'error' as const, error: 'File not found' }
          : resExists
    if (resTyped.status === 'ok' && resTyped.data) {
      return {
        detected: true,
        fileInfo: resTyped.data,
        httpStatus: resTyped.httpStatus,
        rawResponse: resTyped.rawText,
        payloadSent: typedPayload,
      }
    }

    const errTyped =
      typeof resTyped.error === 'string' ? resTyped.error : resTyped.error?.message || errMin

    return {
      detected: false,
      error: errTyped,
      httpStatus: resTyped.httpStatus || resMin.httpStatus,
      rawResponse: resTyped.rawText || resMin.rawText,
      payloadSent: typedPayload,
    }
  }

  /**
   * GetFiles: Lista arquivos conhecidos de uma aba do Holyrics
   * POST /api/GetFiles?token=...
   * Documentação oficial Holyrics API Server:
   * Suporta filtro por nome: { filter: "...", folder?: string } ou { type, filter }
   */
  public async getFiles(
    type: 'video' | 'image' | 'audio' | 'file',
    options?: { folder?: string; filter?: string },
  ): Promise<{
    success: boolean
    files: any[]
    error?: string
    httpStatus?: number
    rawResponse?: string
  }> {
    // Tenta primeiro com payload mínimo/filtrado
    const payload: Record<string, any> = {}
    if (options?.filter) payload.filter = options.filter
    if (options?.folder) payload.folder = options.folder

    // GetVideos / GetImages / GetAudios / GetFiles: um método por aba
    const res = await this.request(HolyricsClient.mediaApiAction(type, true), payload, 3000)

    if (res.status === 'ok') {
      const list = Array.isArray(res.data)
        ? res.data
        : res.data && Array.isArray((res.data as any).files)
          ? (res.data as any).files
          : []
      return {
        success: true,
        files: list,
        httpStatus: res.httpStatus,
        rawResponse: res.rawText,
      }
    }

    return {
      success: false,
      files: [],
      error: typeof res.error === 'string' ? res.error : res.error?.message,
      httpStatus: res.httpStatus,
      rawResponse: res.rawText,
    }
  }

  /**
   * verifyMediaRecognition: Método resiliente que combina GetFile (payload mínimo e tipado)
   * e GetFiles (busca por lista/filtro na biblioteca) para determinar se o arquivo
   * físico é reconhecido pela API do Holyrics.
   */
  public async verifyMediaRecognition(
    type: 'video' | 'image' | 'audio' | 'file',
    fileName: string,
    folder?: string,
  ): Promise<{
    recognized: boolean
    methodUsed: 'GetFile' | 'GetFiles' | 'none'
    fileInfo?: any
    error?: string
    httpStatus?: number
    rawResponse?: string
  }> {
    const cleanName = fileName.trim()

    // 1. Consulta GetFile
    const getFileRes = await this.getFile(type, cleanName, folder)
    if (getFileRes.detected) {
      return {
        recognized: true,
        methodUsed: 'GetFile',
        fileInfo: getFileRes.fileInfo,
        httpStatus: getFileRes.httpStatus,
        rawResponse: getFileRes.rawResponse,
      }
    }

    // Se houve erro de rede/timeout/conexão recusada, não tenta GetFiles
    const fatalErr = (getFileRes.error || '').toUpperCase()
    if (
      fatalErr.includes('TIMEOUT_HOLYRICS') ||
      fatalErr.includes('CONNECTION_REFUSED') ||
      getFileRes.httpStatus === 401 ||
      getFileRes.httpStatus === 403
    ) {
      return {
        recognized: false,
        methodUsed: 'GetFile',
        error: getFileRes.error,
        httpStatus: getFileRes.httpStatus,
        rawResponse: getFileRes.rawResponse,
      }
    }

    // 2. Consulta complementar via GetFiles (lista da biblioteca com filtro pelo nome exato)
    try {
      const getFilesRes = await this.getFiles(type, {
        folder,
        filter: cleanName,
      })

      if (getFilesRes.success && Array.isArray(getFilesRes.files)) {
        const lowerName = cleanName.toLowerCase()
        const match = getFilesRes.files.find((f: any) => {
          const itemText = String(f.name || f.file || f.title || '')
            .trim()
            .toLowerCase()
          return (
            itemText === lowerName ||
            itemText.endsWith('/' + lowerName) ||
            itemText.endsWith('\\' + lowerName)
          )
        })

        if (match) {
          return {
            recognized: true,
            methodUsed: 'GetFiles',
            fileInfo: match,
            httpStatus: getFilesRes.httpStatus,
            rawResponse: getFilesRes.rawResponse,
          }
        }
      }
    } catch (_) {
      // Se GetFiles falhar, mantém a resposta detalhada de GetFile
    }

    return {
      recognized: false,
      methodUsed: 'none',
      error: getFileRes.error || 'File not found',
      httpStatus: getFileRes.httpStatus,
      rawResponse: getFileRes.rawResponse,
    }
  }
}
