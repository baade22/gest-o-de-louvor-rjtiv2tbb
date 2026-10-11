import { describe, it, expect } from 'vitest'

/**
 * Testes unitários para validar a correção da engine Goja (PocketBase)
 * e o extrator extractHolyricsSongId polimórfico contra o payload real
 * de CreateSong e diferentes formatos de transporte.
 */
describe('Goja Byte-Array & extractHolyricsSongId Parsing (v0.0.31)', () => {
  // Implementação exata do extrator e decodificador presente no hook
  const parseGojaResult = (r: any) => {
    let finalResult = null
    try {
      if (typeof r === 'string') {
        finalResult = JSON.parse(r)
      } else if (Array.isArray(r) && r.length > 0 && typeof r[0] === 'number') {
        let s = ''
        for (let b = 0; b < r.length; b++) s += String.fromCharCode(r[b])
        finalResult = JSON.parse(s)
      } else {
        finalResult = r
      }
    } catch (_) {
      finalResult = r
    }
    return finalResult
  }

  const extractHolyricsSongId = (rawResult: any): string => {
    if (!rawResult) return ''
    let result = rawResult

    // Se vier como byte-array Goja não decodificado previamente
    if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'number') {
      try {
        let s = ''
        for (let b = 0; b < result.length; b++) s += String.fromCharCode(result[b])
        result = JSON.parse(s)
      } catch {
        /* intentionally ignored */
      }
    }

    // Se vier como string JSON crua ou duplamente serializada
    if (typeof result === 'string') {
      const trimmed = result.trim()
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          result = JSON.parse(trimmed)
        } catch {
          /* intentionally ignored */
        }
      }
    }

    if (typeof result === 'object' && result !== null) {
      if (result.holyrics_song_id) return String(result.holyrics_song_id).trim()
      if (result.id) return String(result.id).trim()
      if (result.data && typeof result.data === 'object' && result.data.id) {
        return String(result.data.id).trim()
      }
      if (result.data && (typeof result.data === 'string' || typeof result.data === 'number')) {
        const dStr = String(result.data).trim()
        if (dStr) return dStr
      }
      if (result.result) {
        const nested = extractHolyricsSongId(result.result)
        if (nested) return nested
      }
    } else if (typeof result === 'string' || typeof result === 'number') {
      const idStr = String(result).trim()
      if (idStr && idStr !== 'null' && idStr !== 'undefined') {
        return idStr
      }
    }
    return ''
  }

  const realPayload = {
    created: true,
    holyrics_song_id: '1791740605273',
    data: {
      status: 'ok',
      id: '1791740605273',
      title: 'Jesus em tua presença',
    },
  }

  it('1. Reproduz o payload real comprovado como objeto direto', () => {
    const id = extractHolyricsSongId(realPayload)
    expect(id).toBe('1791740605273')
  })

  it('2. Reproduz o caso real do Goja: campo result retornado como array de bytes numéricos', () => {
    const jsonStr = JSON.stringify(realPayload)
    // Converte string para array de bytes numéricos (ASCII / UTF-8 codes)
    const byteNumbers = Array.from(Buffer.from(jsonStr, 'utf-8'))

    // Decodifica com a lógica do hook
    const parsed = parseGojaResult(byteNumbers)
    expect(parsed).toEqual(realPayload)

    // Extrator deve obter o ID do resultado decodificado
    const id = extractHolyricsSongId(parsed)
    expect(id).toBe('1791740605273')

    // Extrator também deve ser resiliente caso receba os bytes diretamente
    const directId = extractHolyricsSongId(byteNumbers)
    expect(directId).toBe('1791740605273')
  })

  it('3. Reproduz o caso de string JSON crua ou duplamente serializada', () => {
    const jsonStr = JSON.stringify(realPayload)
    const doubleSerialized = JSON.stringify(jsonStr)

    // String JSON simples
    const id1 = extractHolyricsSongId(jsonStr)
    expect(id1).toBe('1791740605273')

    // String duplamente serializada
    const parsedOnce = parseGojaResult(doubleSerialized)
    const id2 = extractHolyricsSongId(parsedOnce)
    expect(id2).toBe('1791740605273')
  })

  it('4. Trata formatos alternativos suportados (id em data.id, número puro, string pura)', () => {
    expect(extractHolyricsSongId({ data: { id: 1791740605273 } })).toBe('1791740605273')
    expect(extractHolyricsSongId({ data: '1791740605273' })).toBe('1791740605273')
    expect(extractHolyricsSongId(1791740605273)).toBe('1791740605273')
    expect(extractHolyricsSongId('1791740605273')).toBe('1791740605273')
    expect(extractHolyricsSongId({ result: { holyrics_song_id: '1791740605273' } })).toBe(
      '1791740605273',
    )
  })

  it('5. Decodificação segura não quebra com valores nulos, vazios ou binários corrompidos', () => {
    expect(parseGojaResult(null)).toBeNull()
    expect(parseGojaResult(undefined)).toBeUndefined()
    expect(parseGojaResult([])).toEqual([])
    expect(extractHolyricsSongId(null)).toBe('')
    expect(extractHolyricsSongId(undefined)).toBe('')
    expect(extractHolyricsSongId('')).toBe('')
    expect(extractHolyricsSongId('null')).toBe('')
    expect(extractHolyricsSongId('undefined')).toBe('')

    // Bytes não-JSON válidos
    const invalidBytes = [1, 2, 3, 4]
    const parsedInvalid = parseGojaResult(invalidBytes)
    expect(parsedInvalid).toEqual(invalidBytes)
    expect(extractHolyricsSongId(invalidBytes)).toBe('')
  })

  it('6. Garante que criação bem-sucedida com ID retornado pula CreateSong em execuções seguintes', () => {
    let createSongCallCount = 0

    const syncSongWorkflow = (song: { holyrics_song_id?: string; title: string }) => {
      let currentHolyricsId = song.holyrics_song_id || ''
      if (currentHolyricsId) {
        // ID já salvo: pula CreateSong imediatamente
        return { action: 'SKIPPED_CREATE', holyrics_song_id: currentHolyricsId }
      }

      // Simula chamada CreateSong
      createSongCallCount++
      const rawGojaResult = Array.from(Buffer.from(JSON.stringify(realPayload), 'utf-8'))
      const parsedRes = parseGojaResult(rawGojaResult)
      currentHolyricsId = extractHolyricsSongId(parsedRes)

      // Persiste imediatamente
      song.holyrics_song_id = currentHolyricsId
      return { action: 'CREATED', holyrics_song_id: currentHolyricsId }
    }

    const testSong = { title: 'Jesus em tua presença', holyrics_song_id: '' }

    // Primeira execução: cria e obtém ID
    const firstRun = syncSongWorkflow(testSong)
    expect(firstRun.action).toBe('CREATED')
    expect(firstRun.holyrics_song_id).toBe('1791740605273')
    expect(createSongCallCount).toBe(1)
    expect(testSong.holyrics_song_id).toBe('1791740605273')

    // Segunda execução: ID já persistido -> CreateSong skipped (sem duplicação!)
    const secondRun = syncSongWorkflow(testSong)
    expect(secondRun.action).toBe('SKIPPED_CREATE')
    expect(secondRun.holyrics_song_id).toBe('1791740605273')
    expect(createSongCallCount).toBe(1)
  })
})
