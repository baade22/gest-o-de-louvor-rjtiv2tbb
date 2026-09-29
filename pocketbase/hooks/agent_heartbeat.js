// Hook para heartbeat periódico do Agent
// POST /backend/v1/agent/heartbeat
// Autenticado por x-agent-token ou Bearer token
// Body: { agent_id, version?, holyrics_detected, holyrics_version?, api_port? }
// Atualiza status ONLINE, last_seen_at, holyrics_detected, etc.

routerAdd('POST', '/backend/v1/agent/heartbeat', (e) => {
  // Extrai token do header
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

  // Valida hash do token
  const expectedHash = agentRecord.getString('agent_token')
  const incomingHash = $security.sha256(rawToken)
  if (!expectedHash || expectedHash !== incomingHash) {
    return e.json(403, {
      success: false,
      error_code: 'INVALID_AGENT_TOKEN',
      message: 'Token de agente inválido.',
    })
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  agentRecord.set('status', 'ONLINE')
  agentRecord.set('last_seen_at', now)

  if (typeof body.holyrics_detected === 'boolean') {
    agentRecord.set('holyrics_detected', body.holyrics_detected)
  }
  if (body.holyrics_version) {
    agentRecord.set('holyrics_version', String(body.holyrics_version))
  }
  if (body.version) {
    agentRecord.set('version', String(body.version))
  }
  if (body.api_port) {
    agentRecord.set('api_port', Number(body.api_port))
  }

  try {
    $app.save(agentRecord)
  } catch (err) {
    return e.json(500, {
      success: false,
      error_code: 'SAVE_ERROR',
      message: 'Erro ao registrar heartbeat: ' + err.message,
    })
  }

  return e.json(200, {
    success: true,
    status: 'ONLINE',
    server_time: now,
  })
})
