// Hook para o fluxo: Sincronizar repertório do evento com Holyrics
// POST /backend/v1/saas/holyrics/sync-event
// Requer autenticação + perfil com holyrics.sync (MASTER/ADMIN/LIDER; Músico NÃO PODE -> 403)
// Multi-tenant: church_id validado via autenticação; valida evento e músicas pertencentes à mesma igreja.
// Body: { church_id, event_id, agent_id? }
// Processa as músicas na ordem exata do repertório (order 1,2,3... do event_songs).
// Para cada música:
//   (a) se songs.holyrics_song_id existe -> usa o ID existente
//   (b) se não existe -> executa CREATE_SONG via Agent, salva o ID em songs.holyrics_song_id
//   (c) consulta GET_LYRICS_PLAYLIST para verificar se já está na playlist -> se já estiver, ALREADY_IN_PLAYLIST
//   (d) se não estiver -> executa ADD_LYRICS_TO_PLAYLIST com o ID
// Atualiza event_songs: holyrics_status, holyrics_synced_at, holyrics_error, holyrics_playlist_order
// Retorna relatório completo por música e resumo geral.

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
    // Apenas Administradores, Líderes ou Master possuem holyrics.sync. Músico NÃO PODE -> 403
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
          '🔴 Holyrics desconectado. Nenhum computador com LouvorFlow Agent ativo nesta congregação. Verifique o checklist: 1. O computador está ligado? 2. O Agent está em execução? 3. O Holyrics está aberto? 4. A internet está conectada?',
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
          '🔴 LouvorFlow Agent offline no computador "' +
          (agentRecord.getString('name') || 'Projeção') +
          '". Inicie o LouvorFlow Agent no computador do Holyrics.',
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

    // 5. Etapa 1 da Idempotência: Consulta a playlist atual do Holyrics via GET_LYRICS_PLAYLIST
    const currentPlaylistMap = {}
    const playlistCmdRes = runCommandSync(
      'GET_LYRICS_PLAYLIST',
      { church_id: churchId, agent_id: agentId, event_id: eventId },
      8000,
    )

    if (playlistCmdRes.status === 'DONE' && playlistCmdRes.result) {
      const pItems = Array.isArray(playlistCmdRes.result.items)
        ? playlistCmdRes.result.items
        : Array.isArray(playlistCmdRes.result)
          ? playlistCmdRes.result
          : []
      for (let pIdx = 0; pIdx < pItems.length; pIdx++) {
        const item = pItems[pIdx]
        const pId = String(item.id || item.song_id || item.songId || '')
        if (pId) {
          currentPlaylistMap[pId] = true
        }
      }
    }

    // 6. Loop de Sincronização na ordem exata
    const results = []
    let countCreated = 0
    let countAlreadyExisted = 0
    let countAdded = 0
    let countAlreadyInPlaylist = 0
    let countErrors = 0

    for (let i = 0; i < eventSongRecords.length; i++) {
      const eventSongRec = eventSongRecords[i]
      const order = eventSongRec.getInt('order') || i + 1
      const songId = eventSongRec.getString('song_id')

      let songRec = null
      try {
        songRec = $app.findRecordById('songs', songId)
      } catch (_) {
        eventSongRec.set('holyrics_status', 'ERROR')
        eventSongRec.set('holyrics_error', 'Música excluída ou não encontrada no acervo')
        try {
          $app.save(eventSongRec)
        } catch (_) {}
        countErrors++
        results.push({
          order: order,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: 'Música não encontrada',
          action: 'NOT_FOUND',
          status: 'ERROR',
          detail: 'Música não encontrada no LouvorFlow',
        })
        continue
      }

      const songTitle = songRec.getString('title')
      const songArtist = songRec.getString('artist')
      const songComposer = songRec.getString('composer')
      const songKey = songRec.getString('key')
      const songBpm = songRec.getInt('bpm')
      const songNotes = songRec.getString('notes')

      // Prepara seções/slides da música para o Holyrics
      // Converte a letra em slides [{ text, slide_description }] determinísticos
      // Preserva a versão compatível com apresentação (letra limpa sem cifras, estruturada em seções)
      let rawLyrics =
        songRec.getString('lyrics') ||
        songRec.getString('raw_content') ||
        songRec.getString('chords') ||
        ''
      const slides = []
      const sectionLines = rawLyrics.split(/\r?\n/)
      let currentSectionName = 'VERSO 1'
      let currentSectionTextLines = []

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

      // (a) Se holyrics_song_id não existe no LouvorFlow -> Executa CreateSong
      if (!holyricsSongId) {
        eventSongRec.set('holyrics_status', 'CREATING')
        try {
          $app.save(eventSongRec)
        } catch (_) {}

        const createPayload = {
          song_id: songId,
          event_id: eventId,
          title: songTitle,
          artist: songArtist || '',
          author: songComposer || '',
          note: songNotes || '',
          copyright: '',
          slides: slides,
          formatting_type: 'basic',
          order: orderStr,
        }
        if (songKey) createPayload.key = songKey
        if (songBpm) createPayload.bpm = songBpm

        const createRes = runCommandSync('CREATE_SONG', createPayload, 12000)

        if (createRes.status === 'DONE' && createRes.result && createRes.result.holyrics_song_id) {
          holyricsSongId = String(createRes.result.holyrics_song_id)
          // Salva imediatamente em songs.holyrics_song_id
          songRec.set('holyrics_song_id', holyricsSongId)
          try {
            $app.save(songRec)
          } catch (errSaveSong) {}

          songWasCreatedNow = true
          countCreated++
          eventSongRec.set('holyrics_status', 'CREATED')
          try {
            $app.save(eventSongRec)
          } catch (_) {}
        } else {
          // Erro na criação
          const errorMsg =
            createRes.error ||
            'Não foi possível criar a música no Holyrics. Verifique permissões do API Server.'
          eventSongRec.set('holyrics_status', 'ERROR')
          eventSongRec.set('holyrics_error', errorMsg)
          try {
            $app.save(eventSongRec)
          } catch (_) {}
          countErrors++
          results.push({
            order: order,
            event_song_id: eventSongRec.id,
            song_id: songId,
            song_title: songTitle,
            holyrics_song_id: null,
            action: 'CREATE_SONG',
            status: 'ERROR',
            error: errorMsg,
            detail: `Erro ao criar música no Holyrics: ${errorMsg}`,
          })
          continue
        }
      } else {
        countAlreadyExisted++
      }

      // (b) Com holyricsSongId em mãos -> Verifica se já está na playlist para evitar duplicação (idempotência)
      const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
      const alreadyInPlaylist = Boolean(currentPlaylistMap[holyricsSongId])

      if (alreadyInPlaylist) {
        countAlreadyInPlaylist++
        eventSongRec.set('holyrics_status', 'ALREADY_IN_PLAYLIST')
        eventSongRec.set('holyrics_synced_at', nowIso)
        eventSongRec.set('holyrics_playlist_order', order)
        eventSongRec.set('holyrics_error', '')
        try {
          $app.save(eventSongRec)
        } catch (_) {}

        results.push({
          order: order,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: songTitle,
          holyrics_song_id: holyricsSongId,
          action: songWasCreatedNow ? 'CREATED_AND_ALREADY_IN_PLAYLIST' : 'ALREADY_IN_PLAYLIST',
          status: 'SUCCESS',
          detail: songWasCreatedNow
            ? `Música criada no Holyrics (ID: ${holyricsSongId}) — Já consta na playlist`
            : `Já cadastrada no Holyrics (ID: ${holyricsSongId}) — Já consta na playlist`,
        })
        continue
      }

      // (c) Não está na playlist -> Executa ADD_LYRICS_TO_PLAYLIST
      eventSongRec.set('holyrics_status', 'ADDING_TO_PLAYLIST')
      try {
        $app.save(eventSongRec)
      } catch (_) {}

      const addPayload = {
        song_id: songId,
        event_id: eventId,
        holyrics_song_id: holyricsSongId,
        title: songTitle,
        artist: songArtist,
      }

      const addRes = runCommandSync('ADD_LYRICS_TO_PLAYLIST', addPayload, 10000)

      if (addRes.status === 'DONE') {
        currentPlaylistMap[holyricsSongId] = true
        countAdded++
        eventSongRec.set('holyrics_status', 'ADDED_TO_PLAYLIST')
        eventSongRec.set('holyrics_synced_at', nowIso)
        eventSongRec.set('holyrics_playlist_order', order)
        eventSongRec.set('holyrics_error', '')
        try {
          $app.save(eventSongRec)
        } catch (_) {}

        results.push({
          order: order,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: songTitle,
          holyrics_song_id: holyricsSongId,
          action: songWasCreatedNow ? 'CREATED_AND_ADDED' : 'ADDED_TO_PLAYLIST',
          status: 'SUCCESS',
          detail: songWasCreatedNow
            ? `Música criada no Holyrics (ID: ${holyricsSongId}) — Adicionada à playlist`
            : `Já cadastrada no Holyrics — Adicionada à playlist`,
        })
      } else {
        const addErr = addRes.error || 'Erro ao adicionar música à playlist do Holyrics.'
        eventSongRec.set('holyrics_status', 'ERROR')
        eventSongRec.set('holyrics_error', addErr)
        try {
          $app.save(eventSongRec)
        } catch (_) {}
        countErrors++
        results.push({
          order: order,
          event_song_id: eventSongRec.id,
          song_id: songId,
          song_title: songTitle,
          holyrics_song_id: holyricsSongId,
          action: 'ADD_TO_PLAYLIST',
          status: 'ERROR',
          error: addErr,
          detail: `Erro ao adicionar à playlist: ${addErr}`,
        })
      }
    }

    const totalProcessed = eventSongRecords.length
    const isFullSuccess = countErrors === 0

    let summaryMessage = ''
    if (isFullSuccess) {
      summaryMessage = `Sincronização concluída com sucesso! ${totalProcessed} músicas processadas: ${countAdded} adicionadas à playlist${countAlreadyInPlaylist > 0 ? `, ${countAlreadyInPlaylist} já estavam na playlist` : ''}${countCreated > 0 ? `, ${countCreated} criadas no Holyrics` : ''}.`
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
