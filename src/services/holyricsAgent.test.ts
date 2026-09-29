import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HolyricsClient } from '../../agent/src/holyricsClient'

describe('HolyricsClient Local Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deve montar a URL base local e porta padrão corretamente', () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'secret-token-123')
    expect(client.getBaseUrl()).toBe('http://127.0.0.1:8091')
  })

  it('GetTokenInfo: retorna sucesso e versão quando o token é válido', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'valid-token')

    // Mock do fetch global
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        status: 'ok',
        data: {
          version: '2.26.1',
          permissions: 'SearchSong,AddLyricsToPlaylist,GetTokenInfo',
        },
      }),
    } as any)

    const res = await client.testConnection()
    expect(res.connected).toBe(true)
    expect(res.tokenValid).toBe(true)
    expect(res.version).toBe('2.26.1')
    expect(res.permissions).toContain('AddLyricsToPlaylist')
  })

  it('GetTokenInfo: detecta token inválido adequadamente', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'invalid-token')

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        status: 'error',
        error: 'invalid token',
      }),
    } as any)

    const res = await client.testConnection()
    expect(res.connected).toBe(true)
    expect(res.tokenValid).toBe(false)
    expect(res.code).toBe('INVALID_TOKEN')
  })

  it('Detecta Holyrics fechado / offline (ECONNREFUSED)', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'any-token')

    globalThis.fetch = vi.fn().mockRejectedValue({
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED 127.0.0.1:8091',
    })

    const res = await client.testConnection()
    expect(res.connected).toBe(false)
    expect(res.tokenValid).toBe(false)
    expect(res.code).toBe('HOLYRICS_CLOSED')
  })

  it('SearchSong: retorna lista de músicas formatada', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'valid-token')

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        status: 'ok',
        data: [
          {
            id: 'hly_101',
            title: 'Bondade de Deus',
            artist: 'Isaías Saad',
            key: 'G',
            bpm: 70,
          },
        ],
      }),
    } as any)

    const searchRes = await client.searchSong('Bondade de Deus')
    expect(searchRes.success).toBe(true)
    expect(searchRes.matches.length).toBe(1)
    expect(searchRes.matches[0].id).toBe('hly_101')
    expect(searchRes.matches[0].title).toBe('Bondade de Deus')
  })

  it('AddLyricsToPlaylist: envia requisição formatada e obtém ok', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'valid-token')

    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      // Holyrics local API action
      const actionParam = 'AddLyricsToPlaylist'
      expect(String(url)).toContain(actionParam)
      expect(String(url)).toContain('token=valid-token')
      const body = JSON.parse(init.body)
      expect(body.id).toBe('hly_101')

      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          status: 'ok',
          data: { success: true },
        }),
      } as any)
    })

    const addRes = await client.addToPlaylist('hly_101')
    expect(addRes.success).toBe(true)
  })
})
