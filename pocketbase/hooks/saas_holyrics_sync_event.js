// Hook para o fluxo: Sincronizar repertório do evento com Holyrics
// POST /backend/v1/saas/holyrics/sync-event
// Versão do produto: 0.0.31
// Requer autenticação + perfil com holyrics.sync (MASTER/ADMIN/LIDER; Músico NÃO PODE -> 403)
// Multi-tenant: church_id validado via autenticação; valida evento e músicas pertencentes à mesma congregação.
// Body: { church_id, event_id, agent_id? }
// Processa as músicas na ordem exata do repertório do evento (order 1,2,3... do event_songs).
//
// GARANTIAS CONTRA DUPLICAÇÃO E REGRAS CRÍTICAS:
// 1. Persistência imediata: quando CreateSong retorna DONE com ID real, salva songs.holyrics_song_id IMEDIATAMENTE
//    antes de qualquer verificação.
// 2. Confirmação sem descarte: a verificação GetSongs pós-criação NUNCA descarta o ID retornado pelo CreateSong.
//    Se a listagem local não mostrar a música imediatamente (cache/latência do Holyrics), registra VERIFYING_CREATED_SONG
//    e CONTINUA o fluxo para a playlist utilizando o ID recebido. Nunca marca ERROR nem mensagem de permissões nesse caso.
// 3. Reconciliação em timeout/falha de CreateSong: antes de qualquer nova tentativa, consulta GetSongs com normalização
//    estrita (normalizeTitle/normalizeArtist). Se a música já existir, salva o ID e continua para a playlist. Se não existir,
//    reporta erro técnico real da etapa. Nunca repete CreateSong cegamente.
// 4. Exclusão mútua / Lock por church_id + song_id: impede dois cliques simultâneos de criarem músicas duplicadas.
// 5. Playlist: GetSongPlaylist compara exclusivamente por ID (nunca por título). Se já estiver -> ALREADY_IN_PLAYLIST.
//    Se ausente -> AddLyricsToPlaylist com index (posição no repertório do evento, base 0) e payload mínimo.
//    Depois consulta GetSongPlaylist novamente: só marca ADDED_TO_PLAYLIST se o ID aparecer; se não aparecer -> ERROR
//    com mensagem técnica real: "AddLyricsToPlaylist retornou OK, mas a música não foi localizada na playlist após a confirmação."
// 6. Payloads mínimos à API do Holyrics em tudo (evita bugs de lista vazia no Holyrics).
// 7. Registro diagnóstico detalhado em holyrics_sync_logs com command_id, duração, http_status, stage, status e details sanitizados.

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/sync-event',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const eventId = String(body.event_id || '').trim()
    let agentId = String(body.agent_id || '').trim()

    if (!churchId || !eventId) {
      return e.json(400, {
        success: false,
        message: 'church_id e event_id são obrigatórios.',
      })
    }

    // 1. Validação estrita de permissão holyrics.sync
    // Master sempre pode; Admin e Líder podem; Músico NÃO PODE -> 403
    try {
      const memberships = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: authRecord.id },
      )
      if (memberships.length === 0) {
        return e.json(403, {
          success: false,
          error_code: 'NOT_A_MEMBER',
          message: 'Acesso negado a esta congregação.',
        })
      }
      const role = memberships[0].getString('role')
      if (role === 'MUSICO') {
        return e.json(403, {
          success: false,
          error_code: 'INSUFFICIENT_PERMISSIONS',
          message:
            'Apenas Administradores e Líderes possuem permissão para sincronizar com o Holyrics (holyrics.sync). Músicos não possuem autorização.',
        })
      }
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Erro ao validar autorização: ' + err.message,
      })
    }

    // 2. Validação do Evento e isolamento multi-tenant
    let eventRecord = null
    try {
      eventRecord = $app.findRecordById('events', eventId)
    } catch (_) {
      return e.json(404, {
        success: false,
        error_code: 'EVENT_NOT_FOUND',
        message: 'Culto/evento não encontrado no LouvorFlow.',
      })
    }

    if (eventRecord.getString('church_id') !== churchId) {
      return e.json(403, {
        success: false,
        error_code: 'MULTI_TENANT_VIOLATION',
        message: 'O culto informado pertence a outra congregação.',
      })
    }

    // 3. Validação do Agent do Holyrics
    const nowTime = new Date().getTime()
    if (!agentId) {
      try {
        const agents = $app.findRecordsByFilter(
          'holyrics_agents',
          'church_id = {:churchId}',
          '-last_seen_at',
          10,
          0,
          { churchId: churchId },
        )
        for (let i = 0; i < agents.length; i++) {
          const a = agents[i]
          const ls = a.getString('last_seen_at')
          if (ls && nowTime - new Date(ls).getTime() <= 45 * 1000 && a.getString('paired_at')) {
            agentId = a.id
            break
          }
        }
      } catch (_) {}
    }

    if (!agentId) {
      return e.json(200, {
        success: false,
        agent_online: false,
        error_code: 'NO_ACTIVE_AGENT',
        message:
          'Não foi possível conectar ao Holyrics. Verifique: Agent conectado • Holyrics aberto • API Server ativo • Token válido.',
      })
    }

    let agentRecord = null
    try {
      agentRecord = $app.findRecordById('holyrics_agents', agentId)
    } catch (_) {
      return e.json(404, {
        success: false,
        error_code: 'AGENT_NOT_FOUND',
        message: 'Agente selecionado não encontrado.',
      })
    }

    if (agentRecord.getString('church_id') !== churchId) {
      return e.json(403, {
        success: false,
        error_code: 'MULTI_TENANT_VIOLATION',
        message: 'Agente pertence a outra congregação.',
      })
    }

    const lastSeenStr = agentRecord.getString('last_seen_at')
    const isOnline = lastSeenStr && nowTime - new Date(lastSeenStr).getTime() <= 45 * 1000
    if (!isOnline) {
      return e.json(200, {
        success: false,
        agent_online: false,
        error_code: 'AGENT_OFFLINE',
        message:
          'Não foi possível conectar ao Holyrics. Verifique: Agent conectado • Holyrics aberto • API Server ativo • Token válido.',
      })
    }

    if (!agentRecord.getBool('holyrics_detected')) {
      return e.json(200, {
        success: false,
        agent_online: true,
        holyrics_detected: false,
        error_code: 'HOLYRICS_NOT_DETECTED',
        message:
          'Não foi possível conectar ao Holyrics. Verifique: Agent conectado • Holyrics aberto • API Server ativo • Token válido.',
      })
    }

    // 4. Busca músicas do evento na ordem exata (order ASC)
    let eventSongRecords = []
    try {
      eventSongRecords = $app.findRecordsByFilter(
        'event_songs',
        'event_id = {:eventId} && church_id = {:churchId}',
        'order',
        200,
        0,
        { eventId: eventId, churchId: churchId },
      )
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Erro ao carregar repertório do evento: ' + err.message,
      })
    }

    if (eventSongRecords.length === 0) {
      return e.json(200, {
        success: true,
        items: [],
        summary: {
          total: 0,
          created: 0,
          already_existed: 0,
          added: 0,
          already_in_playlist: 0,
          errors: 0,
        },
        message: 'O repertório deste culto está vazio. Nenhuma música para sincronizar.',
      })
    }

    const cmdCol = $app.findCollectionByNameOrId('holyrics_commands')
    const syncLogsCol = $app.findCollectionByNameOrId('holyrics_sync_logs')

    // Helper para decodificar Goja byte arrays UTF-8 multibyte
    // PocketBase v0.36 (Goja) retorna campos JSON como arrays de bytes numéricos UTF-8.
    // Bytes com bit 7 ativo (>= 0x80) são sequências multibyte UTF-8 e devem ser
    // decodificados em pontos de código Unicode completos (sem transformar em Latin-1).
    const decodeUtf8Bytes = (bytes) => {
      if (!Array.isArray(bytes) || bytes.length === 0) return ''
      let out = ''
      let i = 0
      const len = bytes.length
      while (i < len) {
        const c = bytes[i++] & 0xff
        if (c <= 0x7f) {
          // 1 byte: ASCII (0x00 - 0x7F)
          out += String.fromCharCode(c)
        } else if ((c & 0xe0) === 0xc0) {
          // 2 bytes: 110xxxxx 10xxxxxx (U+0080 - U+07FF)
          if (i < len) {
            const c2 = bytes[i++] & 0xff
            const cp = ((c & 0x1f) << 6) | (c2 & 0x3f)
            out += String.fromCharCode(cp)
          } else {
            out += String.fromCharCode(c)
          }
        } else if ((c & 0xf0) === 0xe0) {
          // 3 bytes: 1110xxxx 10xxxxxx 10xxxxxx (U+0800 - U+FFFF)
          if (i + 1 < len) {
            const c2 = bytes[i++] & 0xff
            const c3 = bytes[i++] & 0xff
            const cp = ((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f)
            out += String.fromCharCode(cp)
          } else {
            out += String.fromCharCode(c)
          }
        } else if ((c & 0xf8) === 0xf0) {
          // 4 bytes: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx (U+10000 - U+10FFFF)
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
          // Byte de continuação isolado ou inválido
          out += String.fromCharCode(c)
        }
      }
      return out
    }

    // Helper interno para executar comando e aguardar resposta até timeout (polling ativo no servidor)
    const runCommandSync = (action, payload, maxWaitMs) => {
      const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
      const cmdId =
        'cmd_' + action.toLowerCase() + '_' + Date.now() + '_' + $security.randomString(8)
      const cmd = new Record(cmdCol)
      cmd.set('command_id', cmdId)
      cmd.set('church_id', churchId)
      cmd.set('agent_id', agentId)
      cmd.set('action', action)
      cmd.set('payload', payload)
      cmd.set('status', 'PENDING')
      cmd.set('created_at', nowIso)
      $app.save(cmd)

      const start = Date.now()
      let finalStatus = 'PENDING'
      let finalResult = null
      let finalError = ''

      while (Date.now() - start < maxWaitMs) {
        try {
          const check = $app.findRecordById('holyrics_commands', cmd.id)
          const st = check.getString('status')
          if (st === 'DONE' || st === 'FAILED') {
            finalStatus = st
            try {
              const r = check.get('result')
              if (typeof r === 'string') {
                finalResult = JSON.parse(r)
              } else if (Array.isArray(r)) {
                const s = decodeUtf8Bytes(r)
                finalResult = JSON.parse(s)
              } else {
                finalResult = r
              }
            } catch (_) {
              // Em caso de falha de parsing, mantém o valor original ou null sem quebrar a execução
              finalResult = check.get('result')
            }
            finalError = check.getString('error')
            break
          }
        } catch (_) {}
        for (let k = 0; k < 60; k++) {
          $security.randomString(5)
        }
      }

      const durationMs = Date.now() - start

      return {
        command_id: cmdId,
        status: finalStatus,
        result: finalResult,
        error: finalError,
        duration_ms: durationMs,
      }
    }

    // Helper para extração polimórfica e sanitizada do ID do Holyrics retornado
    const extractHolyricsSongId = (rawResult) => {
      if (!rawResult) return ''
      let result = rawResult

      // Se vier como byte-array Goja não decodificado previamente
      if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'number') {
        try {
          const s = decodeUtf8Bytes(result)
          result = JSON.parse(s)
        } catch (_) {}
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
          } catch (_) {}
        }
      }

      // Caso ainda seja string após tentar parse, pode ser o próprio ID cru
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

    // Helper para gravar log detalhado de auditoria e diagnóstico em holyrics_sync_logs
    const recordSyncLog = (logData) => {
      try {
        const logRec = new Record(syncLogsCol)
        const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
        logRec.set('church_id', churchId)
        logRec.set('agent_id', agentId)
        if (logData.event_id) logRec.set('event_id', logData.event_id)
        if (logData.song_id) logRec.set('song_id', logData.song_id)
        if (logData.holyrics_song_id)
          logRec.set('holyrics_song_id', String(logData.holyrics_song_id))
        logRec.set('action', logData.action || 'SYNC')
        logRec.set('status', logData.status === 'ERROR' ? 'ERROR' : 'SUCCESS')
        if (logData.error) logRec.set('error', String(logData.error).substring(0, 2000))
        logRec.set('created_at', nowIso)

        if (logData.command_id) logRec.set('command_id', logData.command_id)
        if (logData.song_title) logRec.set('song_title', logData.song_title)
        if (logData.duration_ms !== undefined) logRec.set('duration_ms', logData.duration_ms)
        if (logData.http_status !== undefined) logRec.set('http_status', logData.http_status)
        if (logData.stage) logRec.set('stage', logData.stage)
        if (logData.details) logRec.set('details', logData.details)

        $app.save(logRec)
      } catch (err) {
        console.log('[HOLYRICS_SYNC_LOG_ERR]', err.message)
      }
    }

    // Normalização estrita para comparação de títulos e artistas
    // Remove pontuações, acentos, múltiplos espaços, lowercase
    const normalizeString = (str) => {
      if (!str) return ''
      let s = String(str).toLowerCase().trim()
      const from = 'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ'
      const to = 'aaaaaaeceeeeiiiidnoooooouuuuypy'
      for (let i = 0; i < from.length; i++) {
        s = s.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
      }
      s = s.replace(/[^a-z0-9\s]/g, ' ')
      s = s.replace(/\s+/g, ' ').trim()
      return s
    }

    // Consulta acervo GetSongs do Holyrics
    let holyricsLibraryCache = null
    const fetchHolyricsLibrary = () => {
      const getSongsCmdRes = runCommandSync(
        'GET_SONGS',
        {
          fields: 'id,title,artist,author,key,bpm,time_sig,groups,archived',
        },
        10000,
      )
      if (getSongsCmdRes.status === 'DONE' && getSongsCmdRes.result) {
        let resData = getSongsCmdRes.result
        if (typeof resData === 'string') {
          try {
            resData = JSON.parse(resData)
          } catch (_) {}
        } else if (Array.isArray(resData) && resData.length > 0 && typeof resData[0] === 'number') {
          try {
            const s = decodeUtf8Bytes(resData)
            resData = JSON.parse(s)
          } catch (_) {}
        }

        const list = Array.isArray(resData?.songs)
          ? resData.songs
          : Array.isArray(resData)
            ? resData
            : []
        holyricsLibraryCache = list
        return list
      }
      return null
    }

    // Consulta GetSongPlaylist
    const fetchHolyricsPlaylist = () => {
      const playlistCmdRes = runCommandSync(
        'GET_SONG_PLAYLIST',
        { church_id: churchId, agent_id: agentId, event_id: eventId },
        8000,
      )
      if (playlistCmdRes.status === 'DONE' && playlistCmdRes.result) {
        let resData = playlistCmdRes.result
        if (typeof resData === 'string') {
          try {
            resData = JSON.parse(resData)
          } catch (_) {}
        } else if (Array.isArray(resData) && resData.length > 0 && typeof resData[0] === 'number') {
          try {
            const s = decodeUtf8Bytes(resData)
            resData = JSON.parse(s)
          } catch (_) {}
        }

        const pItems = Array.isArray(resData?.items)
          ? resData.items
          : Array.isArray(resData)
            ? resData
            : []
        return pItems
      }
      return null
    }

    // Busca inicial da playlist
    let currentPlaylistItems = fetchHolyricsPlaylist() || []
    const buildPlaylistIdMap = (items) => {
      const map = {}
      for (let pIdx = 0; pIdx < items.length; pIdx++) {
        const item = items[pIdx]
        const pId = String(item.id || item.song_id || item.songId || '')
        if (pId) {
          map[pId] = true
        }
      }
      return map
    }
    let currentPlaylistMap = buildPlaylistIdMap(currentPlaylistItems)

    const results = []
    let countCreated = 0
    let countAlreadyExisted = 0
    let countAdded = 0
    let countAlreadyInPlaylist = 0
    let countErrors = 0

    // -------------------------------------------------------------------------
    // PARSER MUSICAL DETERMINÍSTICO PARA GERAÇÃO DE SLIDES NO HOLYRICS (CreateSong)
    // Regras A (Somente Letra), B (2 versos por slide) e C (UTF-8 fiel de ponta a ponta)
    // -------------------------------------------------------------------------

    const SECTION_PATTERNS = [
      'INTRO',
      'INTRODUÇÃO',
      'INTRODUCAO',
      'VERSO',
      'ESTROFE',
      'PRIMEIRA PARTE',
      'SEGUNDA PARTE',
      'TERCEIRA PARTE',
      'QUARTA PARTE',
      'PARTE',
      'PRÉ-REFRÃO',
      'PRE-REFRAO',
      'PRÉ REFRÃO',
      'PRE REFRAO',
      'PRÉ REFRÃO 1',
      'PRÉ REFRÃO 2',
      'REFRÃO',
      'REFRAO',
      'CORO',
      'PONTE',
      'INTERLÚDIO',
      'INTERLUDIO',
      'INSTRUMENTAL',
      'SOLO',
      'TAG',
      'BREAK',
      'FINAL',
      'OUTRO',
      'FIM',
    ]

    // Detecta se a linha é um cabeçalho/marcador de seção (ex: ##(VERSO 1), [Primeira Parte], [Refrão], CORO:)
    // Retorna o nome normalizado e limpo da seção (ex: "VERSO 1", "PRIMEIRA PARTE", "REFRÃO") ou null
    const detectSectionHeader = (line) => {
      if (!line) return null
      const raw = String(line).trim()
      if (!raw) return null

      // Remove hashes múltiplos, colchetes, parênteses, chaves, asteriscos, traços e espaços ao redor
      let clean = raw
        .replace(/^[\s#*=\-_\\[\](){}]+|[\s#*=\-_\\[\](){}]+$/g, '')
        .replace(/^[\s#*=\-_\\[\](){}]+|[\s#*=\-_\\[\](){}]+$/g, '')
        .replace(/:+$/, '')
        .trim()
        .toUpperCase()

      // Trata caso onde restou parênteses internos, ex: "(VERSO 1)" -> "VERSO 1"
      clean = clean.replace(/^[([<{]+|[)\]>}]+$/g, '').trim()

      if (!clean) return null

      // Verifica correspondência exata ou inicial com marcadores conhecidos
      for (let m = 0; m < SECTION_PATTERNS.length; m++) {
        const p = SECTION_PATTERNS[m]
        if (
          clean === p ||
          clean.startsWith(p + ' ') ||
          clean.startsWith(p + ':') ||
          clean.startsWith(p + '-')
        ) {
          return clean
        }
      }

      return null
    }

    // Validação contextual de token de acorde musical
    const isStrictChordToken = (token) => {
      if (!token) return false
      const clean = String(token)
        .replace(/^[([<{]+|[)\]>},;.:]+$/g, '')
        .trim()
      if (!clean) return false

      // Palavras legítimas da língua portuguesa que NUNCA devem ser tratadas como acorde isolado
      const portugueseWords = {
        A: true,
        E: true,
        O: true,
        AS: true,
        OS: true,
        DO: true,
        DA: true,
        DOS: true,
        DAS: true,
        NO: true,
        NA: true,
        NOS: true,
        NAS: true,
        EM: true,
        DE: true,
        SE: true,
        EU: true,
        TU: true,
        ELE: true,
        ELA: true,
        ME: true,
        TE: true,
        AO: true,
        AOS: true,
        PRA: true,
        PRO: true,
        POR: true,
        SEM: true,
        COM: true,
        SIM: true,
        NAO: true,
        NÃO: true,
        QUE: true,
        QUEM: true,
        QUAL: true,
        FOI: true,
        SOU: true,
        ERA: true,
        SER: true,
        TER: true,
        VER: true,
        VEM: true,
        VAI: true,
        PAI: true,
        MAI: true,
        REI: true,
        LEI: true,
        DÓ: true,
        RÉ: true,
        MÍ: true,
        FÁ: true,
        SÓL: true,
        LÁ: true,
        SÍ: true,
        DOM: true,
      }

      if (portugueseWords[clean.toUpperCase()]) {
        return false
      }

      // Trata acordes com baixo invertido: C/E, D/F#, G/B
      if (clean.includes('/')) {
        const parts = clean.split('/')
        if (parts.length === 2) {
          const main = parts[0].trim()
          const bass = parts[1].trim()
          return isStrictChordToken(main) && /^[A-G][#b]?$/i.test(bass)
        }
      }

      // Regex para padrão de acorde harmônico (ex: C, D, Em, F#m, G7, BbM7, C9, Dsus4, Am7(b5), F#7(11), E/G#)
      const chordRegex =
        /^[A-G][#b]?(m|min|maj|M|dim|aug|sus[24]?|add[0-9]+|[0-9]+|b[0-9]+|#[0-9]+|[ø°+*∆])*(?:\([^)]+\))?$/
      return chordRegex.test(clean)
    }

    // Linha dedicada de acordes (estilo Cifra Club sobre a letra)
    const isChordOnlyLine = (line) => {
      if (!line) return false
      const trimmed = String(line).trim()
      if (!trimmed) return false

      // Remove colchetes de acordes inline
      const cleanLine = trimmed.replace(/\[[^\]]+\]/g, ' ')
      const tokens = cleanLine.split(/\s+/).filter(Boolean)
      if (tokens.length === 0) return false

      let chordCount = 0
      for (let t = 0; t < tokens.length; t++) {
        if (isStrictChordToken(tokens[t])) {
          chordCount++
        }
      }

      // Se 50% ou mais dos tokens forem acordes, ou se houver pelo menos 1 acorde e nenhum outro caractere for texto alfabético comum longo
      if (chordCount / tokens.length >= 0.5) return true

      return false
    }

    // Limpeza de acordes inline mantendo letras e pontuação intactas
    const stripChordsFromLine = (line) => {
      if (!line) return ''
      let s = String(line)

      // 1. Remove acordes entre colchetes [C#m], [E/G#], [F#7(11)]
      s = s.replace(/\[([A-G][#b]?[^\]]*)\]/g, (match, inner) => {
        if (detectSectionHeader(inner)) {
          return '' // Seção dentro de colchetes é tratada separadamente
        }
        return ''
      })

      // 2. Remove acordes isolados entre parênteses se forem estritamente acordes: (C#m), (E/G#), (B4)
      s = s.replace(/\(([A-G][#b]?[^)]*)\)/g, (match, inner) => {
        if (isStrictChordToken(inner)) {
          return ''
        }
        return match // Mantém texto vocal legítimo entre parênteses ex: "(confiarei)"
      })

      // 3. Normaliza espaços múltiplos
      s = s.replace(/[ \t]{2,}/g, ' ').trim()
      return s
    }

    // Gera os slides estruturados respeitando seções, 2 versos por slide e formato do Holyrics
    const generateHolyricsSlides = (songRec, songTitle) => {
      // Regra A: preferencialmente songs.lyrics limpo
      const storedLyrics = songRec.getString('lyrics')
      const storedRawContent = songRec.getString('raw_content')
      const storedChords = songRec.getString('chords')

      let sourceText = storedLyrics && storedLyrics.trim() ? storedLyrics : ''
      const isFromCifraSource = !sourceText

      if (!sourceText) {
        sourceText =
          (storedRawContent && storedRawContent.trim()) ||
          (storedChords && storedChords.trim()) ||
          ''
      }

      const rawLines = sourceText.split(/\r?\n/)
      const sections = [] // Array de { name, lines: [] }

      let currentSec = { name: 'VERSO 1', lines: [] }
      let hasCustomHeader = false

      for (let li = 0; li < rawLines.length; li++) {
        const line = rawLines[li]
        const trimmed = line.trim()
        if (!trimmed) continue

        const headerFound = detectSectionHeader(trimmed)
        if (headerFound) {
          if (currentSec.lines.length > 0) {
            sections.push(currentSec)
          }
          currentSec = { name: headerFound, lines: [] }
          hasCustomHeader = true
          continue
        }

        // Se veio de fonte com cifras (raw_content ou chords) ou texto com cifras embutidas:
        // descarta linha exclusiva de acordes
        if (isChordOnlyLine(trimmed)) {
          continue
        }

        // Limpa acordes inline da linha
        const cleanedLine = stripChordsFromLine(line)
        if (cleanedLine) {
          currentSec.lines.push(cleanedLine)
        }
      }

      if (currentSec.lines.length > 0) {
        sections.push(currentSec)
      }

      // Regra B: Agrupar de 2 em 2 versos dentro de cada seção
      const slides = []
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si]
        const secName = sec.name || 'VERSO 1'
        const secLines = sec.lines

        for (let l = 0; l < secLines.length; l += 2) {
          const chunk = secLines.slice(l, l + 2)
          const slideText = chunk.join('\n').trim()
          if (slideText) {
            slides.push({
              text: slideText,
              slide_description: secName,
            })
          }
        }
      }

      // Fallback seguro caso não haja linhas válidas extraídas
      if (slides.length === 0) {
        slides.push({
          text: songTitle,
          slide_description: 'VERSO 1',
        })
      }

      let orderStr = ''
      for (let sIdx = 0; sIdx < slides.length; sIdx++) {
        orderStr += (sIdx > 0 ? ',' : '') + (sIdx + 1)
      }

      return { slides, orderStr }
    }

    // Lock de exclusão mútua em memória por congregação + música
    if (!globalThis.__louvorflow_sync_locks) {
      globalThis.__louvorflow_sync_locks = {}
    }

    for (let i = 0; i < eventSongRecords.length; i++) {
      const songStartTime = Date.now()
      const eventSongRec = eventSongRecords[i]
      const repertoireOrder = eventSongRec.getInt('order') || i + 1
      const playlistIndexBase0 = i // Posição base 0 no repertório do evento para AddLyricsToPlaylist
      const songId = eventSongRec.getString('song_id')

      let songRec = null
      try {
        songRec = $app.findRecordById('songs', songId)
      } catch (_) {
        eventSongRec.set('holyrics_status', 'ERROR')
        eventSongRec.set('holyrics_error', 'Música excluída ou não encontrada no LouvorFlow')
        try {
          $app.save(eventSongRec)
        } catch (_) {}
        countErrors++
        results.push({
          order: repertoireOrder,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: 'Música não encontrada',
          action: 'NOT_FOUND',
          status: 'ERROR',
          detail: '✕ Falha na sincronização / Música não encontrada no LouvorFlow',
        })
        continue
      }

      const songTitle = songRec.getString('title')
      const songArtist = songRec.getString('artist')
      const songComposer = songRec.getString('composer')
      const songKey = songRec.getString('key')
      const songBpm = songRec.getInt('bpm')
      const songNotes = songRec.getString('notes')

      // Constrói slides determinísticos para CreateSong caso necessário
      const { slides, orderStr } = generateHolyricsSlides(songRec, songTitle)

      // Re-lê songRec para pegar estado mais recente de holyrics_song_id
      try {
        songRec = $app.findRecordById('songs', songId)
      } catch (_) {}

      let holyricsSongId = songRec.getString('holyrics_song_id')
      let songWasCreatedNow = false
      let songStatusLabel = ''
      let logSteps = []

      // -------------------------------------------------------------
      // EXCLUSÃO MÚTUA / LOCK POR CHURCH_ID + SONG_ID
      // Garante que dois cliques simultâneos não possam gerar dois CreateSong
      // -------------------------------------------------------------
      const songLockKey = churchId + '::' + songId
      const lockStartTime = Date.now()
      while (
        globalThis.__louvorflow_sync_locks[songLockKey] &&
        Date.now() - lockStartTime < 15000
      ) {
        // Aguarda liberação da operação em andamento
        for (let k = 0; k < 60; k++) {
          $security.randomString(5)
        }
      }
      globalThis.__louvorflow_sync_locks[songLockKey] = Date.now()

      try {
        // Atualiza songRec após aguardar lock
        try {
          songRec = $app.findRecordById('songs', songId)
          holyricsSongId = songRec.getString('holyrics_song_id')
        } catch (_) {}

        // -------------------------------------------------------------
        // ETAPA 1 & 2: Localização segura da música (Zero Duplicação)
        // Validação ativa do acervo: se holyrics_song_id existe, confirma via GetSongs.
        // Se ausente no acervo, o vínculo é considerado obsoleto e a música é recriada.
        // -------------------------------------------------------------
        let isIdValidInLibrary = false
        let isRecreatedObsolete = false

        if (holyricsSongId) {
          eventSongRec.set('holyrics_status', 'CHECKING')
          try {
            $app.save(eventSongRec)
          } catch (_) {}

          if (!holyricsLibraryCache) {
            fetchHolyricsLibrary()
          }

          // Se a consulta GetSongs falhar (timeout, agent offline, erro de rede):
          // NUNCA apagar o vínculo e NUNCA criar outra música com base em consulta inconclusiva!
          if (holyricsLibraryCache === null) {
            const getSongsErrorMsg =
              'Falha ao consultar o acervo do Holyrics (GetSongs). Verifique se o LouvorFlow Agent está conectado e se o Holyrics está aberto com o API Server ativo.'
            eventSongRec.set('holyrics_status', 'ERROR')
            eventSongRec.set('holyrics_error', getSongsErrorMsg)
            try {
              $app.save(eventSongRec)
            } catch (_) {}
            countErrors++

            logSteps.push(`GetSongs → FAILED_INCONCLUSIVE | Kept persisted ID #${holyricsSongId}`)
            recordSyncLog({
              event_id: eventId,
              song_id: songId,
              holyrics_song_id: holyricsSongId,
              song_title: songTitle,
              action: 'GET_SONGS',
              stage: 'VERIFY_EXISTING_ID_FAILED',
              status: 'ERROR',
              error: getSongsErrorMsg,
              duration_ms: Date.now() - songStartTime,
            })

            results.push({
              order: repertoireOrder,
              event_song_id: eventSongRec.id,
              song_id: songId,
              song_title: songTitle,
              holyrics_song_id: holyricsSongId,
              action: 'CHECK_LIBRARY',
              status: 'ERROR',
              error: getSongsErrorMsg,
              detail: `✕ Falha ao consultar o acervo do Holyrics / Etapa: GetSongs / ${getSongsErrorMsg}`,
            })
            continue
          }

          // Consulta GetSongs bem-sucedida: procura correspondência EXATA pelo ID salvo
          const library = holyricsLibraryCache || []
          const exactMatch = library.find((it) => String(it.id).trim() === holyricsSongId)

          if (exactMatch) {
            // ID confirmado no acervo! Reutiliza com segurança total sem recriar
            isIdValidInLibrary = true
            songStatusLabel = `✓ Música já existente no Holyrics / Holyrics #${holyricsSongId}`
            countAlreadyExisted++
            logSteps.push(
              `Holyrics ID: ${holyricsSongId} (verified in GetSongs) | CreateSong → SKIPPED`,
            )
          } else {
            // ID salvo AUSENTE no acervo do Holyrics (música foi excluída manualmente do Holyrics)
            // Considera vínculo obsoleto e inicia fluxo de recriação
            isRecreatedObsolete = true
            logSteps.push(
              `Holyrics ID: ${holyricsSongId} (OBSOLETE - not found in GetSongs) | Recreating song`,
            )
            holyricsSongId = ''
          }
        }

        if (!isIdValidInLibrary) {
          // songs.holyrics_song_id não existia ou vínculo estava obsoleto
          eventSongRec.set('holyrics_status', 'CHECKING')
          try {
            $app.save(eventSongRec)
          } catch (_) {}

          if (!holyricsLibraryCache) {
            fetchHolyricsLibrary()
          }

          // Se a biblioteca não pôde ser consultada de forma conclusiva
          if (holyricsLibraryCache === null) {
            const getSongsErrorMsg =
              'Falha ao consultar o acervo do Holyrics (GetSongs). Verifique se o LouvorFlow Agent está conectado e se o Holyrics está aberto com o API Server ativo.'
            eventSongRec.set('holyrics_status', 'ERROR')
            eventSongRec.set('holyrics_error', getSongsErrorMsg)
            try {
              $app.save(eventSongRec)
            } catch (_) {}
            countErrors++

            logSteps.push(`GetSongs → FAILED_INCONCLUSIVE | CreateSong → ABORTED`)
            recordSyncLog({
              event_id: eventId,
              song_id: songId,
              song_title: songTitle,
              action: 'GET_SONGS',
              stage: 'LIBRARY_INCONCLUSIVE',
              status: 'ERROR',
              error: getSongsErrorMsg,
              duration_ms: Date.now() - songStartTime,
            })

            results.push({
              order: repertoireOrder,
              event_song_id: eventSongRec.id,
              song_id: songId,
              song_title: songTitle,
              holyrics_song_id: null,
              action: 'CHECK_LIBRARY',
              status: 'ERROR',
              error: getSongsErrorMsg,
              detail: `✕ Falha ao consultar o acervo do Holyrics / Etapa: GetSongs / ${getSongsErrorMsg}`,
            })
            continue
          }

          const library = holyricsLibraryCache || []

          const normTargetTitle = normalizeString(songTitle)
          const normTargetArtist = normalizeString(songArtist)

          let matchedItem = null

          // Comparação de correspondência segura por título + artista
          for (let mIdx = 0; mIdx < library.length; mIdx++) {
            const item = library[mIdx]
            const normItemTitle = normalizeString(item.title)
            if (normItemTitle === normTargetTitle) {
              if (normTargetArtist) {
                const normItemArtist = normalizeString(item.artist || item.author)
                if (!normItemArtist || normItemArtist === normTargetArtist) {
                  matchedItem = item
                  break
                }
              } else {
                matchedItem = item
                break
              }
            }
          }

          if (matchedItem && matchedItem.id) {
            // Encontrada no acervo! Salva ID imediatamente e NÃO chama CreateSong
            holyricsSongId = String(matchedItem.id).trim()
            songRec.set('holyrics_song_id', holyricsSongId)
            try {
              $app.save(songRec)
            } catch (_) {}
            countAlreadyExisted++
            songStatusLabel = `✓ Música já existente no Holyrics / Holyrics #${holyricsSongId}`
            logSteps.push(`GetSongs → FOUND (#${holyricsSongId}) | CreateSong → SKIPPED`)

            recordSyncLog({
              event_id: eventId,
              song_id: songId,
              holyrics_song_id: holyricsSongId,
              song_title: songTitle,
              action: 'GET_SONGS',
              stage: 'MATCH_EXISTING',
              status: 'SUCCESS',
              duration_ms: Date.now() - songStartTime,
              details: { matched_title: matchedItem.title, holyrics_id: holyricsSongId },
            })
          } else {
            // Não encontrada no GetSongs -> CREATE_SONG com payload validado
            logSteps.push(`GetSongs → NOT_FOUND | CreateSong → EXECUTING`)

            eventSongRec.set('holyrics_status', 'CREATING')
            try {
              $app.save(eventSongRec)
            } catch (_) {}

            const createPayload = {
              song_id: songId,
              event_id: eventId,
              title: songTitle,
              artist: songArtist || 'LouvorFlow',
              author: songComposer || songArtist || 'LouvorFlow',
              note: songNotes || 'Criada pela integração LouvorFlow',
              copyright: '',
              slides: slides,
              formatting_type: 'basic',
              order: orderStr,
            }
            if (songKey) createPayload.key = songKey
            if (songBpm) createPayload.bpm = songBpm

            const createRes = runCommandSync('CREATE_SONG', createPayload, 12000)
            const rawReturnedId = extractHolyricsSongId(createRes.result)

            // REGRA CRÍTICA (i): Se CreateSong retornou DONE com ID, salvar songs.holyrics_song_id
            // IMEDIATAMENTE antes de qualquer verificação!
            if (createRes.status === 'DONE' && rawReturnedId) {
              holyricsSongId = rawReturnedId
              songRec.set('holyrics_song_id', holyricsSongId)
              try {
                $app.save(songRec)
              } catch (_) {}
            }

            // REGRA CRÍTICA (ii): Verificação via GetSongs
            // A confirmação NUNCA deve descartar um ID retornado com sucesso.
            const refreshedLibrary = fetchHolyricsLibrary() || []
            let appearsInLibrary = false

            if (holyricsSongId) {
              appearsInLibrary = refreshedLibrary.some(
                (it) => String(it.id).trim() === holyricsSongId,
              )
            }

            // Se CreateSong falhou/timeout ou não retornou ID: consulta GetSongs ANTES de qualquer decisão
            if (!holyricsSongId) {
              for (let cIdx = 0; cIdx < refreshedLibrary.length; cIdx++) {
                const it = refreshedLibrary[cIdx]
                if (normalizeString(it.title) === normTargetTitle) {
                  holyricsSongId = String(it.id).trim()
                  appearsInLibrary = true
                  songRec.set('holyrics_song_id', holyricsSongId)
                  try {
                    $app.save(songRec)
                  } catch (_) {}
                  break
                }
              }
            }

            if (holyricsSongId) {
              // Música foi criada ou identificada!
              songWasCreatedNow = true
              countCreated++

              if (appearsInLibrary) {
                eventSongRec.set('holyrics_status', 'CREATED')
                songStatusLabel = isRecreatedObsolete
                  ? `✓ Música recriada no Holyrics porque o vínculo anterior estava obsoleto / Holyrics #${holyricsSongId}`
                  : `✓ Música criada no Holyrics / Holyrics #${holyricsSongId}`
                logSteps.push(
                  `CreateSong → OK | GetSongs Confirm → CONFIRMED (#${holyricsSongId})${isRecreatedObsolete ? ' (recreated obsolete)' : ''}`,
                )
              } else {
                // A música foi criada (tem ID retornado), mas a listagem do Holyrics tem latência
                // REGRA: registrar VERIFYING_CREATED_SONG e CONTINUAR o fluxo para a playlist usando o ID retornado.
                // Nunca marcar ERROR nem exibir mensagem de permissões!
                eventSongRec.set('holyrics_status', 'VERIFYING_CREATED_SONG')
                songStatusLabel = isRecreatedObsolete
                  ? `✓ Música recriada no Holyrics porque o vínculo anterior estava obsoleto / Holyrics #${holyricsSongId} (verificação local pendente)`
                  : `✓ Música criada no Holyrics / Holyrics #${holyricsSongId} (verificação local pendente)`
                logSteps.push(
                  `CreateSong → OK (#${holyricsSongId}) | GetSongs Confirm → PENDING_VERIFICATION | Proceeding to playlist${isRecreatedObsolete ? ' (recreated obsolete)' : ''}`,
                )
              }

              try {
                $app.save(eventSongRec)
              } catch (_) {}

              recordSyncLog({
                command_id: createRes.command_id,
                event_id: eventId,
                song_id: songId,
                holyrics_song_id: holyricsSongId,
                song_title: songTitle,
                action: 'CREATE_SONG',
                stage: appearsInLibrary ? 'CONFIRMED' : 'PENDING_VERIFICATION',
                status: 'SUCCESS',
                duration_ms: createRes.duration_ms,
                details: { appears_in_library: appearsInLibrary, id: holyricsSongId },
              })
            } else {
              // Falha real comprovada de criação (nem CreateSong deu ID, nem GetSongs encontrou)
              const technicalErrorMsg =
                createRes.error ||
                (createRes.status === 'PENDING'
                  ? 'Tempo limite de resposta do LouvorFlow Agent esgotado na criação (TIMEOUT).'
                  : 'Falha na resposta do comando CreateSong no Holyrics.')

              eventSongRec.set('holyrics_status', 'ERROR')
              eventSongRec.set('holyrics_error', technicalErrorMsg)
              try {
                $app.save(eventSongRec)
              } catch (_) {}
              countErrors++
              logSteps.push(
                `CreateSong → FAILED (${technicalErrorMsg}) | GetSongs Confirm → NOT_FOUND`,
              )
              console.log(
                `[HOLYRICS_SYNC] Song: ${songTitle} | LouvorFlow ID: ${songId} | Order: ${repertoireOrder}\n${logSteps.join(' | ')} | FINAL → ERROR`,
              )

              recordSyncLog({
                command_id: createRes.command_id,
                event_id: eventId,
                song_id: songId,
                song_title: songTitle,
                action: 'CREATE_SONG',
                stage: 'FAILED',
                status: 'ERROR',
                error: technicalErrorMsg,
                duration_ms: createRes.duration_ms,
              })

              results.push({
                order: repertoireOrder,
                event_song_id: eventSongRec.id,
                song_id: songId,
                song_title: songTitle,
                holyrics_song_id: null,
                action: 'CREATE_SONG',
                status: 'ERROR',
                error: technicalErrorMsg,
                detail: `✕ Falha na sincronização / Etapa: CreateSong / ${technicalErrorMsg}`,
              })
              continue
            }
          }
        }

        // -------------------------------------------------------------
        // ETAPA 4: Verificar se holyrics_song_id já está na playlist (GetSongPlaylist por ID)
        // -------------------------------------------------------------
        eventSongRec.set('holyrics_status', 'CHECKING_PLAYLIST')
        try {
          $app.save(eventSongRec)
        } catch (_) {}

        // Verifica no mapa atual de IDs
        const alreadyInPlaylist = Boolean(currentPlaylistMap[holyricsSongId])
        const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)

        if (alreadyInPlaylist) {
          countAlreadyInPlaylist++
          eventSongRec.set('holyrics_status', 'ALREADY_IN_PLAYLIST')
          eventSongRec.set('holyrics_synced_at', nowIso)
          eventSongRec.set('holyrics_playlist_order', repertoireOrder)
          eventSongRec.set('holyrics_error', '')
          try {
            $app.save(eventSongRec)
          } catch (_) {}

          logSteps.push(
            `GetSongPlaylist → FOUND (#${holyricsSongId}) | AddLyricsToPlaylist → SKIPPED`,
          )
          const durationSec = ((Date.now() - songStartTime) / 1000).toFixed(1)
          console.log(
            `[HOLYRICS_SYNC] Song: ${songTitle} | LouvorFlow ID: ${songId} | Holyrics ID: ${holyricsSongId} | Order: ${repertoireOrder}\n${logSteps.join(' | ')} | FINAL → ALREADY_IN_PLAYLIST (${durationSec}s)`,
          )

          recordSyncLog({
            event_id: eventId,
            song_id: songId,
            holyrics_song_id: holyricsSongId,
            song_title: songTitle,
            action: 'GET_SONG_PLAYLIST',
            stage: 'ALREADY_IN_PLAYLIST',
            status: 'SUCCESS',
            duration_ms: Date.now() - songStartTime,
            details: { already_in_playlist: true },
          })

          results.push({
            order: repertoireOrder,
            event_song_id: eventSongRec.id,
            song_id: songId,
            song_title: songTitle,
            holyrics_song_id: holyricsSongId,
            action: isRecreatedObsolete
              ? 'RECREATED_AND_ALREADY_IN_PLAYLIST'
              : songWasCreatedNow
                ? 'CREATED_AND_ALREADY_IN_PLAYLIST'
                : 'ALREADY_IN_PLAYLIST',
            status: 'SUCCESS',
            detail: `${songStatusLabel} • ✓ Música já estava na playlist`,
          })
          continue
        }

        // -------------------------------------------------------------
        // ETAPA 5 & 6: ADD_LYRICS_TO_PLAYLIST + Confirmação via GetSongPlaylist
        // Semântica da API oficial: index (posição base 0), payload mínimo.
        // -------------------------------------------------------------
        logSteps.push(
          `GetSongPlaylist → NOT_FOUND | AddLyricsToPlaylist → EXECUTING (index ${playlistIndexBase0})`,
        )
        eventSongRec.set('holyrics_status', 'ADDING_TO_PLAYLIST')
        try {
          $app.save(eventSongRec)
        } catch (_) {}

        // Payload mínimo para evitar inconsistências no API Server do Holyrics
        const addPayload = {
          id: holyricsSongId,
          index: playlistIndexBase0,
          media_playlist: false,
          song_id: songId,
          event_id: eventId,
        }

        const addRes = runCommandSync('ADD_LYRICS_TO_PLAYLIST', addPayload, 10000)

        // REGRA CRÍTICA 6: Executar GetSongPlaylist novamente para confirmação real
        eventSongRec.set('holyrics_status', 'VERIFYING_PLAYLIST')
        try {
          $app.save(eventSongRec)
        } catch (_) {}

        const confirmedPlaylist = fetchHolyricsPlaylist() || []
        const appearsInPlaylist = confirmedPlaylist.some(
          (it) => String(it.id || it.song_id || it.songId || '').trim() === holyricsSongId,
        )

        if (appearsInPlaylist) {
          currentPlaylistMap[holyricsSongId] = true
          countAdded++
          eventSongRec.set('holyrics_status', 'ADDED_TO_PLAYLIST')
          eventSongRec.set('holyrics_synced_at', nowIso)
          eventSongRec.set('holyrics_playlist_order', repertoireOrder)
          eventSongRec.set('holyrics_error', '')
          try {
            $app.save(eventSongRec)
          } catch (_) {}

          logSteps.push(
            `AddLyricsToPlaylist → OK | GetSongPlaylist Confirm → FOUND | FINAL → ADDED_TO_PLAYLIST`,
          )
          const durationSec = ((Date.now() - songStartTime) / 1000).toFixed(1)
          console.log(
            `[HOLYRICS_SYNC] Song: ${songTitle} | LouvorFlow ID: ${songId} | Holyrics ID: ${holyricsSongId} | Order: ${repertoireOrder}\n${logSteps.join(' | ')} (${durationSec}s)`,
          )

          recordSyncLog({
            command_id: addRes.command_id,
            event_id: eventId,
            song_id: songId,
            holyrics_song_id: holyricsSongId,
            song_title: songTitle,
            action: 'ADD_LYRICS_TO_PLAYLIST',
            stage: 'CONFIRMED_IN_PLAYLIST',
            status: 'SUCCESS',
            duration_ms: addRes.duration_ms,
            details: { index: playlistIndexBase0, repertoire_order: repertoireOrder },
          })

          results.push({
            order: repertoireOrder,
            event_song_id: eventSongRec.id,
            song_id: songId,
            song_title: songTitle,
            holyrics_song_id: holyricsSongId,
            action: isRecreatedObsolete
              ? 'RECREATED_AND_ADDED'
              : songWasCreatedNow
                ? 'CREATED_AND_ADDED'
                : 'ADDED_TO_PLAYLIST',
            status: 'SUCCESS',
            detail: `${songStatusLabel} • ✓ Música adicionada à playlist (posição ${repertoireOrder})`,
          })
        } else {
          // O {"status":"ok"} nunca é prova suficiente. Mensagem técnica real exata
          const technicalAddError =
            addRes.status === 'DONE'
              ? 'AddLyricsToPlaylist retornou OK, mas a música não foi localizada na playlist após a confirmação.'
              : addRes.error ||
                (addRes.status === 'PENDING'
                  ? 'Tempo limite de resposta do LouvorFlow Agent esgotado na inserção na playlist (TIMEOUT).'
                  : 'Falha técnica ao adicionar à playlist do Holyrics.')

          eventSongRec.set('holyrics_status', 'ERROR')
          eventSongRec.set('holyrics_error', technicalAddError)
          try {
            $app.save(eventSongRec)
          } catch (_) {}
          countErrors++

          logSteps.push(
            `AddLyricsToPlaylist → ${addRes.status} | GetSongPlaylist Confirm → NOT_FOUND | FINAL → ERROR`,
          )
          console.log(
            `[HOLYRICS_SYNC] Song: ${songTitle} | LouvorFlow ID: ${songId} | Holyrics ID: ${holyricsSongId} | Order: ${repertoireOrder}\n${logSteps.join(' | ')}`,
          )

          recordSyncLog({
            command_id: addRes.command_id,
            event_id: eventId,
            song_id: songId,
            holyrics_song_id: holyricsSongId,
            song_title: songTitle,
            action: 'ADD_LYRICS_TO_PLAYLIST',
            stage: 'FAILED_PLAYLIST_CONFIRMATION',
            status: 'ERROR',
            error: technicalAddError,
            duration_ms: addRes.duration_ms,
          })

          results.push({
            order: repertoireOrder,
            event_song_id: eventSongRec.id,
            song_id: songId,
            song_title: songTitle,
            holyrics_song_id: holyricsSongId,
            action: 'ADD_LYRICS_TO_PLAYLIST',
            status: 'ERROR',
            error: technicalAddError,
            detail: `${songStatusLabel} • ✕ Etapa: AddLyricsToPlaylist — ${technicalAddError}`,
          })
        }
      } finally {
        // Libera lock da música
        delete globalThis.__louvorflow_sync_locks[songLockKey]
      }
    }

    const totalProcessed = eventSongRecords.length
    const isFullSuccess = countErrors === 0

    let summaryMessage = ''
    if (isFullSuccess) {
      summaryMessage = `Sincronização concluída com sucesso! ${totalProcessed} música(s) processada(s): ${countAdded} adicionada(s) à playlist${countAlreadyInPlaylist > 0 ? `, ${countAlreadyInPlaylist} já constava(m) na playlist` : ''}${countCreated > 0 ? `, ${countCreated} criada(s) no Holyrics` : ''}.`
    } else {
      summaryMessage = `Sincronização concluída com avisos — ${totalProcessed} músicas processadas / ${countAdded + countAlreadyInPlaylist} na playlist / ${countErrors} com erro.`
    }

    return e.json(200, {
      success: isFullSuccess,
      has_errors: countErrors > 0,
      event_id: eventId,
      agent_id: agentId,
      items: results,
      summary: {
        total: totalProcessed,
        created: countCreated,
        already_existed: countAlreadyExisted,
        added: countAdded,
        already_in_playlist: countAlreadyInPlaylist,
        errors: countErrors,
      },
      message: summaryMessage,
    })
  },
  $apis.requireAuth(),
)
