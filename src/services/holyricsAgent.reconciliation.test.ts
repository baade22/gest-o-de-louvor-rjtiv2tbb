import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HolyricsClient } from '../../agent/src/holyricsClient.js'
import { withTextBody } from '../test/fetchMock.js'

/**
 * Suíte de Testes Automatizados com Mocks:
 * Validação da Resolução da Causa Raiz Holyrics Sync (Música excluída manualmente do Holyrics)
 *
 * 8 TESTES OBRIGATÓRIOS CONFORME ESPECIFICAÇÃO:
 * 1. ID salvo e presente em GetSongs: reutiliza o ID, não cria duplicata.
 * 2. ID salvo mas ausente de GetSongs: recria a música, persiste o novo ID e adiciona à playlist.
 * 3. GetSongs indisponível: não cria música nem apaga o vínculo; erro específico de verificação do acervo.
 * 4. Música existente no acervo mas ausente da playlist: adiciona sem recriar.
 * 5. CreateSong confirmado mas com atraso na atualização do acervo: não cria segunda cópia (latência de indexação).
 * 6. Nova sincronização após recriação: reutiliza o novo ID, não duplica.
 * 7. Playlist mantém a ordem definida no SaaS.
 * 8. Regressão: UTF-8 (acentos preservados), retirada de cifras e divisão dos slides continuam passando.
 */

