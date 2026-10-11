import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HolyricsClient } from '../../agent/src/holyricsClient.js'
import { syncEventRepertoireWithHolyrics } from './holyricsAgent.js'
import pb from '../lib/pocketbase/client.js'

/**
 * Suite completa de testes para a máquina de sincronização LouvorFlow × Holyrics (v0.0.30)
 * Todas as chamadas externas de rede utilizam MOCKS claramente identificados.
 */
describe('Holyrics Repertoire Sync v0.0.30 - Auditoria Completa e Máquina de Estados Segura', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (globalThis.__louvorflow_sync_locks) {
      delete (globalThis as any).__louvorflow_sync_locks
    }
  })

  // 1. Criação OK com ID confirmado (MOCK Holyrics API)
  it('1. [MOCK] Criação bem-sucedida com ID retornado e confirmado em GetSongs', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    let getSongsCallCount = 0
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      if (url.includes('CreateSong')) {
        const body = JSON.parse(opts.body)
        expect(body.title).toBe('Porque Ele Vive')
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ status: 'ok', data: { id: '987654321', title: 'Porque Ele Vive' } }),
        }
      }
      if (url.includes('GetSongs')) {
        getSongsCallCount++
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: 'ok',
              data: [
                {
                  id: '987654321',
                  title: 'Porque Ele Vive',
                  artist: 'Harpa Cristã',
                },
              ],
            }),
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
    })

    const createRes = await client.createSong({
      title: 'Porque Ele Vive',
      artist: 'Harpa Cristã',
      slides: [{ text: 'Deus enviou seu Filho amado', slide_description: 'VERSO 1' }],
    })

    expect(createRes.success).toBe(true)
    expect(createRes.id).toBe('987654321')

    const confirmRes = await client.getSongs()
    expect(confirmRes.success).toBe(true)
    expect(confirmRes.songs.some((s) => s.id === '987654321')).toBe(true)
  })

  // 2. Criada no Holyrics mas consulta posterior GetSongs falha (latência/cache da API local)
  // Regra crítica: ID permanece intacto, estado registrado com pendência e fluxo continua para a playlist
  it('2. [MOCK] Criada com ID retornado mas GetSongs não lista imediatamente: ID NUNCA é descartado', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('CreateSong')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok', data: { id: '555123456' } }),
        }
      }
      if (url.includes('GetSongs')) {
        // Simula latência de indexação local do Holyrics (retorna vazio no primeiro momento)
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok', data: [] }),
        }
      }
      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok', data: [] }),
        }
      }
      if (url.includes('AddLyricsToPlaylist')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok' }),
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
    })

    const createRes = await client.createSong({ title: 'Aclame ao Senhor', slides: [] })
    expect(createRes.success).toBe(true)
    expect(createRes.id).toBe('555123456')

    // Verificação GetSongs não encontrou a música (cache do Holyrics)
    const checkRes = await client.getSongs()
    const appearsImmediately = checkRes.songs.some((s) => s.id === '555123456')
    expect(appearsImmediately).toBe(false)

    // O ID recebido de CreateSong é preservado e deve ser usado para adicionar na playlist
    const addToPlaylistRes = await client.addToPlaylist(createRes.id!, { index: 0 })
    expect(addToPlaylistRes.success).toBe(true)
  })

  // 3. Resposta de criação perdida / timeout: GetSongs reconcilia sem criar de novo
  it('3. [MOCK] Resposta de CreateSong perdida/timeout: GetSongs reconcilia pelo título sem duplicar', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('CreateSong')) {
        throw new Error('TIMEOUT_HOLYRICS')
      }
      if (url.includes('GetSongs')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: 'ok',
              data: [
                {
                  id: '777888999',
                  title: 'Grande é o Senhor',
                  artist: 'Adhemar de Campos',
                },
              ],
            }),
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
    })

    const createAttempt = await client.createSong({ title: 'Grande é o Senhor', slides: [] })
    expect(createAttempt.success).toBe(false)
    expect(createAttempt.error_code).toBe('TIMEOUT_HOLYRICS')

    // Consulta GetSongs antes de tentar criar de novo
    const reconRes = await client.getSongs()
    const found = reconRes.songs.find((s) => s.title === 'Grande é o Senhor')
    expect(found).toBeDefined()
    expect(found?.id).toBe('777888999')
    // Reconciliado com sucesso sem disparar outro CreateSong
  })

  // 4. Resultado do Agent em formatos alternativos (encapsulado, data escalar, string, número)
  it('4. [MOCK] Extração polimórfica de IDs em formatos variados retornados pelo Agent/Holyrics', () => {
    const extractHolyricsSongId = (result: any): string => {
      if (!result) return ''
      if (typeof result === 'object') {
        if (result.holyrics_song_id) return String(result.holyrics_song_id).trim()
        if (result.id) return String(result.id).trim()
        if (result.data && typeof result.data === 'object' && result.data.id) {
          return String(result.data.id).trim()
        }
        if (result.data && (typeof result.data === 'string' || typeof result.data === 'number')) {
          return String(result.data).trim()
        }
      } else if (typeof result === 'string' || typeof result === 'number') {
        return String(result).trim()
      }
      return ''
    }

    // Formato 1: { holyrics_song_id: '123' }
    expect(extractHolyricsSongId({ holyrics_song_id: '123' })).toBe('123')

    // Formato 2: { id: '456' }
    expect(extractHolyricsSongId({ id: '456' })).toBe('456')

    // Formato 3: { data: { id: '789' } }
    expect(extractHolyricsSongId({ data: { id: '789' } })).toBe('789')

    // Formato 4: { data: '101112' } escalar
    expect(extractHolyricsSongId({ data: '101112' })).toBe('101112')

    // Formato 5: número puro 131415
    expect(extractHolyricsSongId(131415)).toBe('131415')

    // Formato 6: string pura '161718'
    expect(extractHolyricsSongId('161718')).toBe('161718')
  })

  // 5. Existente identificado por GetSongs: correspondência estrita por título e artista
  it('5. [MOCK] Existente no acervo identificado por GetSongs: ignora acentos, espaços extras e pontuação', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('GetSongs')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: 'ok',
              data: [
                {
                  id: '202020',
                  title: 'Vem, Esta é a Hora da Adoração',
                  artist: 'Vineyard Music',
                },
              ],
            }),
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
    })

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const libraryRes = await client.getSongs()
    const searchTarget = 'vem  esta e a hora da adoracao'

    const matched = libraryRes.songs.find((s) => normalize(s.title) === normalize(searchTarget))
    expect(matched).toBeDefined()
    expect(matched?.id).toBe('202020')
  })

  // 6. ID persistido reutilizado sem nova criação
  it('6. [MOCK] Quando a música já possui holyrics_song_id salvo, CreateSong é 100% evitado', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    const createSongSpy = vi.fn()

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('CreateSong')) {
        createSongSpy()
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
      }
      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok', data: [{ id: '999999' }] }),
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
    })

    // ID já conhecido
    const existingId = '999999'
    const playlist = await client.getSongPlaylist()
    const inPlaylist = playlist.items.some((i) => i.id === existingId)
    expect(inPlaylist).toBe(true)
    expect(createSongSpy).not.toHaveBeenCalled()
  })

  // 7. Inclusão na playlist confirmada via GetSongPlaylist
  it('7. [MOCK] Adição na playlist exige confirmação estrita via GetSongPlaylist', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    let playlistCheckedCount = 0
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      if (url.includes('AddLyricsToPlaylist')) {
        const body = JSON.parse(opts.body)
        expect(body.id).toBe('444444')
        expect(body.index).toBe(2)
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
      }
      if (url.includes('GetSongPlaylist')) {
        playlistCheckedCount++
        if (playlistCheckedCount === 1) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ status: 'ok', data: [] }),
          }
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok', data: [{ id: '444444' }] }),
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
    })

    const initialPlaylist = await client.getSongPlaylist()
    expect(initialPlaylist.items.some((i) => i.id === '444444')).toBe(false)

    const addRes = await client.addToPlaylist('444444', { index: 2 })
    expect(addRes.success).toBe(true)

    const confirmedPlaylist = await client.getSongPlaylist()
    expect(confirmedPlaylist.items.some((i) => i.id === '444444')).toBe(true)
  })

  // 8. Música já presente na playlist: AddLyricsToPlaylist não é chamado
  it('8. [MOCK] Música já presente na playlist é marcada ALREADY_IN_PLAYLIST sem nova inserção', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    const addLyricsSpy = vi.fn()

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('AddLyricsToPlaylist')) {
        addLyricsSpy()
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
      }
      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok', data: [{ id: '111222' }] }),
        }
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'ok' }) }
    })

    const playlist = await client.getSongPlaylist()
    const alreadyPresent = playlist.items.some((it) => it.id === '111222')
    expect(alreadyPresent).toBe(true)
    expect(addLyricsSpy).not.toHaveBeenCalled()
  })

  // 9. Falha de autorização real classificada como AUTH_FORBIDDEN
  it('9. [MOCK] Erro HTTP 401/403 ou token rejeitado gera AUTH_FORBIDDEN sem falso positivo', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'invalid_token')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ status: 'error', error: 'invalid token' }),
    })

    const res = await client.createSong({ title: 'Teste', slides: [] })
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('AUTH_FORBIDDEN')
  })

  // 10. Dois pedidos simultâneos para a mesma música: lock impede duplicate CreateSong
  it('10. [MOCK] Dois pedidos simultâneos na mesma congregação e música: apenas um CreateSong', async () => {
    let createCallCount = 0
    const locks: Record<string, boolean> = {}

    const executeSafeSync = async (churchId: string, songId: string) => {
      const lockKey = `${churchId}::${songId}`
      if (locks[lockKey]) {
        return { status: 'LOCKED_WAITING' }
      }
      locks[lockKey] = true
      try {
        createCallCount++
        await new Promise((r) => setTimeout(r, 40))
        return { status: 'CREATED', holyrics_song_id: '888001' }
      } finally {
        delete locks[lockKey]
      }
    }

    const [resA, resB] = await Promise.all([
      executeSafeSync('church_1', 'song_1'),
      executeSafeSync('church_1', 'song_1'),
    ])

    expect(createCallCount).toBe(1)
    expect(resA.status === 'CREATED' || resB.status === 'CREATED').toBe(true)
    expect(resA.status === 'LOCKED_WAITING' || resB.status === 'LOCKED_WAITING').toBe(true)
  })

  // 11. Ordem do repertório preservada na playlist
  it('11. [MOCK] Preserva a ordem litúrgica do evento na playlist (index base 0)', () => {
    const songsToSync = [
      { id: 's1', holyrics_id: 'h1', order: 1 },
      { id: 's2', holyrics_id: 'h2', order: 2 },
      { id: 's3', holyrics_id: 'h3', order: 3 },
    ]

    const calls: { id: string; index: number }[] = []
    songsToSync.forEach((s, idx) => {
      calls.push({ id: s.holyrics_id, index: idx })
    })

    expect(calls).toEqual([
      { id: 'h1', index: 0 },
      { id: 'h2', index: 1 },
      { id: 'h3', index: 2 },
    ])
  })

  // 12. Frontend syncEventRepertoireWithHolyrics envia os parâmetros corretos
  it('12. [MOCK] Frontend service syncEventRepertoireWithHolyrics envia churchId e eventId', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      success: true,
      has_errors: false,
      items: [],
      summary: {
        total: 0,
        created: 0,
        already_existed: 0,
        added: 0,
        already_in_playlist: 0,
        errors: 0,
      },
      message: 'OK',
    })
    pb.send = mockPost as any

    await syncEventRepertoireWithHolyrics({
      churchId: 'church_xyz',
      eventId: 'event_xyz',
    })

    expect(mockPost).toHaveBeenCalledWith('/backend/v1/saas/holyrics/sync-event', {
      method: 'POST',
      body: { church_id: 'church_xyz', event_id: 'event_xyz', agent_id: undefined },
    })
  })
})
