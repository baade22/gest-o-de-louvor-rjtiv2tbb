// Hook para geração de código de pareamento temporário no SaaS
// POST /backend/v1/saas/holyrics/pairing-code
// Requer autenticação de usuário + permissão holyrics.sync ou holyrics.view (MASTER/ADMIN/LIDER)
// Body: { church_id, agent_name? }
// Retorna: { pairing_code: "123 456", expires_at, agent_id }

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/pairing-code',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const agentName = String(body.agent_name || 'PC Projeção Holyrics').trim()

    if (!churchId) {
      return e.json(400, { success: false, message: 'church_id é obrigatório.' })
    }

    // 1. Validação de membresia e permissão (holyrics.sync ou holyrics.view)
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
          message: 'Músicos não possuem permissão para gerenciar agentes Holyrics.',
        })
      }
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao validar perfil: ' + err.message })
    }

    // 2. Gera código numérico de 6 dígitos aleatório (ex: 847291)
    let codeStr = ''
    for (let i = 0; i < 6; i++) {
      codeStr += Math.floor(Math.random() * 10).toString()
    }

    // Expira em 10 minutos
    const expiresDate = new Date(Date.now() + 10 * 60 * 1000)
    const expiresAtIso = expiresDate.toISOString().replace('T', ' ').substring(0, 19)
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)

    // Cria registro de holyrics_agents aguardando pareamento
    const agentsCol = $app.findCollectionByNameOrId('holyrics_agents')
    const agentRec = new Record(agentsCol)
    agentRec.set('church_id', churchId)
    agentRec.set('name', agentName)
    agentRec.set('status', 'OFFLINE')
    agentRec.set('pairing_code', codeStr)
    agentRec.set('pairing_expires_at', expiresAtIso)
    agentRec.set('holyrics_detected', false)
    agentRec.set('api_port', 8091)

    try {
      $app.save(agentRec)
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Erro ao registrar código de pareamento: ' + err.message,
      })
    }

    // Formata com espaço para leitura amigável ("847 291")
    const formattedCode = codeStr.substring(0, 3) + ' ' + codeStr.substring(3)

    return e.json(200, {
      success: true,
      agent_id: agentRec.id,
      pairing_code: formattedCode,
      raw_code: codeStr,
      expires_at: expiresAtIso,
      message: 'Código gerado com sucesso. Válido por 10 minutos.',
    })
  },
  $apis.requireAuth(),
)
