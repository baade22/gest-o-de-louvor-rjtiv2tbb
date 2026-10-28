// Hook para excluir computadores (agentes Holyrics) de uma congregação
// POST /backend/v1/saas/holyrics/agents/delete
// Requer autenticação de usuário MASTER ou ADMIN da congregação
// Body: { church_id, agent_ids: string[] }
// Os comandos pendentes do agente são apagados junto (cascadeDelete); o histórico
// de envios (holyrics_sync_logs) é mantido, só perde o vínculo com o computador.

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/agents/delete',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const rawIds = Array.isArray(body.agent_ids) ? body.agent_ids : []
    const agentIds = []
    for (let i = 0; i < rawIds.length; i++) {
      const id = String(rawIds[i] || '').trim()
      if (id && agentIds.indexOf(id) === -1) agentIds.push(id)
    }

    if (!churchId) {
      return e.json(400, { success: false, message: 'church_id é obrigatório.' })
    }
    if (agentIds.length === 0) {
      return e.json(400, { success: false, message: 'Informe ao menos um computador.' })
    }
    if (agentIds.length > 100) {
      return e.json(400, { success: false, message: 'Exclua no máximo 100 por vez.' })
    }

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
      const rolePerms = (() => {
        try {
          return JSON.parse(memberships[0].getString('permissions') || '[]') || []
        } catch (_) {
          return []
        }
      })()
      if (role !== 'MASTER' && rolePerms.indexOf('culto.computadores.excluir') === -1) {
        return e.json(403, {
          success: false,
          error_code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Só administradores podem excluir computadores.',
        })
      }
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao validar perfil: ' + err.message })
    }

    let deleted = 0
    const notFound = []
    for (let i = 0; i < agentIds.length; i++) {
      let rec = null
      try {
        rec = $app.findRecordById('holyrics_agents', agentIds[i])
      } catch (_) {}
      // Só apaga agentes desta congregação
      if (!rec || rec.getString('church_id') !== churchId) {
        notFound.push(agentIds[i])
        continue
      }
      try {
        const logs = $app.findRecordsByFilter(
          'holyrics_sync_logs',
          'agent_id = {:agentId}',
          '',
          0,
          0,
          { agentId: rec.id },
        )
        for (let j = 0; j < logs.length; j++) {
          logs[j].set('agent_id', '')
          $app.save(logs[j])
        }
        $app.delete(rec)
        deleted++
      } catch (err) {
        return e.json(500, {
          success: false,
          deleted: deleted,
          message: 'Erro ao excluir computador: ' + err.message,
        })
      }
    }

    return e.json(200, { success: true, deleted: deleted, not_found: notFound })
  },
  $apis.requireAuth(),
)

// POST /backend/v1/saas/holyrics/agents/rename
// Body: { church_id, agent_id, name }. MASTER ou culto.computadores.parear.
routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/agents/rename',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const agentId = String(body.agent_id || '').trim()
    const name = String(body.name || '').trim()

    if (!churchId || !agentId) {
      return e.json(400, { success: false, message: 'church_id e agent_id são obrigatórios.' })
    }
    if (!name || name.length > 80) {
      return e.json(400, { success: false, message: 'Informe um nome de até 80 caracteres.' })
    }

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
      const rolePerms = (() => {
        try {
          return JSON.parse(memberships[0].getString('permissions') || '[]') || []
        } catch (_) {
          return []
        }
      })()
      if (role !== 'MASTER' && rolePerms.indexOf('culto.computadores.parear') === -1) {
        return e.json(403, {
          success: false,
          error_code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Seu perfil de acesso não permite gerenciar os computadores.',
        })
      }
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao validar perfil: ' + err.message })
    }

    let rec = null
    try {
      rec = $app.findRecordById('holyrics_agents', agentId)
    } catch (_) {}
    if (!rec || rec.getString('church_id') !== churchId) {
      return e.json(404, { success: false, message: 'Computador não encontrado.' })
    }

    rec.set('name', name)
    try {
      $app.save(rec)
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao renomear: ' + err.message })
    }
    return e.json(200, { success: true, name: name })
  },
  $apis.requireAuth(),
)
