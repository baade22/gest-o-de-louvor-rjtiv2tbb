// Hook para o Agent retornar o resultado de execução de um comando
// POST /backend/v1/agent/commands/:id/result
// Autenticado por x-agent-token
// Body: { command_id, status: 'DONE' | 'FAILED', result?, error? }

routerAdd('POST', '/backend/v1/agent/commands/{id}/result', (e) => {
  let rawToken = ''
  try {
    const authHeader = String(e.request.header.get('x-agent-token') || '').trim()
    if (authHeader) {
      rawToken = authHeader
    } else {
      const bearer = String(e.request.header.get('authorization') || '').trim()
      if (bearer.toLowerCase().startsWith('bearer ')) {
        rawToken = bearer.substring(7).trim()
      }
    }
  } catch (_) {}

  let rawParam = ''
  try {
    if (e.request && typeof e.request.pathValue === 'function') {
      rawParam = e.request.pathValue('id')
    }
  } catch (_) {}

  if (!rawParam) {
    try {
      const reqInfo = e.requestInfo ? e.requestInfo() : null
      if (reqInfo && reqInfo.pathParams && reqInfo.pathParams['id']) {
        rawParam = reqInfo.pathParams['id']
      }
    } catch (_) {}
  }

  if (!rawParam) {
    try {
      const urlPath = String(e.request?.url?.path || e.request?.url || '')
      const match = urlPath.match(/\/backend\/v1\/agent\/commands\/([^/?#]+)\/result/)
      if (match && match[1]) {
        rawParam = decodeURIComponent(match[1])
      }
    } catch (_) {}
  }

  const paramId = String(rawParam || '').trim()
  const body = e.requestInfo().body || {}
  const status = String(body.status || 'DONE').toUpperCase()
  const result = body.result || null
  const errorMsg = String(body.error || '')

  if (!rawToken) {
    return e.json(401, {
      success: false,
      error_code: 'UNAUTHORIZED_AGENT',
      message: 'Token de agente é obrigatório.',
    })
  }

  // Busca comando pelo paramId (id ou command_id)
  let cmdRecord = null
  try {
    cmdRecord = $app.findRecordById('holyrics_commands', paramId)
  } catch (_) {
    try {
      const filterRes = $app.findRecordsByFilter(
        'holyrics_commands',
        'command_id = {:cid}',
        '',
        1,
        0,
        { cid: paramId },
      )
      if (filterRes.length > 0) {
        cmdRecord = filterRes[0]
      }
    } catch (_) {}
  }

  if (!cmdRecord) {
    return e.json(404, {
      success: false,
      error_code: 'COMMAND_NOT_FOUND',
      message: 'Comando não encontrado.',
    })
  }

  // Valida que o agente que está reportando é o dono do comando
  const agentId = cmdRecord.getString('agent_id')
  let agentRecord = null
  try {
    agentRecord = $app.findRecordById('holyrics_agents', agentId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error_code: 'AGENT_NOT_FOUND',
      message: 'Agente vinculado ao comando não encontrado.',
    })
  }

  const expectedHash = agentRecord.getString('agent_token')
  const incomingHash = $security.sha256(rawToken)
  if (!expectedHash || expectedHash !== incomingHash) {
    return e.json(403, {
      success: false,
      error_code: 'INVALID_AGENT_TOKEN',
      message: 'Token de agente não corresponde ao responsável pelo comando.',
    })
  }

  // Idempotência: se já estava DONE ou FAILED, não reexecuta nem sobrescreve
  const currentStatus = cmdRecord.getString('status')
  if (currentStatus === 'DONE' || currentStatus === 'FAILED') {
    return e.json(200, {
      success: true,
      already_processed: true,
      status: currentStatus,
      message: 'Resultado já gravado anteriormente (idempotente).',
    })
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  cmdRecord.set('status', status === 'FAILED' ? 'FAILED' : 'DONE')
  cmdRecord.set('executed_at', now)
  if (result) {
    cmdRecord.set('result', result)
  }
  if (errorMsg) {
    cmdRecord.set('error', errorMsg)
  }

  try {
    $app.save(cmdRecord)
  } catch (err) {
    return e.json(500, {
      success: false,
      error_code: 'SAVE_ERROR',
      message: 'Erro ao salvar resultado do comando: ' + err.message,
    })
  }

  // Se for comando de criação ou playlist, registra em holyrics_sync_logs e atualiza vínculos se necessário
  try {
    const action = cmdRecord.getString('action')
    let p = null
    try {
      const rawP = cmdRecord.get('payload')
      p = typeof rawP === 'string' ? JSON.parse(rawP) : rawP
    } catch (_) {}

    if (action === 'CREATE_SONG' && status === 'DONE') {
      let createdHolyricsId = ''
      if (result && typeof result === 'object' && result.holyrics_song_id) {
        createdHolyricsId = String(result.holyrics_song_id)
      }
      if (p && p.song_id && createdHolyricsId) {
        try {
          const songRec = $app.findRecordById('songs', p.song_id)
          if (!songRec.getString('holyrics_song_id')) {
            songRec.set('holyrics_song_id', createdHolyricsId)
            $app.save(songRec)
          }
        } catch (_) {}
      }
    }

    if (
      action === 'ADD_TO_PLAYLIST' ||
      action === 'ADD_LYRICS_TO_PLAYLIST' ||
      action === 'CREATE_SONG'
    ) {
      const logsCol = $app.findCollectionByNameOrId('holyrics_sync_logs')
      const logRec = new Record(logsCol)
      logRec.set('church_id', cmdRecord.getString('church_id'))
      logRec.set('agent_id', agentId)
      logRec.set('action', action)
      logRec.set('status', status === 'FAILED' ? 'ERROR' : 'SUCCESS')
      logRec.set('error', errorMsg)
      logRec.set('created_at', now)

      if (p && p.song_id) logRec.set('song_id', p.song_id)
      if (p && (p.holyrics_song_id || p.id)) {
        logRec.set('holyrics_song_id', String(p.holyrics_song_id || p.id))
      } else if (result && result.holyrics_song_id) {
        logRec.set('holyrics_song_id', String(result.holyrics_song_id))
      }
      if (p && p.event_id) logRec.set('event_id', p.event_id)

      $app.save(logRec)
    }
  } catch (_) {}

  return e.json(200, {
    success: true,
    status: cmdRecord.getString('status'),
    command_id: cmdRecord.getString('command_id'),
    message: 'Resultado processado com sucesso.',
  })
})
