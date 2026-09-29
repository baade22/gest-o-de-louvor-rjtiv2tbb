// Hook para o Agent buscar comandos pendentes
// POST /backend/v1/agent/commands/poll
// Autenticado por x-agent-token
// Body: { agent_id }
// Retorna lista de comandos pendentes atribuídos a este agent_id e marca como SENT

routerAdd('POST', '/backend/v1/agent/commands/poll', (e) => {
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

  const body = e.requestInfo().body || {}
  const agentId = String(body.agent_id || '').trim()
  if (!rawToken || !agentId) {
    return e.json(401, {
      success: false,
      error_code: 'UNAUTHORIZED_AGENT',
      message: 'Token de agente e agent_id são obrigatórios.',
    })
  }

  let agentRecord = null
  try {
    agentRecord = $app.findRecordById('holyrics_agents', agentId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error_code: 'AGENT_NOT_FOUND',
      message: 'Agente não encontrado.',
    })
  }

  const expectedHash = agentRecord.getString('agent_token')
  const incomingHash = $security.sha256(rawToken)
  if (!expectedHash || expectedHash !== incomingHash) {
    return e.json(403, {
      success: false,
      error_code: 'INVALID_AGENT_TOKEN',
      message: 'Token de agente inválido.',
    })
  }

  // Atualiza last_seen_at
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  agentRecord.set('status', 'ONLINE')
  agentRecord.set('last_seen_at', now)
  try {
    $app.save(agentRecord)
  } catch (_) {}

  // Recuperação de comandos órfãos:
  // Comandos deste agent com status='SENT', result vazio/nulo e criados há mais de 60 segundos
  // voltam para PENDING para serem reentregues ao Agent
  try {
    const sixtySecsAgo = new Date(Date.now() - 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19)
    const orphanRecords = $app.findRecordsByFilter(
      'holyrics_commands',
      'agent_id = {:agentId} && status = "SENT" && created < {:cutoff}',
      'created',
      20,
      0,
      { agentId: agentId, cutoff: sixtySecsAgo },
    )

    for (let j = 0; j < orphanRecords.length; j++) {
      const orphan = orphanRecords[j]
      const rawRes = orphan.get('result')
      const hasResult =
        rawRes !== null && rawRes !== undefined && rawRes !== '' && rawRes !== 'null'
      if (!hasResult) {
        orphan.set('status', 'PENDING')
        try {
          $app.save(orphan)
        } catch (_) {}
      }
    }
  } catch (errOrphan) {
    // Continua para o poll normal mesmo se busca de órfãos falhar
  }

  // Busca comandos PENDING para este agent_id
  let commands = []
  try {
    const records = $app.findRecordsByFilter(
      'holyrics_commands',
      'agent_id = {:agentId} && status = "PENDING"',
      'created',
      20,
      0,
      { agentId: agentId },
    )

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      let payloadData = null
      try {
        const pRaw = rec.get('payload')
        if (typeof pRaw === 'string') {
          payloadData = JSON.parse(pRaw)
        } else if (Array.isArray(pRaw)) {
          let s = ''
          for (let b = 0; b < pRaw.length; b++) s += String.fromCharCode(pRaw[b])
          payloadData = JSON.parse(s)
        } else {
          payloadData = pRaw
        }
      } catch (_) {}

      commands.push({
        id: rec.id,
        command_id: rec.getString('command_id'),
        action: rec.getString('action'),
        payload: payloadData || {},
        created_at: rec.getString('created_at'),
      })

      // Marca status como SENT para evitar envio repetido
      rec.set('status', 'SENT')
      try {
        $app.save(rec)
      } catch (_) {}
    }
  } catch (err) {
    return e.json(500, {
      success: false,
      error_code: 'POLL_ERROR',
      message: 'Erro ao buscar comandos: ' + err.message,
    })
  }

  return e.json(200, {
    success: true,
    commands: commands,
  })
})
