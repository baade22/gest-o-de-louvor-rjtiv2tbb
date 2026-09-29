// Hook para listar agentes e seus status em tempo real
// GET /backend/v1/saas/holyrics/agents?church_id=...
// Requer autenticação de usuário

routerAdd(
  'GET',
  '/backend/v1/saas/holyrics/agents',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    let churchId = ''
    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        churchId = String(e.request.url.query().get('church_id') || '').trim()
      }
    } catch (_) {}
    if (!churchId) {
      try {
        const q = e.requestInfo ? e.requestInfo().query : null
        if (q && q.church_id) churchId = String(q.church_id).trim()
      } catch (_) {}
    }

    if (!churchId) {
      return e.json(400, { success: false, message: 'church_id é obrigatório.' })
    }

    // Valida membresia
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
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao validar perfil.' })
    }

    // Busca agentes desta congregação
    const nowTime = new Date().getTime()
    // Considerado ONLINE se last_seen_at foi há menos de 45 segundos e tem paired_at
    const ONLINE_THRESHOLD_MS = 45 * 1000

    let agentsList = []
    try {
      const records = $app.findRecordsByFilter(
        'holyrics_agents',
        'church_id = {:churchId}',
        '-paired_at,-created',
        50,
        0,
        { churchId: churchId },
      )

      for (let i = 0; i < records.length; i++) {
        const rec = records[i]
        const lastSeenStr = rec.getString('last_seen_at')
        let isOnline = false

        if (lastSeenStr) {
          const lastSeenTime = new Date(lastSeenStr).getTime()
          if (nowTime - lastSeenTime <= ONLINE_THRESHOLD_MS && rec.getString('paired_at')) {
            isOnline = true
          }
        }

        // Se mudou para offline, atualiza o status se necessário
        if (!isOnline && rec.getString('status') === 'ONLINE') {
          rec.set('status', 'OFFLINE')
          try {
            $app.save(rec)
          } catch (_) {}
        }

        agentsList.push({
          id: rec.id,
          name: rec.getString('name'),
          machine_name: rec.getString('machine_name'),
          platform: rec.getString('platform'),
          version: rec.getString('version'),
          status: isOnline ? 'ONLINE' : 'OFFLINE',
          last_seen_at: lastSeenStr,
          paired_at: rec.getString('paired_at'),
          holyrics_detected: rec.getBool('holyrics_detected'),
          holyrics_version: rec.getString('holyrics_version'),
          api_port: rec.getInt('api_port') || 8091,
          has_pairing_code: Boolean(rec.getString('pairing_code')),
          pairing_code: rec.getString('pairing_code'),
          pairing_expires_at: rec.getString('pairing_expires_at'),
        })
      }
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Erro ao listar agentes: ' + err.message,
      })
    }

    return e.json(200, {
      success: true,
      agents: agentsList,
    })
  },
  $apis.requireAuth(),
)
