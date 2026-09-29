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
    timeoutMs = 4000,
  ): Promise<HolyricsApiResponse<T>> {
    const cleanAction = action.replace(/^\/+/, '')
    const url = new URL(`${this.getBaseUrl()}/api/${cleanAction}`)
    if (this.token) {
      url.searchParams.set('token', this.token)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

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

      let json: any = null
      try {
        json = await res.json()
      } catch (_) {
        return {
          status: 'error',
          error: `Resposta não é JSON válido (HTTP ${res.status})`,
        }
      }

      return json as HolyricsApiResponse<T>
    } catch (err: any) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        return {
          status: 'error',
          error: 'TIMEOUT_HOLYRICS',
        }
      }
      return {
        status: 'error',
        error: err.code || err.message || 'CONNECTION_REFUSED',
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
   */
  public async searchSong(
    query: string,
    options: { title?: boolean; artist?: boolean; lyrics?: boolean } = {},
  ): Promise<{ success: boolean; matches: HolyricsSongItem[]; error?: string }> {
    const payload = {
      text: query,
      title: options.title ?? true,
      artist: options.artist ?? true,
      lyrics: options.lyrics ?? false,
      fields: 'id,title,artist,author,key,bpm,archived',
    }

    const res = await this.request<HolyricsSongItem[]>('SearchSong', payload)
    if (res.status === 'ok') {
      const list = Array.isArray(res.data) ? res.data : []
      return {
        success: true,
        matches: list,
      }
    }

    // Fallback: tenta SearchLyrics se SearchSong não existir
    const fallbackRes = await this.request<HolyricsSongItem[]>('SearchLyrics', payload)
    if (fallbackRes.status === 'ok') {
      const list = Array.isArray(fallbackRes.data) ? fallbackRes.data : []
      return {
        success: true,
        matches: list,
      }
    }

    const errStr = typeof res.error === 'string' ? res.error : res.error?.message || 'Erro na busca'
    return {
      success: false,
      matches: [],
      error: errStr,
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
