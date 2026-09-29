import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HolyricsClient } from '../../agent/src/holyricsClient'
import { LouvorFlowAgent } from '../../agent/src/agent'
import { getHolyricsCommandStatus } from './holyricsAgent'
import pb from '@/lib/pocketbase/client'

describe('Holyrics SearchSong Parser & Respostas (0, 1, N resultados)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('Parser com 0 resultados: retorna matches vazio e success=true', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ status: 'ok', data: [] }),
    } as any)

    const res = await client.searchSong('Musica Inexistente')
    expect(res.success).toBe(true)
    expect(res.matches).toEqual([])
    expect(res.matches.length).toBe(0)
  })

  it('Parser com 1 resultado: retorna exatamente 1 match', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          status: 'ok',
          data: [{ id: '101', title: 'Oceanos', artist: 'Hillsong', key: 'D' }],
        }),
    } as any)

    const res = await client.searchSong('Oceanos')
    expect(res.success).toBe(true)
    expect(res.matches.length).toBe(1)
    expect(res.matches[0].id).toBe('101')
    expect(res.matches[0].title).toBe('Oceanos')
  })

  it('Parser com N resultados (múltiplos): preserva todos os itens para desambiguação', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          status: 'ok',
          data: [
            { id: '101', title: 'Oceanos (Versão 1)', artist: 'Ana Nóbrega', key: 'D' },
            { id: '102', title: 'Oceanos (Versão 2)', artist: 'Hillsong', key: 'D' },
            { id: '103', title: 'Oceanos (Acústico)', artist: 'Coral', key: 'C' },
          ],
        }),
    } as any)

    const res = await client.searchSong('Oceanos')
    expect(res.success).toBe(true)
    expect(res.matches.length).toBe(3)
    expect(res.matches[0].title).toBe('Oceanos (Versão 1)')
    expect(res.matches[1].title).toBe('Oceanos (Versão 2)')
    expect(res.matches[2].title).toBe('Oceanos (Acústico)')
  })

  it('Fallback SearchLyrics NUNCA é chamado se SearchSong der TIMEOUT_HOLYRICS', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test-token')
    let fetchCalls = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCalls++
      const abortErr = new Error('The operation was aborted')
      abortErr.name = 'AbortError'
      return Promise.reject(abortErr)
    })

    const res = await client.searchSong('Lento Demais')
    expect(fetchCalls).toBe(1) // Não chamou SearchLyrics
    expect(res.success).toBe(false)
    expect(res.error).toBe('TIMEOUT_HOLYRICS')
  })

  it('Diagnosticar SearchSong retorna payload, endpoint e duração sem expor token', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'secret-local-token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          status: 'ok',
          data: [{ id: '999', title: 'Graça', artist: 'Paulo César Baruk' }],
        }),
    } as any)

    const diag = await client.diagnoseSearchSong('Graça')
    expect(diag.endpoint).toBe('http://127.0.0.1:8091/api/SearchSong')
    expect(diag.endpoint).not.toContain('secret-local-token')
    expect(diag.method).toBe('POST')
    expect(diag.httpStatus).toBe(200)
    expect(diag.count).toBe(1)
    expect(diag.payloadSent.text).toBe('Graça')
    expect(diag.checklist).toBeDefined()
    expect(diag.checklist?.length).toBeGreaterThanOrEqual(4)
    expect(diag.checklist?.some((s) => s.label === 'Agent' && s.status === 'OK')).toBe(true)
    expect(diag.checklist?.some((s) => s.label === 'SearchSong' && s.status === 'OK')).toBe(true)
  })

  it('Diagnosticar SearchSong com TIMEOUT inclui checklist com status TIMEOUT e causa técnica', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'secret-local-token')
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      const u = String(url)
      if (u.includes('GetTokenInfo')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: async () => JSON.stringify({ status: 'ok', data: { version: '2.30.0' } }),
        } as any)
      }
      // Timeout no SearchSong
      const abortErr = new Error('The operation was aborted')
      abortErr.name = 'AbortError'
      return Promise.reject(abortErr)
    })

    const diag = await client.diagnoseSearchSong('MusicaDemorada')
    expect(diag.status).toBe('error')
    expect(diag.error).toBe('TIMEOUT_HOLYRICS')
    expect(diag.technicalCause).toContain('Tempo limite excedido')
    const searchStep = diag.checklist?.find((s) => s.label === 'SearchSong')
    expect(searchStep?.status).toBe('TIMEOUT')
  })
})

describe('Endpoint de Status do Comando (SaaS Frontend Service)', () => {
  it('getHolyricsCommandStatus chama /backend/v1/holyrics/commands/:id/status via GET', async () => {
    const sendSpy = vi.spyOn(pb, 'send').mockResolvedValue({
      success: true,
      command_id: 'cmd_123',
      action: 'SEARCH_SONG',
      status: 'DONE',
      result: { matches: [] },
    } as any)

    const res = await getHolyricsCommandStatus('cmd_123')
    expect(sendSpy).toHaveBeenCalledWith('/backend/v1/holyrics/commands/cmd_123/status', {
      method: 'GET',
    })
    expect(res.status).toBe('DONE')
    sendSpy.mockRestore()
  })
})

describe('Retry de Reporte de Resultado do Agent', () => {
  it('LouvorFlowAgent reenvia resultado com retry caso o primeiro POST falhe', async () => {
    const agent = new LouvorFlowAgent({
      saasUrl: 'https://saas.example.com',
      agentId: 'ag_test',
      agentToken: 'token_test',
      holyricsHost: '127.0.0.1',
      holyricsPort: 8091,
      holyricsToken: 'h_tok',
      agentWebPort: 8765,
      pollIntervalMs: 5000,
      heartbeatIntervalMs: 15000,
    })

    let reportAttempts = 0
    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      const urlStr = String(url)
      if (urlStr.includes('/result')) {
        reportAttempts++
        if (reportAttempts === 1) {
          // Primeira tentativa falha
          return Promise.reject(new Error('Network error'))
        }
        // Segunda tentativa (retry) tem sucesso
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ success: true }),
        } as any)
      }

      // Mock da busca no Holyrics
      return Promise.resolve({
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ status: 'ok', data: [] }),
      } as any)
    })

    // Executa comando SEARCH_SONG
    await (agent as any).executeCommand({
      id: 'rec_1',
      command_id: 'cmd_retry_test',
      action: 'SEARCH_SONG',
      payload: { query: 'Teste' },
      created_at: new Date().toISOString(),
    })

    expect(reportAttempts).toBe(2)
  })
})
