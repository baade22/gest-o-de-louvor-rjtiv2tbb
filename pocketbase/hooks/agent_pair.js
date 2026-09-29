// Hook para pareamento de Agent com LouvorFlow
// POST /backend/v1/agent/pair
// Público autenticado pelo pairing_code de uso único gerado no SaaS
// Recebe: { pairing_code, machine_name, platform, version, api_port? }
// Retorna: { agent_id, agent_token, church_id, church_name, name }

routerAdd('POST', '/backend/v1/agent/pair', (e) => {
  const body = e.requestInfo().body || {}
  const rawCode = String(body.pairing_code || '')
    .replace(/\s+/g, '')
    .trim()
  const machineName = String(body.machine_name || 'Computador da Igreja').trim()
  const platform = String(body.platform || 'unknown').trim()
  const version = String(body.version || '0.0.15').trim()
  const apiPort = Number(body.api_port) || 8091

  if (!rawCode || rawCode.length < 6) {
    return e.json(400, {
      success: false,
      error_code: 'INVALID_PAIRING_CODE',
      message: 'Código de pareamento inválido ou não informado. Gere um novo código no LouvorFlow.',
    })
  }

  // Busca agente com pairing_code correspondente
  let agentRecord = null
  try {
    const agents = $app.findRecordsByFilter(
      'holyrics_agents',
      'pairing_code = {:code}',
      '-created',
      1,
      0,
      { code: rawCode },
    )
    if (agents.length > 0) {
      agentRecord = agents[0]
    }
  } catch (err) {
    return e.json(500, {
      success: false,
      error_code: 'DATABASE_ERROR',
      message: 'Erro ao buscar código de pareamento: ' + err.message,
    })
  }

  if (!agentRecord) {
    return e.json(404, {
      success: false,
      error_code: 'PAIRING_CODE_NOT_FOUND',
      message: 'Código de pareamento não encontrado ou já utilizado. Gere um novo no LouvorFlow.',
    })
  }

  // Valida expiração
  const expiresAtStr = agentRecord.getString('pairing_expires_at')
  if (expiresAtStr) {
    const expiresAt = new Date(expiresAtStr).getTime()
    const nowTime = new Date().getTime()
    if (nowTime > expiresAt) {
      // Expirou
      agentRecord.set('pairing_code', '')
      $app.save(agentRecord)
      return e.json(410, {
        success: false,
        error_code: 'PAIRING_CODE_EXPIRED',
        message: 'Código de pareamento expirado. Gere um novo código na Central de Integrações.',
      })
    }
  }

  // Gera novo agent_token (secreto aleatório de 48 caracteres) e armazena sha256 no banco
  const plainToken = $security.randomString(48)
  const tokenHash = $security.sha256(plainToken)
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

  agentRecord.set('machine_name', machineName)
  agentRecord.set('platform', platform)
  agentRecord.set('version', version)
  agentRecord.set('api_port', apiPort)
  agentRecord.set('agent_token', tokenHash)
  agentRecord.set('status', 'ONLINE')
  agentRecord.set('last_seen_at', now)
  agentRecord.set('paired_at', now)
  agentRecord.set('pairing_code', '') // invalida código após uso único
  agentRecord.set('pairing_expires_at', null)

  try {
    $app.save(agentRecord)
  } catch (saveErr) {
    return e.json(500, {
      success: false,
      error_code: 'SAVE_ERROR',
      message: 'Erro ao salvar pareamento: ' + saveErr.message,
    })
  }

  let churchName = 'Igreja'
  try {
    const ch = $app.findRecordById('churches', agentRecord.getString('church_id'))
    if (ch) churchName = ch.getString('name')
  } catch (_) {}

  return e.json(200, {
    success: true,
    agent_id: agentRecord.id,
    agent_token: plainToken,
    church_id: agentRecord.getString('church_id'),
    church_name: churchName,
    name: agentRecord.getString('name'),
    message: 'Pareamento realizado com sucesso!',
  })
})
