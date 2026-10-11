import { describe, it, expect } from 'vitest'

/**
 * Testes unitários para validar a correção da engine Goja (PocketBase)
 * e o extrator extractHolyricsSongId polimórfico contra o payload real
 * de CreateSong e diferentes formatos de transporte.
 */
describe('Goja Byte-Array & extractHolyricsSongId Parsing (v0.0.31)', () => {
  // Decodificador UTF-8 multibyte exato presente nos hooks PocketBase / Goja
  const decodeUtf8Bytes = (bytes: number[]): string => {
    if (!Array.isArray(bytes) || bytes.length === 0) return ''
    let out = ''
    let i = 0
    const len = bytes.length
    while (i < len) {
      const c = bytes[i++] & 0xff
      if (c <= 0x7f) {
        out += String.fromCharCode(c)
      } else if ((c & 0xe0) === 0xc0) {
        if (i < len) {
          const c2 = bytes[i++] & 0xff
          const cp = ((c & 0x1f) << 6) | (c2 & 0x3f)
          out += String.fromCharCode(cp)
        } else {
          out += String.fromCharCode(c)
        }
      } else if ((c & 0xf0) === 0xe0) {
        if (i + 1 < len) {
          const c2 = bytes[i++] & 0xff
          const c3 = bytes[i++] & 0xff
          const cp = ((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f)
          out += String.fromCharCode(cp)
        } else {
          out += String.fromCharCode(c)
        }
      } else if ((c & 0xf8) === 0xf0) {
        if (i + 2 < len) {
          const c2 = bytes[i++] & 0xff
          const c3 = bytes[i++] & 0xff
          const c4 = bytes[i++] & 0xff
          let cp = ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)
          if (cp > 0xffff) {
            cp -= 0x10000
            out += String.fromCharCode(0xd800 + (cp >> 10))
            out += String.fromCharCode(0xdc00 + (cp & 0x3ff))
          } else {
            out += String.fromCharCode(cp)
          }
        } else {
          out += String.fromCharCode(c)
        }
      } else {
        out += String.fromCharCode(c)
      }
    }
    return out
  }

  // Implementação exata do extrator e decodificador presente no hook
  const parseGojaResult = (r: any) => {
    let finalResult = null
    try {
      if (typeof r === 'string') {
        finalResult = JSON.parse(r)
      } else if (Array.isArray(r) && r.length > 0 && typeof r[0] === 'number') {
        const s = decodeUtf8Bytes(r)
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
        const s = decodeUtf8Bytes(result)
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

  it('5b. Validação UTF-8 multibyte: acentos portugueses (ç, á, é, í, ó, ú, ã, õ, ê) preservados sem corrupção Latin-1', () => {
    const textWithAccents =
      'Jesus em Tua presença • Reunimo-nos aqui • Trouxe vida a todos nós • Ao coração do Pai • águas • pés'
    const payloadWithAccents = {
      title: 'Jesus em Tua presença',
      verses: [
        'Jesus em Tua presença',
        'Reunimo-nos aqui',
        'Trouxe vida a todos nós',
        'Ao coração do Pai',
        'Tua voz me chama sobre as águas',
        'Onde os meus pés podem falhar',
      ],
      description: textWithAccents,
    }

    // Codifica em buffer UTF-8 como o Goja entrega internamente
    const utf8Buffer = Buffer.from(JSON.stringify(payloadWithAccents), 'utf-8')
    const bytes = Array.from(utf8Buffer)

    // O decodificador multibyte deve restaurar perfeitamente os acentos
    const parsed = parseGojaResult(bytes)
    expect(parsed.title).toBe('Jesus em Tua presença')
    expect(parsed.verses[0]).toBe('Jesus em Tua presença')
    expect(parsed.verses[1]).toBe('Reunimo-nos aqui')
    expect(parsed.verses[2]).toBe('Trouxe vida a todos nós')
    expect(parsed.verses[3]).toBe('Ao coração do Pai')
    expect(parsed.verses[4]).toBe('Tua voz me chama sobre as águas')
    expect(parsed.verses[5]).toBe('Onde os meus pés podem falhar')

    // Confirma ausência de mojibake (Ã§, Ã¡, Ã³, etc)
    const jsonDecoded = JSON.stringify(parsed)
    expect(jsonDecoded).not.toContain('Ã§')
    expect(jsonDecoded).not.toContain('Ã³')
    expect(jsonDecoded).not.toContain('Ã¡')
    expect(jsonDecoded).not.toContain('Ã£')
    expect(jsonDecoded).not.toContain('Ã©')
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
