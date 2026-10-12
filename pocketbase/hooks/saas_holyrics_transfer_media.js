// Hook para o SaaS solicitar transferência de mídia para o Agent local
// POST /backend/v1/saas/holyrics/transfer-media
// Autenticado com sessão de usuário do LouvorFlow ($apis.requireAuth())
// Valida permissão do usuário na igreja da mídia
// Enfileira comando TRANSFER_MEDIA na tabela holyrics_commands
// Garante idempotência: se já houver comando PENDING ou SENT em andamento para a mesma mídia, reutiliza

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/transfer-media',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const mediaId = String(body.media_id || '').trim()
    const churchIdParam = String(body.church_id || '').trim()
    const targetSubfolderParam = String(body.target_subfolder || '').trim()

    if (!mediaId) {
      return e.json(400, {
        success: false,
        error_code: 'MISSING_MEDIA_ID',
        message: 'media_id é obrigatório.',
      })
    }

    // 1. Busca mídia
    let media = null
    try {
      media = $app.findRecordById('media_assets', mediaId)
    } catch (_) {
      return e.json(404, {
        success: false,
        error_code: 'MEDIA_NOT_FOUND',
        message: 'Mídia não encontrada.',
      })
    }

    const churchId = media.getString('church_id')
    if (churchIdParam && churchIdParam !== churchId) {
      return e.json(403, {
        success: false,
        error_code: 'CHURCH_MISMATCH',
        message: 'A mídia não pertence à igreja especificada.',
      })
    }

    // 2. Valida permissão do usuário na igreja
    let member = null
    try {
      const records = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: auth.id },
      )
      if (records.length > 0) member = records[0]
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Erro ao verificar membresia: ' + err.message,
      })
    }

    if (!member) {
      return e.json(403, {
        success: false,
        error_code: 'FORBIDDEN_MEMBER',
        message: 'Você não tem permissão ativa nesta congregação.',
      })
    }

    // Validação de autorização: apenas MASTER, ADMIN ou membros com função operacional PROJECAO
    const appRole = member.getString('role') || ''
    const isMaster = appRole === 'MASTER'
    const isAdmin = appRole === 'ADMIN' || isMaster

    let opRoles = []
    try {
      const raw = member.get('operational_roles')
      if (typeof raw === 'string' && raw) {
        opRoles = JSON.parse(raw)
      } else if (Array.isArray(raw)) {
        if (raw.length > 0 && typeof raw[0] === 'number') {
          let str = ''
          for (let b = 0; b < raw.length; b++) str += String.fromCharCode(raw[b])
          opRoles = JSON.parse(str)
        } else {
          opRoles = raw
        }
      }
    } catch (_) {}
    if (!Array.isArray(opRoles)) opRoles = []

    const hasProjectionRole = opRoles.includes('PROJECAO')
    if (!isAdmin && !hasProjectionRole) {
      return e.json(403, {
        success: false,
        error_code: 'FORBIDDEN_PROJECTION_ROLE',
        message:
          'Apenas Administradores ou membros com a função de PROJEÇÃO podem transferir mídias para o computador do Holyrics.',
      })
    }

    // Validação cruzada estrita entre media_type e extensão do arquivo antes de enfileirar comando
    const mediaType = (media.getString('media_type') || 'VIDEO').toUpperCase()
    const rawFileForValidation = media.getString('file') || media.getString('name') || ''
    const extMatchVal = rawFileForValidation.match(/\.([a-zA-Z0-9]+)$/)
    const fileExt = extMatchVal ? extMatchVal[1].toLowerCase() : ''

    const allowedExtsByMediaType = {
      IMAGEM: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
      VIDEO: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'],
      AUDIO: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'flac'],
      DOCUMENTO: ['pdf', 'pptx', 'ppt', 'ppsx', 'pps'],
    }

    if (fileExt && allowedExtsByMediaType[mediaType]) {
      const allowed = allowedExtsByMediaType[mediaType]
      if (!allowed.includes(fileExt)) {
        let suggestion = ''
        if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'].includes(fileExt)) {
          suggestion = ' O arquivo selecionado é um vídeo. Ajuste o tipo para VÍDEO.'
        } else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'flac'].includes(fileExt)) {
          suggestion = ' O arquivo selecionado é um áudio. Ajuste o tipo para ÁUDIO.'
        } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExt)) {
          suggestion = ' O arquivo selecionado é uma imagem. Ajuste o tipo para IMAGEM.'
        }
        return e.json(400, {
          success: false,
          error_code: 'INVALID_FILE_EXTENSION',
          message:
            'Extensão .' +
            fileExt +
            ' incompatível com o tipo ' +
            mediaType +
            '. Extensões permitidas: ' +
            allowed.join(', ') +
            '.' +
            suggestion,
        })
      }
    }

    // 3. Localiza o Agent da igreja
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
        message:
          'Nenhum computador Holyrics pareado com esta igreja. Conecte o Agent em Configurações > Integrações.',
      })
    }

    const agentId = agentRecord.id
    const isOnline = agentRecord.getString('status') === 'ONLINE'

    // 4. Prepara mapeamento de subpasta com base no tipo da mídia
    let subfolder = 'video'
    if (mediaType === 'IMAGEM') {
      subfolder = 'image'
    } else if (mediaType === 'AUDIO') {
      subfolder = 'audio'
    } else if (mediaType === 'DOCUMENTO') {
      subfolder = 'automaticPresentations'
    }
    if (
      targetSubfolderParam &&
      ['image', 'video', 'audio', 'automaticPresentations'].includes(targetSubfolderParam)
    ) {
      subfolder = targetSubfolderParam
    }

    // 5. Controle de Concorrência e Idempotência:
    // Verifica se já existe comando PENDING ou SENT em andamento para esta mídia
    try {
      const existingCmds = $app.findRecordsByFilter(
        'holyrics_commands',
        'agent_id = {:agentId} && action = "TRANSFER_MEDIA" && (status = "PENDING" || status = "SENT")',
        '-created',
        5,
        0,
        { agentId: agentId },
      )

      for (let i = 0; i < existingCmds.length; i++) {
        const cmd = existingCmds[i]
        let p = null
        try {
          const rawP = cmd.get('payload')
          if (typeof rawP === 'string') p = JSON.parse(rawP)
          else p = rawP
        } catch (_) {}

        if (p && p.media_id === mediaId) {
          return e.json(200, {
            success: true,
            pending: true,
            already_enqueued: true,
            agent_online: isOnline,
            command_id: cmd.getString('command_id'),
            message: isOnline
              ? 'Transferência já está na fila de processamento do computador local.'
              : 'Transferência já agendada. Aguardando o computador do Holyrics ficar online.',
          })
        }
      }
    } catch (_) {}

    // 6. Nomenclatura física padronizada:
    // Padrão: Evento - Categoria - DD-MM - Título.extensão
    let holyricsFilename = media.getString('holyrics_filename')
    const originalFile = media.getString('file')
    const originalName = media.getString('name') || originalFile

    if (!holyricsFilename) {
      let eventTitle = 'Evento'
      let eventDayMonth = 'Sem Data'
      const eventId = media.getString('event_id')
      if (eventId) {
        try {
          const evRec = $app.findRecordById('events', eventId)
          if (evRec) {
            eventTitle = evRec.getString('title') || 'Evento'
            const evDate = evRec.getString('date')
            if (evDate) {
              const dtMatch = evDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
              if (dtMatch) {
                eventDayMonth = dtMatch[3] + '-' + dtMatch[2]
              }
            }
          }
        } catch (_) {}
      }

      function sanitizeSegment(str) {
        if (!str) return ''
        var s = String(str)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        s = s.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        s = s.replace(/\s+/g, ' ').trim()
        return s.replace(/^[.\s\-_]+|[.\s\-_]+$/g, '').trim()
      }

      function getCategoryLabel(cat) {
        var c = String(cat || '')
          .toUpperCase()
          .trim()
        var map = {
          AVISOS: 'Avisos',
          ANIVERSARIANTES: 'Aniversariantes',
          AGENDA: 'Agenda',
          CULTOS: 'Cultos',
          EVENTOS: 'Eventos',
          VIDEO_ESPECIAL: 'Video Especial',
          OUTROS: 'Outros',
        }
        return map[c] || (c ? sanitizeSegment(c) : 'Geral')
      }

      var extMatch = originalFile.match(/\.([a-zA-Z0-9]+)$/)
      var ext = extMatch ? extMatch[1].toLowerCase() : ''
      if (!ext && originalName) {
        var matchTitleExt = originalName.match(/\.([a-zA-Z0-9]+)$/)
        if (matchTitleExt) ext = matchTitleExt[1].toLowerCase()
      }

      var titleRaw = (originalName || 'Midia').trim()
      if (ext && titleRaw.toLowerCase().endsWith('.' + ext)) {
        titleRaw = titleRaw.slice(0, -(ext.length + 1)).trim()
      } else {
        var matchExt = titleRaw.match(/\.([a-zA-Z0-9]+)$/)
        if (matchExt && (!ext || matchExt[1].toLowerCase() === ext)) {
          if (!ext) ext = matchExt[1].toLowerCase()
          titleRaw = titleRaw.slice(0, -matchExt[0].length).trim()
        }
      }

      var eventClean = sanitizeSegment(eventTitle) || 'Evento'
      var catClean = getCategoryLabel(media.getString('category'))
      var titleClean = sanitizeSegment(titleRaw || 'Midia') || 'Midia'

      holyricsFilename = eventClean + ' - ' + catClean + ' - ' + eventDayMonth + ' - ' + titleClean
      holyricsFilename = holyricsFilename
        .replace(/\s*-\s*-\s*/g, ' - ')
        .replace(/\s+/g, ' ')
        .trim()
      if (ext && !holyricsFilename.toLowerCase().endsWith('.' + ext)) {
        holyricsFilename += '.' + ext
      }

      try {
        media.set('holyrics_filename', holyricsFilename)
        if (!media.getString('original_filename')) {
          media.set('original_filename', originalFile)
        }
        $app.save(media)
      } catch (_) {}
    }

    // 7. Monta comando TRANSFER_MEDIA
    const commandId = 'cmd_media_' + Date.now() + '_' + $security.randomString(8)
    const cmdCol = $app.findCollectionByNameOrId('holyrics_commands')
    const cmdRec = new Record(cmdCol)

    cmdRec.set('command_id', commandId)
    cmdRec.set('church_id', churchId)
    cmdRec.set('agent_id', agentId)
    cmdRec.set('action', 'TRANSFER_MEDIA')
    cmdRec.set('status', 'PENDING')
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
    cmdRec.set('created_at', nowIso)

    const payload = {
      media_id: mediaId,
      church_id: churchId,
      event_id: media.getString('event_id'),
      name: media.getString('name'),
      file_name: media.getString('file'),
      holyrics_filename: holyricsFilename,
      media_type: mediaType,
      category: media.getString('category'),
      file_size: media.getInt('size'),
      target_subfolder: subfolder,
      download_endpoint: '/backend/v1/agent/media/' + mediaId + '/download',
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

    // Registra na auditoria
    try {
      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('church_id', churchId)
      log.set('user_id', auth.id)
      log.set('action', 'MEDIA_TRANSFER_REQUESTED')
      log.set('entity_type', 'media')
      log.set('entity_id', mediaId)
      log.set('event_id', media.getString('event_id'))
      log.set('details', {
        command_id: commandId,
        agent_id: agentId,
        media_name: media.getString('name'),
        file_name: media.getString('file'),
        target_subfolder: subfolder,
        agent_online: isOnline,
      })
      $app.save(log)
    } catch (_) {}

    return e.json(200, {
      success: true,
      command_id: commandId,
      agent_online: isOnline,
      target_subfolder: subfolder,
      message: isOnline
        ? 'Transferência enviada para o computador do Holyrics.'
        : 'Comando registrado. O download será iniciado assim que o computador do Holyrics conectar.',
    })
  },
  $apis.requireAuth(),
)
