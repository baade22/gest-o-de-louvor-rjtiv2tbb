// Hook: saas_holyrics_sync_media_playlist.js
// Endpoint: POST /backend/v1/saas/holyrics/sync-media-playlist
// Enfileira comando SYNC_MEDIA_PLAYLIST para o Agent local incluir as mídias do evento na playlist do Holyrics

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/sync-media-playlist',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, {
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Não autenticado.',
      })
    }

    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {}

    const eventId = String(body.event_id || '').trim()
    const churchId = String(body.church_id || '').trim()

    if (!eventId || !churchId) {
      return e.json(400, {
        success: false,
        error_code: 'MISSING_FIELDS',
        message: 'event_id e church_id são obrigatórios.',
      })
    }

    // Valida se o usuário pertence à igreja
    let member = null
    try {
      member = $app.findFirstRecordByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && status = "ACTIVE"',
        { churchId: churchId, userId: auth.id },
      )
    } catch (_) {}

    if (!member) {
      return e.json(403, {
        success: false,
        error_code: 'FORBIDDEN_MEMBER',
        message: 'Você não tem permissão ativa nesta congregação.',
      })
    }

    // Busca o evento
    let eventRecord = null
    try {
      eventRecord = $app.findRecordById('events', eventId)
      if (eventRecord.getString('church_id') !== churchId) {
        eventRecord = null
      }
    } catch (_) {}

    if (!eventRecord) {
      return e.json(404, {
        success: false,
        error_code: 'EVENT_NOT_FOUND',
        message: 'Evento não encontrado nesta congregação.',
      })
    }

    // Localiza o Agent da igreja
    let agentRecord = null
    const requestedAgentId = String(body.agent_id || '').trim()
    if (requestedAgentId) {
      try {
        agentRecord = $app.findRecordById('holyrics_agents', requestedAgentId)
        if (agentRecord.getString('church_id') !== churchId) {
          agentRecord = null
        }
      } catch (_) {}
    }

    if (!agentRecord) {
      try {
        const agents = $app.findRecordsByFilter(
          'holyrics_agents',
          'church_id = {:churchId}',
          '-last_seen_at',
          1,
          0,
          { churchId: churchId },
        )
        if (agents && agents.length > 0) {
          agentRecord = agents[0]
        }
      } catch (_) {}
    }

    if (!agentRecord) {
      return e.json(400, {
        success: false,
        error_code: 'NO_AGENT_REGISTERED',
        message: 'Nenhum computador Holyrics pareado com esta congregação.',
      })
    }

    const agentId = agentRecord.id
    const isOnline = agentRecord.getString('status') === 'ONLINE'

    // Busca todas as mídias associadas ao evento, ordenadas por presentation_order asc, created asc
    let mediaRecords = []
    try {
      mediaRecords = $app.findRecordsByFilter(
        'media_assets',
        'event_id = {:eventId} && church_id = {:churchId}',
        '+presentation_order,+created',
        100,
        0,
        { eventId: eventId, churchId: churchId },
      )
    } catch (_) {}

    if (!mediaRecords || mediaRecords.length === 0) {
      return e.json(400, {
        success: false,
        error_code: 'NO_MEDIA_FOUND',
        message: 'Nenhuma mídia vinculada a este evento para adicionar à playlist.',
      })
    }

    // Prepara itens com o nome físico padronizado
    const items = []
    for (let i = 0; i < mediaRecords.length; i++) {
      const m = mediaRecords[i]
      const originalFile = m.getString('file')
      let holyricsFilename = m.getString('holyrics_filename')

      if (!holyricsFilename) {
        // Fallback para gerar nome se não preenchido
        holyricsFilename = m.getString('name') || originalFile
      }

      items.push({
        id: m.id,
        name: m.getString('name'),
        file_name: originalFile,
        holyrics_filename: holyricsFilename,
        media_type: m.getString('media_type'),
        category: m.getString('category'),
        presentation_order: m.getInt('presentation_order') || i + 1,
      })
    }

    // Enfileira comando SYNC_MEDIA_PLAYLIST
    const commandId = 'cmd_sync_media_' + Date.now() + '_' + $security.randomString(8)
    const cmdCol = $app.findCollectionByNameOrId('holyrics_commands')
    const cmdRec = new Record(cmdCol)

    cmdRec.set('command_id', commandId)
    cmdRec.set('church_id', churchId)
    cmdRec.set('agent_id', agentId)
    cmdRec.set('action', 'SYNC_MEDIA_PLAYLIST')
    cmdRec.set('status', 'PENDING')
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
    cmdRec.set('created_at', nowIso)

    const payload = {
      event_id: eventId,
      church_id: churchId,
      event_title: eventRecord.getString('title'),
      items: items,
    }

    cmdRec.set('payload', payload)

    try {
      $app.save(cmdRec)
    } catch (err) {
      return e.json(500, {
        success: false,
        error_code: 'SAVE_COMMAND_ERROR',
        message: 'Erro ao enfileirar comando: ' + err.message,
      })
    }

    return e.json(200, {
      success: true,
      command_id: commandId,
      agent_online: isOnline,
      total_items: items.length,
      message: isOnline
        ? 'Sincronização de mídias enviada para o computador do Holyrics.'
        : 'Comando registrado. As mídias serão inseridas na playlist assim que o computador do Holyrics conectar.',
    })
  },
  $apis.requireAuth(),
)
