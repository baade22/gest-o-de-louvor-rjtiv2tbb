// Hook para o fluxo: Enviar música para playlist do Holyrics
// POST /backend/v1/saas/holyrics/send-to-playlist
// Requer autenticação + perfil com holyrics.sync (MASTER/ADMIN/LIDER; Músico NÃO PODE -> 403)
// Body: { church_id, song_id, agent_id?, chosen_holyrics_id? }
// Se chosen_holyrics_id informado: cria comando ADD_TO_PLAYLIST diretamente
// Se não informado: cria comando SEARCH_SONG -> aguarda resultado
//   - 0 resultados: retorna "⚠️ Música não encontrada no Holyrics"
//   - 1 resultado: cria comando ADD_TO_PLAYLIST imediatamente e adiciona
//   - múltiplos: retorna lista de candidatos para o usuário escolher (sem inventar/adivinhar)

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/send-to-playlist',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const songId = String(body.song_id || '').trim()
    let agentId = String(body.agent_id || '').trim()
    const chosenHolyricsId = body.chosen_holyrics_id ? String(body.chosen_holyrics_id).trim() : ''

    if (!churchId || !songId) {
      return e.json(400, {
        success: false,
        message: 'church_id e song_id são obrigatórios.',
      })
    }

    // 1. Validação estrita de permissão holyrics.sync
    // Músicos NÃO podem sincronizar mesmo tendo acesso às músicas -> 403
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
        return e.json(403, { success: false, message: 'Acesso negado a esta congregação.' })
      }
      const role = memberships[0].getString('role')
      if (role === 'MUSICO') {
        return e.json(403, {
          success: false,
          error_code: 'INSUFFICIENT_PERMISSIONS',
          message:
            'Apenas Administradores e Líderes possuem permissão para sincronizar com o Holyrics (holyrics.sync).',
        })
      }
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao validar autorização: ' + err.message })
    }

    // 2. Busca música do LouvorFlow
    let songRecord = null
    try {
      songRecord = $app.findRecordById('songs', songId)
    } catch (_) {
      return e.json(404, {
        success: false,
        error_code: 'SONG_NOT_FOUND',
        message: 'Música não encontrada no LouvorFlow.',
      })
    }

    if (songRecord.getString('church_id') !== churchId) {
      return e.json(403, {
        success: false,
        error_code: 'MULTI_TENANT_VIOLATION',
        message: 'A música informada pertence a outra congregação.',
      })
    }

    const songTitle = songRecord.getString('title')
    const songArtist = songRecord.getString('artist')

    // 3. Se agent_id não foi informado, busca o primeiro Agent ONLINE da congregação
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

    // Valida agente
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
          '🔴 Holyrics desconectado no computador "' +
          (agentRecord.getString('name') || 'Projeção') +
          '". Verifique se o aplicativo LouvorFlow Agent está em execução.',
      })
    }

    // Se o Agent está online mas o Holyrics foi marcado como fechado
    if (!agentRecord.getBool('holyrics_detected')) {
      return e.json(200, {
        success: false,
        agent_online: true,
        holyrics_detected: false,
        error_code: 'HOLYRICS_NOT_DETECTED',
        message:
          'Agent 🟢 conectado, mas Holyrics 🔴 não detectado na porta 8091. Abra o Holyrics no computador da igreja e certifique-se de que o API Server está ativado nas Configurações.',
      })
    }

    const cmdCol = $app.findCollectionByNameOrId('holyrics_commands')
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)

    // =========================================================================
    // CASO 0: Se songs.holyrics_song_id já existe -> usa diretamente o ID existente
    // =========================================================================
    const existingHolyricsId = songRecord.getString('holyrics_song_id')
    const targetHolyricsId = chosenHolyricsId || existingHolyricsId

    if (targetHolyricsId) {
      const addCmd = new Record(cmdCol)
      const addCmdId = 'cmd_add_' + Date.now() + '_' + $security.randomString(8)
      addCmd.set('command_id', addCmdId)
      addCmd.set('church_id', churchId)
      addCmd.set('agent_id', agentId)
      addCmd.set('action', 'ADD_LYRICS_TO_PLAYLIST')
      addCmd.set('payload', {
        song_id: songId,
        holyrics_song_id: targetHolyricsId,
        title: songTitle,
        artist: songArtist,
      })
      addCmd.set('status', 'PENDING')
      addCmd.set('created_at', nowIso)

      $app.save(addCmd)

      // Aguarda resposta do Agent (até 10s)
      const startWait = Date.now()
      let finalStatus = 'PENDING'
      let cmdResult = null
      let cmdError = ''

      while (Date.now() - startWait < 10000) {
        try {
          const check = $app.findRecordById('holyrics_commands', addCmd.id)
          const st = check.getString('status')
          if (st === 'DONE' || st === 'FAILED') {
            finalStatus = st
            try {
              const rawRes = check.get('result')
              cmdResult = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes
            } catch (_) {}
            cmdError = check.getString('error')
            break
          }
        } catch (_) {}
        // Loop a cada ~300ms
        for (let k = 0; k < 60; k++) {
          $security.randomString(5)
        }
      }

      if (finalStatus === 'DONE') {
        return e.json(200, {
          success: true,
          action: 'ADD_TO_PLAYLIST',
          added: true,
          song_title: songTitle,
          holyrics_song_id: chosenHolyricsId,
          result: cmdResult,
          message: `✓ Música "${songTitle}" adicionada com sucesso à playlist do Holyrics!`,
        })
      }

      if (finalStatus === 'FAILED') {
        return e.json(200, {
          success: false,
          error_code: cmdResult?.error_code || 'ADD_PLAYLIST_FAILED',
          error: cmdError,
          message:
            cmdError ||
            `Não foi possível adicionar "${songTitle}" à playlist do Holyrics. Verifique o token e as permissões do API Server.`,
        })
      }

      return e.json(200, {
        success: true,
        pending: true,
        command_id: addCmdId,
        poll_url: `/backend/v1/holyrics/commands/${addCmdId}/status`,
        message: 'Ainda aguardando o computador do Holyrics executar a adição. Verificando...',
      })
    }

    // =========================================================================
    // CASO 2: Buscar música no Holyrics via SearchSong
    // =========================================================================
    const searchCmd = new Record(cmdCol)
    const searchCmdId = 'cmd_search_' + Date.now() + '_' + $security.randomString(8)
    searchCmd.set('command_id', searchCmdId)
    searchCmd.set('church_id', churchId)
    searchCmd.set('agent_id', agentId)
    searchCmd.set('action', 'SEARCH_SONG')
    searchCmd.set('payload', {
      song_id: songId,
      query: songTitle,
      artist: songArtist,
    })
    searchCmd.set('status', 'PENDING')
    searchCmd.set('created_at', nowIso)

    $app.save(searchCmd)

    // Aguarda resposta do Agent (até 10s)
    const startWait = Date.now()
    let searchStatus = 'PENDING'
    let searchResult = null
    let searchError = ''

    while (Date.now() - startWait < 10000) {
      try {
        const check = $app.findRecordById('holyrics_commands', searchCmd.id)
        const st = check.getString('status')
        if (st === 'DONE' || st === 'FAILED') {
          searchStatus = st
          try {
            const rawRes = check.get('result')
            searchResult = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes
          } catch (_) {}
          searchError = check.getString('error')
          break
        }
      } catch (_) {}
      // Loop a cada ~300ms
      for (let k = 0; k < 60; k++) {
        $security.randomString(5)
      }
    }

    if (searchStatus === 'FAILED') {
      return e.json(200, {
        success: false,
        error_code: searchResult?.error_code || 'SEARCH_FAILED',
        error: searchError,
        message:
          searchError ||
          `Erro ao consultar Holyrics. Verifique se o API Server está com a permissão SearchSong/SearchLyrics habilitada.`,
      })
    }

    if (searchStatus === 'PENDING') {
      return e.json(200, {
        success: false,
        pending: true,
        command_id: searchCmdId,
        poll_url: `/backend/v1/holyrics/commands/${searchCmdId}/status`,
        message: 'Ainda aguardando o computador do Holyrics executar a busca. Verificando...',
      })
    }

    // Analisa candidatos retornados pelo Agent
    const matches = Array.isArray(searchResult?.matches) ? searchResult.matches : []

    // 0 resultados: mensagem clara para o usuário
    if (matches.length === 0) {
      return e.json(200, {
        success: false,
        error_code: 'SONG_NOT_FOUND_IN_HOLYRICS',
        matches_count: 0,
        song_title: songTitle,
        message: `⚠️ Música não encontrada no Holyrics: "${songTitle}". Cadastre ou importe a letra no programa Holyrics primeiro.`,
      })
    }

    // Exatamente 1 resultado: Adiciona automaticamente à playlist!
    if (matches.length === 1) {
      const match = matches[0]
      const hId = String(match.id)

      const autoAddCmd = new Record(cmdCol)
      const autoAddCmdId = 'cmd_add_' + Date.now() + '_' + $security.randomString(8)
      autoAddCmd.set('command_id', autoAddCmdId)
      autoAddCmd.set('church_id', churchId)
      autoAddCmd.set('agent_id', agentId)
      autoAddCmd.set('action', 'ADD_TO_PLAYLIST')
      autoAddCmd.set('payload', {
        song_id: songId,
        holyrics_song_id: hId,
        title: match.title || songTitle,
        artist: match.artist || songArtist,
      })
      autoAddCmd.set('status', 'PENDING')
      autoAddCmd.set('created_at', nowIso)

      $app.save(autoAddCmd)

      // Aguarda até 10s
      const waitAddStart = Date.now()
      let autoAddStatus = 'PENDING'
      let autoAddResult = null
      let autoAddError = ''

      while (Date.now() - waitAddStart < 10000) {
        try {
          const check = $app.findRecordById('holyrics_commands', autoAddCmd.id)
          const st = check.getString('status')
          if (st === 'DONE' || st === 'FAILED') {
            autoAddStatus = st
            try {
              const rawRes = check.get('result')
              autoAddResult = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes
            } catch (_) {}
            autoAddError = check.getString('error')
            break
          }
        } catch (_) {}
        for (let k = 0; k < 60; k++) {
          $security.randomString(5)
        }
      }

      if (autoAddStatus === 'DONE') {
        return e.json(200, {
          success: true,
          action: 'ADD_TO_PLAYLIST',
          added: true,
          song_title: songTitle,
          holyrics_song_id: hId,
          result: autoAddResult,
          message: `✓ Música "${match.title || songTitle}" encontrada e adicionada à playlist do Holyrics!`,
        })
      }

      if (autoAddStatus === 'FAILED') {
        return e.json(200, {
          success: false,
          error_code: autoAddResult?.error_code || 'ADD_PLAYLIST_FAILED',
          error: autoAddError,
          message:
            autoAddError ||
            `Música encontrada no Holyrics, mas falhou ao adicionar à playlist. Verifique se AddLyricsToPlaylist está permitida no token.`,
        })
      }

      return e.json(200, {
        success: true,
        pending: true,
        command_id: autoAddCmdId,
        poll_url: `/backend/v1/holyrics/commands/${autoAddCmdId}/status`,
        message: 'Ainda aguardando o computador do Holyrics executar a adição. Verificando...',
      })
    }

    // Múltiplos resultados (> 1): NÃO escolher arbitrariamente!
    // Retorna a lista (título - artista) para o usuário selecionar na UI
    return e.json(200, {
      success: true,
      requires_selection: true,
      song_title: songTitle,
      matches_count: matches.length,
      matches: matches.map((m) => ({
        id: String(m.id),
        title: m.title || 'Sem título',
        artist: m.artist || '',
        key: m.key || '',
        bpm: m.bpm || 0,
      })),
      agent_id: agentId,
      message: `Encontradas ${matches.length} músicas no Holyrics para "${songTitle}". Selecione qual deseja enviar à playlist.`,
    })
  },
  $apis.requireAuth(),
)
