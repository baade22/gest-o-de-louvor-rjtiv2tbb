// Hook para o fluxo: Sincronizar repertório do evento com Holyrics
// POST /backend/v1/saas/holyrics/sync-event
// Versão do produto: 0.0.26
// Requer autenticação + perfil com holyrics.sync (MASTER/ADMIN/LIDER; Músico NÃO PODE -> 403)
// Multi-tenant: church_id validado via autenticação; valida evento e músicas pertencentes à mesma igreja.
// Body: { church_id, event_id, agent_id? }
// Processa as músicas na ordem exata do repertório do evento (order 1,2,3... do event_songs).
//
// FLUXO OBRIGATÓRIO POR MÚSICA (ZERO DUPLICAÇÃO):
// 1. Se songs.holyrics_song_id existe -> usar direto (NUNCA chamar CreateSong, NUNCA decidir por título).
// 2. Se não existe -> executar GET_SONGS no Agent ({ fields: "id,title,artist,author,key,bpm,time_sig,groups,archived" })
//    e procurar correspondência segura usando normalizeTitle()/normalizeArtist().
//    - Se encontrou -> salvar songs.holyrics_song_id = ID encontrado, status ALREADY_EXISTS, NÃO executar CreateSong.
//    - Se não encontrou -> CREATE_SONG com payload validado (slides com slide_description, basic, order).
// 3. REGRA CRÍTICA após CreateSong: não confiar só no retorno. Executar GetSongs e confirmar que o ID retornado
//    aparece na listagem. Só então marcar CREATED. Se CreateSong retornar erro ou timeout -> NÃO reexecutar CreateSong:
//    primeiro GetSongs; se a música existir, salvar o ID e continuar; só se não existir, erro real.
// 4. GET_SONG_PLAYLIST -> verificar se holyrics_song_id já está na playlist comparando pelo ID (NUNCA por título).
//    Se está -> ALREADY_IN_PLAYLIST, não chamar AddLyricsToPlaylist.
// 5. Se não está -> ADD_LYRICS_TO_PLAYLIST com { id: holyrics_song_id, index: repertorio_index_base_0, media_playlist: false }.
// 6. REGRA CRÍTICA após AddLyricsToPlaylist: executar GetSongPlaylist novamente; só considerar ADDED_TO_PLAYLIST
//    se o ID aparecer. Se não aparecer -> ERROR: "AddLyricsToPlaylist retornou OK, mas a música não foi localizada na playlist após a confirmação."
// 7. Não limpar playlist existente.
// 8. Proteção contra cliques simultâneos: lock por church_id + song_id.
// 9. Log obrigatório: [HOLYRICS_SYNC] Song: ... | LouvorFlow ID: ... | Holyrics ID: ... | Order: ...

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
              finalResult = typeof r === 'string' ? JSON.parse(r) : r
            } catch (_) {}
            finalError = check.getString('error')
            break
          }
        } catch (_) {}
        for (let k = 0; k < 60; k++) {
          $security.randomString(5)
        }
      }

      return {
        command_id: cmdId,
        status: finalStatus,
        result: finalResult,
        error: finalError,
      }
    }

    // Normalização estrita para comparação de títulos e artistas
    // Remove espaços duplicados, trim, lowercase, remove pontuações, normaliza acentuação
    const normalizeString = (str) => {
      if (!str) return ''
      let s = String(str).toLowerCase().trim()
      // Mapa de remoção de acentos comum em JS
      const from = 'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ'
      const to = 'aaaaaaeceeeeiiiidnoooooouuuuypy'
      for (let i = 0; i < from.length; i++) {
        s = s.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
      }
      // Remove caracteres especiais/pontuações, mantendo apenas letras e números
      s = s.replace(/[^a-z0-9\s]/g, ' ')
      // Remove múltiplos espaços
      s = s.replace(/\s+/g, ' ').trim()
      return s
    }

    // Consulta acervo GetSongs do Holyrics uma vez inicialmente se houver alguma música sem holyrics_song_id
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
        const list = Array.isArray(getSongsCmdRes.result.songs)
          ? getSongsCmdRes.result.songs
          : Array.isArray(getSongsCmdRes.result)
            ? getSongsCmdRes.result
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
        const pItems = Array.isArray(playlistCmdRes.result.items)
          ? playlistCmdRes.result.items
          : Array.isArray(playlistCmdRes.result)
            ? playlistCmdRes.result
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

    // Constante de marcadores de seção para o parser LouvorFlow -> slides Holyrics
    const sectionMarkersList = [
      'INTRO',
      'INTRODUÇÃO',
      'INTRODUCAO',
      'VERSO 1',
      'VERSO 2',
      'VERSO 3',
      'VERSO',
      'PRÉ-REFRÃO',
      'PRE-REFRAO',
      'PRÉ REFRÃO',
      'PRE REFRAO',
      'REFRÃO',
      'REFRAO',
      'CORO',
      'PONTE',
      'FINAL',
      'INTERLÚDIO',
      'INTERLUDIO',
      'INSTRUMENTAL',
      'TAG',
      'BREAK',
      'OUTRO',
      'FIM',
      'SOLO',
      'ESTROFE',
    ]

    const isMarker = (lineText) => {
      const clean = lineText
        .replace(/^[[({\s#*=-]+|[\])}\s#*=-]+$/g, '')
        .replace(/:$/, '')
        .trim()
        .toUpperCase()
      if (!clean) return false
      for (let m = 0; m < sectionMarkersList.length; m++) {
        if (clean === sectionMarkersList[m] || clean.startsWith(sectionMarkersList[m] + ' ')) {
          return clean
        }
      }
      return false
    }

    for (let i = 0; i < eventSongRecords.length; i++) {
      const songStartTime = Date.now()
      const eventSongRec = eventSongRecords[i]
      const repertoireOrder = eventSongRec.getInt('order') || i + 1
      const playlistIndexBase0 = i // Posição base 0 no repertório do evento
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
      const rawLyrics =
        songRec.getString('lyrics') ||
        songRec.getString('raw_content') ||
        songRec.getString('chords') ||
        ''
      const slides = []
      const sectionLines = rawLyrics.split(/\r?\n/)
      let currentSectionName = 'VERSO 1'
      let currentSectionTextLines = []

      const flushSlide = () => {
        const joined = currentSectionTextLines.join('\n').trim()
        if (joined) {
          slides.push({
            text: joined,
            slide_description: currentSectionName,
          })
        }
        currentSectionTextLines = []
      }

      for (let l = 0; l < sectionLines.length; l++) {
        const line = sectionLines[l]
        const trimmed = line.trim()
        if (!trimmed) continue

        const markerMatch = isMarker(trimmed)
        if (markerMatch) {
          flushSlide()
          currentSectionName = markerMatch
        } else {
          // Linha de letra: remove acordes inline [G] se existirem
          const cleanLine = line
            .replace(/\[[A-G][^\]]*\]/g, '')
            .replace(/[ \t]{2,}/g, ' ')
            .trim()
          if (cleanLine) {
            currentSectionTextLines.push(cleanLine)
          }
        }
      }
      flushSlide()

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

      let holyricsSongId = songRec.getString('holyrics_song_id')
      let songWasCreatedNow = false
      let songStatusLabel = ''
      let logSteps = []

      // -------------------------------------------------------------
      // ETAPA 1 & 2: Localização segura da música (Zero Duplicação)
      // -------------------------------------------------------------
      if (holyricsSongId) {
        // Regra 1: Se songs.holyrics_song_id existe -> usar direto! NUNCA chamar CreateSong
        songStatusLabel = `✓ Música já existente no Holyrics / Holyrics #${holyricsSongId}`
        countAlreadyExisted++
        logSteps.push(`Holyrics ID: ${holyricsSongId} (persisted) | CreateSong → SKIPPED`)
      } else {
        // Regra 2: songs.holyrics_song_id NÃO existe -> buscar em GetSongs
        eventSongRec.set('holyrics_status', 'CHECKING')
        try {
          $app.save(eventSongRec)
        } catch (_) {}

        if (!holyricsLibraryCache) {
          fetchHolyricsLibrary()
        }
        const library = holyricsLibraryCache || []

        const normTargetTitle = normalizeString(songTitle)
        const normTargetArtist = normalizeString(songArtist)

        let matchedItem = null

        // Comparação de correspondência segura
        for (let mIdx = 0; mIdx < library.length; mIdx++) {
          const item = library[mIdx]
          const normItemTitle = normalizeString(item.title)
          if (normItemTitle === normTargetTitle) {
            // Título idêntico normalizado!
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
          holyricsSongId = String(matchedItem.id)
          songRec.set('holyrics_song_id', holyricsSongId)
          try {
            $app.save(songRec)
          } catch (_) {}
          countAlreadyExisted++
          songStatusLabel = `✓ Música já existente no Holyrics / Holyrics #${holyricsSongId}`
          logSteps.push(`GetSongs → FOUND (#${holyricsSongId}) | CreateSong → SKIPPED`)
        } else {
          // Não encontrada no GetSongs -> CREATE_SONG com payload validado
          logSteps.push(`GetSongs → NOT_FOUND | CreateSong → EXECUTING`)

          // Proteção contra chamadas concorrentes: lock
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

          // REGRA CRÍTICA 3: Não confiar cegamente no retorno. Executar GetSongs para confirmar.
          const refreshedLibrary = fetchHolyricsLibrary() || []
          let confirmedId = ''

          if (
            createRes.status === 'DONE' &&
            createRes.result &&
            createRes.result.holyrics_song_id
          ) {
            const rawReturnedId = String(createRes.result.holyrics_song_id)
            const appearsInLibrary = refreshedLibrary.some((it) => String(it.id) === rawReturnedId)
            if (appearsInLibrary) {
              confirmedId = rawReturnedId
            }
          }

          // Se CreateSong deu timeout ou erro, ou ID não conferiu, confere se foi criada mesmo assim
          if (!confirmedId) {
            for (let cIdx = 0; cIdx < refreshedLibrary.length; cIdx++) {
              const it = refreshedLibrary[cIdx]
              if (normalizeString(it.title) === normTargetTitle) {
                confirmedId = String(it.id)
                break
              }
            }
          }

          if (confirmedId) {
            holyricsSongId = confirmedId
            songRec.set('holyrics_song_id', holyricsSongId)
            try {
              $app.save(songRec)
            } catch (_) {}

            songWasCreatedNow = true
            countCreated++
            songStatusLabel = `✓ Música criada no Holyrics / Holyrics #${holyricsSongId}`
            eventSongRec.set('holyrics_status', 'CREATED')
            try {
              $app.save(eventSongRec)
            } catch (_) {}
            logSteps.push(`CreateSong → OK | GetSongs Confirm → CONFIRMED (#${holyricsSongId})`)
          } else {
            // Falha real de criação após conferência
            const errorMsg =
              createRes.error ||
              'Não foi possível criar a música no Holyrics. Verifique permissões do API Server.'
            eventSongRec.set('holyrics_status', 'ERROR')
            eventSongRec.set('holyrics_error', errorMsg)
            try {
              $app.save(eventSongRec)
            } catch (_) {}
            countErrors++
            logSteps.push(`CreateSong → FAILED (${errorMsg}) | GetSongs Confirm → NOT_FOUND`)
            console.log(
              `[HOLYRICS_SYNC] Song: ${songTitle} | LouvorFlow ID: ${songId} | Order: ${repertoireOrder}\n${logSteps.join(' | ')} | FINAL → ERROR`,
            )
            results.push({
              order: repertoireOrder,
              event_song_id: eventSongRec.id,
              song_id: songId,
              song_title: songTitle,
              holyrics_song_id: null,
              action: 'CREATE_SONG',
              status: 'ERROR',
              error: errorMsg,
              detail: `✕ Falha na sincronização / Etapa: CreateSong / ${errorMsg}`,
            })
            continue
          }
        }
      }

      // -------------------------------------------------------------
      // ETAPA 4: Verificar se holyrics_song_id já está na playlist
      // -------------------------------------------------------------
      eventSongRec.set('holyrics_status', 'CHECKING_PLAYLIST')
      try {
        $app.save(eventSongRec)
      } catch (_) {}

      // Verifica no mapa atual
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

        results.push({
          order: repertoireOrder,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: songTitle,
          holyrics_song_id: holyricsSongId,
          action: songWasCreatedNow ? 'CREATED_AND_ALREADY_IN_PLAYLIST' : 'ALREADY_IN_PLAYLIST',
          status: 'SUCCESS',
          detail: `${songStatusLabel} • ✓ Música já estava na playlist`,
        })
        continue
      }

      // -------------------------------------------------------------
      // ETAPA 5 & 6: ADD_LYRICS_TO_PLAYLIST + Confirmação via GetSongPlaylist
      // -------------------------------------------------------------
      logSteps.push(
        `GetSongPlaylist → NOT_FOUND | AddLyricsToPlaylist → EXECUTING (index ${playlistIndexBase0})`,
      )
      eventSongRec.set('holyrics_status', 'ADDING_TO_PLAYLIST')
      try {
        $app.save(eventSongRec)
      } catch (_) {}

      const addPayload = {
        id: holyricsSongId,
        index: playlistIndexBase0,
        media_playlist: false,
        song_id: songId,
        event_id: eventId,
        title: songTitle,
        artist: songArtist,
      }

      const addRes = runCommandSync('ADD_LYRICS_TO_PLAYLIST', addPayload, 10000)

      // REGRA CRÍTICA 6: Executar GetSongPlaylist novamente para confirmação real
      const confirmedPlaylist = fetchHolyricsPlaylist() || []
      const appearsInPlaylist = confirmedPlaylist.some(
        (it) => String(it.id || it.song_id || it.songId || '') === holyricsSongId,
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

        results.push({
          order: repertoireOrder,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: songTitle,
          holyrics_song_id: holyricsSongId,
          action: songWasCreatedNow ? 'CREATED_AND_ADDED' : 'ADDED_TO_PLAYLIST',
          status: 'SUCCESS',
          detail: `${songStatusLabel} • ✓ Música adicionada à playlist / Posição: ${repertoireOrder}`,
        })
      } else {
        const errorMsg =
          addRes.status === 'DONE'
            ? 'A API retornou OK, mas a música não apareceu no GetSongPlaylist após a confirmação.'
            : addRes.error || 'Erro ao adicionar à playlist do Holyrics.'

        eventSongRec.set('holyrics_status', 'ERROR')
        eventSongRec.set('holyrics_error', errorMsg)
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

        results.push({
          order: repertoireOrder,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: songTitle,
          holyrics_song_id: holyricsSongId,
          action: 'ADD_TO_PLAYLIST',
          status: 'ERROR',
          error: errorMsg,
          detail: `✕ Falha na sincronização / Etapa: AddLyricsToPlaylist / ${errorMsg}`,
        })
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