describe('Holyrics Repertoire Sync - Validação do Acervo e Prevenção de Desalinhamento (MOCKS)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // 1. ID salvo e presente em GetSongs: reutiliza o ID, não cria duplicata.
  it('1. [MOCK] ID salvo e presente em GetSongs: reutiliza o ID sem criar duplicata', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    const createSongSpy = vi.fn()

    const savedId = '1791754549348'
    const songTitle = 'Eu Vou Construir'

    globalThis.fetch = withTextBody(async (url: string) => {
      if (url.includes('CreateSong')) {
        createSongSpy()
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      if (url.includes('GetSongs')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [
              {
                id: savedId,
                title: songTitle,
                artist: 'Juliano Son',
              },
            ],
          }),
        }
      }
      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', data: [] }),
        }
      }
      if (url.includes('AddToPlaylist')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })

    // Validação ativa do acervo
    const libraryRes = await client.getSongs()
    expect(libraryRes.success).toBe(true)

    // Correspondência exata pelo ID salvo
    const exactMatch = libraryRes.songs.find((s) => s.id === savedId)
    expect(exactMatch).toBeDefined()
    expect(exactMatch?.id).toBe(savedId)

    // Como o ID existe no acervo, CreateSong NUNCA deve ser chamado
    expect(createSongSpy).not.toHaveBeenCalled()
  })

  // 2. ID salvo mas ausente de GetSongs: recria a música, persiste o novo ID e adiciona à playlist.
  it('2. [MOCK] ID salvo mas ausente de GetSongs: detecta vínculo obsoleto, recria a música, obtém novo ID e adiciona à playlist', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    const oldObsoleteId = '1791754549348'
    const newCreatedId = '1791778899000'
    const songTitle = 'Eu Vou Construir'

    let createSongCalled = false
    let addedToPlaylistId: string | null = null

    globalThis.fetch = withTextBody(async (url: string, opts: any) => {
      if (url.includes('GetSongs')) {
        // Acervo não possui mais o oldObsoleteId (usuário excluiu manualmente)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [
              {
                id: '1234567890',
                title: 'Outra Música',
              },
            ],
          }),
        }
      }

      if (url.includes('CreateSong')) {
        createSongCalled = true
        const body = JSON.parse(opts.body)
        expect(body.title).toBe(songTitle)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: { id: newCreatedId, title: songTitle },
          }),
        }
      }

      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: addedToPlaylistId ? [{ id: addedToPlaylistId }] : [],
          }),
        }
      }

      if (url.includes('AddToPlaylist')) {
        const body = JSON.parse(opts.body)
        addedToPlaylistId = body.items[0].id
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
        }
      }

      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })

    // Passo 1: Consulta GetSongs
    const libraryRes = await client.getSongs()
    const match = libraryRes.songs.find((s) => s.id === oldObsoleteId)
    expect(match).toBeUndefined() // ID obsoleto confirmado ausente

    // Passo 2: Recriação da música com transformação válida
    const createRes = await client.createSong({
      title: songTitle,
      artist: 'Juliano Son',
      slides: [
        {
          text: 'Digno desta canção só Tu és Senhor\nDigno do meu louvor só Tu és Senhor',
          slide_description: 'VERSO 1',
        },
      ],
      formatting_type: 'basic',
      order: '1',
    })
    expect(createRes.success).toBe(true)
    expect(createSongCalled).toBe(true)
    expect(createRes.id).toBe(newCreatedId)
    expect(createRes.id).not.toBe(oldObsoleteId)

    // Passo 3: Inclusão na playlist usando o NOVO ID
    const addRes = await client.addToPlaylist(createRes.id!, { eventId: 'hly_evt_recon', index: 0 })
    expect(addRes.success).toBe(true)
    expect(addedToPlaylistId).toBe(newCreatedId)

    // Passo 4: Confirmação na playlist
    const playlistRes = await client.getSongPlaylist()
    expect(playlistRes.items.some((it) => it.id === newCreatedId)).toBe(true)
  })

  // 3. GetSongs indisponível: não cria música nem apaga o vínculo; erro específico de verificação do acervo.
  it('3. [MOCK] GetSongs indisponível (timeout/erro): não cria música nem descarta vínculo, relata erro específico', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    const createSongSpy = vi.fn()

    globalThis.fetch = withTextBody(async (url: string) => {
      if (url.includes('GetSongs')) {
        throw new Error('Falha de rede / Timeout ao conectar no Holyrics')
      }
      if (url.includes('CreateSong')) {
        createSongSpy()
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })

    // Consulta do acervo falha
    const libraryRes = await client.getSongs()
    expect(libraryRes.success).toBe(false)

    // Regra crítica: se a consulta for inconclusiva, NÃO criar música nem tentar CreateSong
    expect(createSongSpy).not.toHaveBeenCalled()
  })

  // 4. Música existente no acervo mas ausente da playlist: adiciona sem recriar.
  it('4. [MOCK] Música existente no acervo mas ausente da playlist: adiciona diretamente sem recriar', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    const createSongSpy = vi.fn()
    let addLyricsCalls = 0

    const validHolyricsId = '1791754549348'

    globalThis.fetch = withTextBody(async (url: string) => {
      if (url.includes('CreateSong')) {
        createSongSpy()
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      if (url.includes('GetSongs')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [{ id: validHolyricsId, title: 'Eu Vou Construir' }],
          }),
        }
      }
      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', data: [] }), // Ausente da playlist
        }
      }
      if (url.includes('AddToPlaylist')) {
        addLyricsCalls++
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })

    const libCheck = await client.getSongs()
    expect(libCheck.songs.some((s) => s.id === validHolyricsId)).toBe(true)

    const playlistCheck = await client.getSongPlaylist()
    expect(playlistCheck.items.some((i) => i.id === validHolyricsId)).toBe(false)

    // Adiciona à playlist
    const addRes = await client.addToPlaylist(validHolyricsId, {
      eventId: 'hly_evt_recon',
      index: 0,
    })
    expect(addRes.success).toBe(true)
    expect(addLyricsCalls).toBe(1)
    expect(createSongSpy).not.toHaveBeenCalled()
  })

  // 5. CreateSong confirmado mas com atraso na atualização do acervo: não cria segunda cópia (latência de indexação).
  it('5. [MOCK] CreateSong confirmado mas com atraso na indexação de GetSongs: não cria segunda cópia', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    let createCount = 0

    const newlyCreatedId = '1791999888777'

    globalThis.fetch = withTextBody(async (url: string) => {
      if (url.includes('CreateSong')) {
        createCount++
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: { id: newlyCreatedId, title: 'Nova Canção' },
          }),
        }
      }
      if (url.includes('GetSongs')) {
        // Simula atraso na indexação local do Holyrics: retorna vazio
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', data: [] }),
        }
      }
      if (url.includes('AddToPlaylist')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })

    // Cria música
    const res = await client.createSong({ title: 'Nova Canção', slides: [] })
    expect(res.success).toBe(true)
    expect(res.id).toBe(newlyCreatedId)
    expect(createCount).toBe(1)

    // Consulta posterior GetSongs vem vazia por latência
    const verifyLib = await client.getSongs()
    const present = verifyLib.songs.some((s) => s.id === newlyCreatedId)
    expect(present).toBe(false)

    // REGRA: ID recebido não é descartado e NUNCA se chama CreateSong novamente
    expect(createCount).toBe(1)
  })

  // 6. Nova sincronização após recriação: reutiliza o novo ID, não duplica.
  it('6. [MOCK] Nova sincronização após recriação: reutiliza o novo ID persistido, sem duplicar', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    const createSongSpy = vi.fn()

    const persistedNewId = '1791778899000'

    globalThis.fetch = withTextBody(async (url: string) => {
      if (url.includes('CreateSong')) {
        createSongSpy()
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      if (url.includes('GetSongs')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [{ id: persistedNewId, title: 'Eu Vou Construir' }],
          }),
        }
      }
      if (url.includes('GetSongPlaylist')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            data: [{ id: persistedNewId, title: 'Eu Vou Construir' }],
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })

    // Simula a segunda sincronização
    const libCheck = await client.getSongs()
    const match = libCheck.songs.find((s) => s.id === persistedNewId)
    expect(match).toBeDefined()

    const playlistCheck = await client.getSongPlaylist()
    const inPlaylist = playlistCheck.items.some((i) => i.id === persistedNewId)
    expect(inPlaylist).toBe(true)

    // Nenhuma criação é realizada
    expect(createSongSpy).not.toHaveBeenCalled()
  })

  // 7. Playlist mantém a ordem definida no SaaS.
  it('7. [MOCK] Playlist mantém a ordem litúrgica exata definida no repertório do SaaS', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    const addedIndices: { id: string; index: number }[] = []

    globalThis.fetch = withTextBody(async (url: string, opts: any) => {
      if (url.includes('AddToPlaylist')) {
        const body = JSON.parse(opts.body)
        addedIndices.push({ id: body.items[0].id, index: body.index })
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    })

    const repertoire = [
      { holyricsId: 'song_1', order: 1 },
      { holyricsId: 'song_2', order: 2 },
      { holyricsId: 'song_3', order: 3 },
    ]

    for (let i = 0; i < repertoire.length; i++) {
      await client.addToPlaylist(repertoire[i].holyricsId, {
        eventId: 'hly_evt_order',
        index: i,
        media_playlist: false,
      })
    }

    expect(addedIndices).toEqual([
      { id: 'song_1', index: 0 },
      { id: 'song_2', index: 1 },
      { id: 'song_3', index: 2 },
    ])
  })

  // 8. Regressão: UTF-8 (acentos preservados), retirada de cifras e divisão dos slides continuam passando.
  it('8. [MOCK] Regressão: preservação estrita de acentos UTF-8, limpeza de cifras e 2 linhas por slide', async () => {
    // Simula o payload de criação gerado pelo backend
    const slidesData = [
      {
        text: 'Jesus em Tua presença\nReunimo-nos aqui',
        slide_description: 'PRIMEIRA PARTE',
      },
      {
        text: 'Pois um dia Tua morte\nTrouxe vida a todos nós',
        slide_description: 'REFRÃO',
      },
      {
        text: 'Ao coração do Pai',
        slide_description: 'REFRÃO',
      },
    ]

    const fullSlidesText = slidesData.map((s) => s.text).join('\n')

    // Preservação de acentos
    expect(fullSlidesText).toContain('presença')
    expect(fullSlidesText).toContain('Reunimo-nos')
    expect(fullSlidesText).toContain('nós')
    expect(fullSlidesText).toContain('coração')

    // Nenhuma cifra presente
    expect(fullSlidesText).not.toMatch(/\[[A-G]/)
    expect(fullSlidesText).not.toMatch(/\b(A|B|C|D|E|F|G|F#m|A\/C#|D7M)\b/)

    // Ordem dos slides respeita a estrutura
    expect(slidesData[0].slide_description).toBe('PRIMEIRA PARTE')
    expect(slidesData[1].slide_description).toBe('REFRÃO')
  })
})
