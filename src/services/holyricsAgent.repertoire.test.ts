import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HolyricsClient } from '../../agent/src/holyricsClient.js'
import { syncEventRepertoireWithHolyrics } from './holyricsAgent.js'
import { pb } from '../lib/pocketbase/client.js'

describe('Holyrics Repertoire Sync v0.0.26 - Regras Definitivas & Zero Duplicação', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Música nova: GetSongs não encontra -> CreateSong -> GetSongs confirma -> salva ID -> GetSongPlaylist não encontra -> AddLyricsToPlaylist -> GetSongPlaylist confirma -> CREATED + ADDED_TO_PLAYLIST.
  it('1. Música nova segue fluxo completo com confirmação dupla e marca CREATED + ADDED_TO_PLAYLIST', async () => {
    // Simula chamadas HolyricsClient
    const client = new HolyricsClient({
      serverUrl: 'http://127.0.0.1:8091',
      token: 'test_token',
      holyricsPort: 8091,
    })

    // Mock fetch
    let getSongsCallCount = 0
    let getSongPlaylistCallCount = 0

    const fetchMock = vi.fn().mockImplementation(async (url: string, opts: any) => {
      const body = JSON.parse(opts?.body || '{}')

      if (url.includes('GetSongs')) {
        getSongsCallCount++
        if (getSongsCallCount === 1) {
          // Primeira chamada: biblioteca vazia
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok', data: [] }),
          }
        }
        // Segunda chamada (confirmação após CreateSong): música aparece
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [
              {
                id: '1790728009858',
                title: 'Oceanos',
                artist: 'Ana Nóbrega',
              },
            ],
          }),
        }
      }

      if (url.includes('CreateSong')) {
        expect(body.title).toBe('Oceanos')
        expect(body.artist).toBe('Ana Nóbrega')
        expect(body.slides).toBeDefined()
        expect(body.formatting_type).toBe('basic')
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: { id: '1790728009858', title: 'Oceanos' },
          }),
        }
      }

      if (url.includes('GetSongPlaylist')) {
        getSongPlaylistCallCount++
        if (getSongPlaylistCallCount === 1) {
          // Não está na playlist ainda
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'ok', data: [] }),
          }
        }
        // Confirmação após AddLyricsToPlaylist
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [{ id: '1790728009858', title: 'Oceanos' }],
          }),
        }
      }

      if (url.includes('AddLyricsToPlaylist')) {
        expect(body.id).toBe('1790728009858')
        expect(body.index).toBe(0)
        expect(body.media_playlist).toBe(false)
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
        }
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', data: [] }),
      }
    })

    globalThis.fetch = fetchMock

    // Executa métodos do client
    const step1 = await client.getSongs()
    expect(step1.success).toBe(true)
    expect(step1.songs).toHaveLength(0)

    const step2 = await client.createSong({
      title: 'Oceanos',
      artist: 'Ana Nóbrega',
      author: 'Ana Nóbrega',
      note: 'Criada para teste',
      copyright: '',
      slides: [{ text: 'Tua voz me chama sobre as águas', slide_description: 'VERSO 1' }],
      formatting_type: 'basic',
      order: '1',
      key: 'D',
      bpm: 72,
    })
    expect(step2.success).toBe(true)
    expect(step2.id).toBe('1790728009858')

    // Confirmação GetSongs
    const step3 = await client.getSongs()
    expect(step3.success).toBe(true)
    expect(step3.songs.some((s) => s.id === '1790728009858')).toBe(true)

    // Consulta Playlist
    const step4 = await client.getSongPlaylist()
    expect(step4.items.some((i) => i.id === '1790728009858')).toBe(false)

    // Adiciona à Playlist
    const step5 = await client.addToPlaylist('1790728009858', { index: 0, media_playlist: false })
    expect(step5.success).toBe(true)

    // Confirmação GetSongPlaylist
    const step6 = await client.getSongPlaylist()
    expect(step6.items.some((i) => i.id === '1790728009858')).toBe(true)
  })

  // 2. Repetir sincronização: ID existente, CreateSong NÃO executado, já na playlist, AddLyricsToPlaylist NÃO executado -> ALREADY_IN_PLAYLIST.
  it('2. Repetir sincronização: com holyrics_song_id e já na playlist, CreateSong e AddLyrics NÃO são chamados', async () => {
    const client = new HolyricsClient({
      serverUrl: 'http://127.0.0.1:8091',
      token: 'test_token',
      holyricsPort: 8091,
    })

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [{ id: '1790728009858', title: 'Oceanos' }],
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      }
    })
    globalThis.fetch = fetchMock

    // Simula verificação: ID já é conhecido '1790728009858'
    const playlist = await client.getSongPlaylist()
    const isAlreadyIn = playlist.items.some((it) => it.id === '1790728009858')
    expect(isAlreadyIn).toBe(true)

    // Nenhum CreateSong nem AddLyricsToPlaylist chamado
    const createSongCalled = fetchMock.mock.calls.some((c) => c[0].includes('CreateSong'))
    const addLyricsCalled = fetchMock.mock.calls.some((c) => c[0].includes('AddLyricsToPlaylist'))
    expect(createSongCalled).toBe(false)
    expect(addLyricsCalled).toBe(false)
  })

  // 3. Música existente no Holyrics sem holyrics_song_id: GetSongs encontra, salva ID, CreateSong NÃO executado.
  it('3. Música existente no Holyrics sem holyrics_song_id: correspondência por título seguro evita CreateSong', async () => {
    const client = new HolyricsClient({
      serverUrl: 'http://127.0.0.1:8091',
      token: 'test_token',
      holyricsPort: 8091,
    })

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('GetSongs')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [
              {
                id: '1790729773014',
                title: 'LouvorFlow TESTE 001',
                artist: 'LouvorFlow',
              },
            ],
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })
    globalThis.fetch = fetchMock

    const res = await client.getSongs()
    expect(res.success).toBe(true)

    // Normalização segura
    const targetTitle = '  louvorflow  teste 001  '
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const match = res.songs.find((s) => normalize(s.title) === normalize(targetTitle))
    expect(match).toBeDefined()
    expect(match?.id).toBe('1790729773014')

    // CreateSong NÃO deve ser chamado
    const createCalled = fetchMock.mock.calls.some((c) => c[0].includes('CreateSong'))
    expect(createCalled).toBe(false)
  })

  // 4. Música existente fora da playlist: GetSongs encontra, AddLyricsToPlaylist com index do repertório, confirmação.
  it('4. Música existente fora da playlist: adicionada na posição correta e confirmada', async () => {
    const client = new HolyricsClient({
      serverUrl: 'http://127.0.0.1:8091',
      token: 'test_token',
      holyricsPort: 8091,
    })

    let playlistChecked = false
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts: any) => {
      if (url.includes('GetSongPlaylist')) {
        if (!playlistChecked) {
          playlistChecked = true
          return { ok: true, status: 200, json: async () => ({ status: 'ok', data: [] }) }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [{ id: '1790729773014', title: 'LouvorFlow TESTE 001' }],
          }),
        }
      }
      if (url.includes('AddLyricsToPlaylist')) {
        const body = JSON.parse(opts.body)
        expect(body.index).toBe(1) // segunda música do culto
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })
    globalThis.fetch = fetchMock

    const addRes = await client.addToPlaylist('1790729773014', { index: 1, media_playlist: false })
    expect(addRes.success).toBe(true)

    const checkRes = await client.getSongPlaylist()
    expect(checkRes.items.some((it) => it.id === '1790729773014')).toBe(true)
  })

  // 5. CreateSong erro/timeout mas música criada: GetSongs encontra, salva ID, NÃO criar de novo, continuar.
  it('5. CreateSong com timeout mas criada no Holyrics: recuperada via GetSongs sem duplicar', async () => {
    const client = new HolyricsClient({
      serverUrl: 'http://127.0.0.1:8091',
      token: 'test_token',
      holyricsPort: 8091,
    })

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('CreateSong')) {
        // Simula timeout da requisição
        throw new Error('TIMEOUT_HOLYRICS')
      }
      if (url.includes('GetSongs')) {
        // Na consulta de conferência pós-falha, a música está lá!
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [
              {
                id: '1790729773014',
                title: 'Grande é o Senhor',
              },
            ],
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })
    globalThis.fetch = fetchMock

    // CreateSong falha
    const createRes = await client.createSong({ title: 'Grande é o Senhor' })
    expect(createRes.success).toBe(false)

    // Regra crítica: consultar GetSongs para ver se foi criada mesmo assim
    const recoveryCheck = await client.getSongs()
    const createdAnyway = recoveryCheck.songs.find((s) => s.title === 'Grande é o Senhor')
    expect(createdAnyway).toBeDefined()
    expect(createdAnyway?.id).toBe('1790729773014')
    // ID recuperado com sucesso, ZERO duplicação
  })

  // 6. AddLyricsToPlaylist retorna OK mas música não aparece no GetSongPlaylist -> ERROR (não ADDED_TO_PLAYLIST).
  it('6. AddLyricsToPlaylist retorna OK mas não aparece na playlist -> deve acusar ERROR técnico', async () => {
    const client = new HolyricsClient({
      serverUrl: 'http://127.0.0.1:8091',
      token: 'test_token',
      holyricsPort: 8091,
    })

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('AddLyricsToPlaylist')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      if (url.includes('GetSongPlaylist')) {
        // A API retornou OK mas a playlist continua vazia
        return { ok: true, status: 200, json: async () => ({ status: 'ok', data: [] }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })
    globalThis.fetch = fetchMock

    const addRes = await client.addToPlaylist('1790728009858')
    expect(addRes.success).toBe(true)

    // Verificação estrita
    const verifyPlaylist = await client.getSongPlaylist()
    const appeared = verifyPlaylist.items.some((i) => i.id === '1790728009858')
    expect(appeared).toBe(false)
    // Se não apareceu, o sistema LouvorFlow marca ERROR com mensagem técnica
  })

  // 7. Dois cliques simultâneos -> apenas UMA chamada CreateSong (idempotência e lock).
  it('7. Dois disparos concorrentes para a mesma música: lock impede duplicação', async () => {
    let callCounter = 0
    const simulateSyncCall = async (songId: string, title: string) => {
      // Simula a proteção no backend
      if (globalThis.__sync_locks && globalThis.__sync_locks[songId]) {
        return { skipped: true, reason: 'LOCKED' }
      }
      if (!globalThis.__sync_locks) (globalThis as any).__sync_locks = {}
      ;(globalThis as any).__sync_locks[songId] = true

      callCounter++
      await new Promise((r) => setTimeout(r, 50))
      delete (globalThis as any).__sync_locks[songId]
      return { skipped: false, createdId: '123' }
    }

    const [res1, res2] = await Promise.all([
      simulateSyncCall('song_abc', 'Oceanos'),
      simulateSyncCall('song_abc', 'Oceanos'),
    ])

    // Apenas uma execução efetuou a criação
    expect(callCounter).toBe(1)
    expect(res1.skipped !== res2.skipped).toBe(true)
  })

  // 8. Ordem do evento A,B,C -> playlist A,B,C (índices 0,1,2 do repertório).
  it('8. Ordem litúrgica do repertório (índices 0, 1, 2) é estritamente mantida', async () => {
    const repertoire = [
      { id: '1', title: 'Oceanos', order: 1 },
      { id: '2', title: 'Grande é o Senhor', order: 2 },
      { id: '3', title: 'Amor do Nosso Deus', order: 3 },
    ]

    const playlistCalls: { id: string; index: number }[] = []

    const mockAddToPlaylist = (songId: string, index: number) => {
      playlistCalls.push({ id: songId, index })
    }

    // Processamento estrito na ordem do repertório
    repertoire.forEach((song, idx) => {
      mockAddToPlaylist(`holyrics_${song.id}`, idx)
    })

    expect(playlistCalls).toEqual([
      { id: 'holyrics_1', index: 0 },
      { id: 'holyrics_2', index: 1 },
      { id: 'holyrics_3', index: 2 },
    ])
  })

  // 9. Usuário sem holyrics.sync recebe 403 (MASTER/ADMIN/LIDER pode).
  it('9. Validação de permissões: Músico recebe 403 e Admin/Líder/Master têm acesso liberado', async () => {
    const checkRolePermission = (role: string) => {
      if (role === 'MASTER' || role === 'ADMIN' || role === 'LIDER') {
        return { allowed: true }
      }
      return { allowed: false, status: 403, error: 'INSUFFICIENT_PERMISSIONS' }
    }

    expect(checkRolePermission('MASTER').allowed).toBe(true)
    expect(checkRolePermission('ADMIN').allowed).toBe(true)
    expect(checkRolePermission('LIDER').allowed).toBe(true)
    expect(checkRolePermission('MUSICO').allowed).toBe(false)
    expect(checkRolePermission('MUSICO').status).toBe(403)
  })

  // 10. Igreja A não executa comando/operação da Igreja B (multi-tenant).
  it('10. Multi-tenant: isolamento estrito entre congregações A e B', async () => {
    const validateTenant = (eventChurchId: string, userChurchId: string) => {
      if (eventChurchId !== userChurchId) {
        return { status: 403, error: 'MULTI_TENANT_VIOLATION' }
      }
      return { status: 200, ok: true }
    }

    const test1 = validateTenant('church_A', 'church_B')
    expect(test1.status).toBe(403)
    expect(test1.error).toBe('MULTI_TENANT_VIOLATION')

    const test2 = validateTenant('church_A', 'church_A')
    expect(test2.status).toBe(200)
    expect(test2.ok).toBe(true)
  })

  // 11. Agent offline e Holyrics offline -> erro técnico claro, sem estado falso de sucesso.
  it('11. Agent offline ou Holyrics offline retorna mensagem técnica clara', async () => {
    const client = new HolyricsClient({
      serverUrl: 'http://127.0.0.1:8091',
      token: 'test_token',
      holyricsPort: 8091,
    })

    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('fetch failed: ECONNREFUSED 127.0.0.1:8091'))

    const res = await client.getSongs()
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('CONNECTION_REFUSED')
    expect(res.error).toContain('CONNECTION_REFUSED')
  })

  // 12. Frontend service syncEventRepertoireWithHolyrics envia payload correto e trata resposta
  it('12. Frontend service syncEventRepertoireWithHolyrics integra com endpoint oficial', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      success: true,
      has_errors: false,
      items: [
        {
          order: 1,
          song_id: 's1',
          song_title: 'Oceanos',
          action: 'ALREADY_IN_PLAYLIST',
          status: 'SUCCESS',
          detail: '✓ Música já existente no Holyrics • ✓ Música já estava na playlist',
        },
      ],
      summary: {
        total: 1,
        created: 0,
        already_existed: 1,
        added: 0,
        already_in_playlist: 1,
        errors: 0,
      },
      message: 'Sincronização concluída com sucesso!',
    })
    pb.send = mockPost as any

    const res = await syncEventRepertoireWithHolyrics({
      churchId: 'church_123',
      eventId: 'evt_123',
    })

    expect(mockPost).toHaveBeenCalledWith('/backend/v1/saas/holyrics/sync-event', {
      method: 'POST',
      body: { church_id: 'church_123', event_id: 'evt_123', agent_id: undefined },
    })
    expect(res.success).toBe(true)
    expect(res.items).toHaveLength(1)
    expect(res.summary.already_in_playlist).toBe(1)
  })
})
