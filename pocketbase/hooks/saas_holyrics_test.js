// Hook para criar comando TEST_CONNECTION e aguardar resultado real (sem mock)
// POST /backend/v1/saas/holyrics/test
// Requer autenticação + perfil MASTER/ADMIN/LIDER (permissão holyrics.view / holyrics.sync)
// Body: { church_id, agent_id }
// Cria comando TEST_CONNECTION na fila holyrics_commands
// Aguarda até ~5s por resposta do Agent via polling curto interno

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/test',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const agentId = String(body.agent_id || '').trim()

    if (!churchId || !agentId) {
      return e.json(400, {
        success: false,
        message: 'church_id e agent_id são obrigatórios.',
      })
    }

    // 1. Validação de perfil (MASTER/ADMIN/LIDER)
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
          message: 'Músicos não possuem permissão para testar agentes.',
        })
      }
    } catch (err) {
      return e.json(500, { success: false, message: 'Erro ao validar perfil.' })
    }

    // 2. Busca agente e garante isolamento multi-tenant
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

    if (agentRecord.getString('church_id') !== churchId) {
      return e.json(403, {
        success: false,
        error_code: 'MULTI_TENANT_VIOLATION',
        message: 'Este agente não pertence à sua congregação.',
      })
    }

    // Verifica se o agente está ONLINE recentemente
    const lastSeenStr = agentRecord.getString('last_seen_at')
    const nowTime = new Date().getTime()
    const isOnline = lastSeenStr && nowTime - new Date(lastSeenStr).getTime() <= 45 * 1000

    if (!isOnline) {
      return e.json(200, {
        success: false,
        agent_online: false,
        holyrics_connected: false,
        error_code: 'AGENT_OFFLINE',
        message:
          '🔴 Holyrics desconectado. Verifique o checklist: 1. O computador está ligado? 2. O aplicativo LouvorFlow Agent está em execução? 3. O Holyrics está aberto? 4. A conexão de internet está ativa?',
      })
    }

    // 3. Cria comando TEST_CONNECTION na fila
    const cmdCol = $app.findCollectionByNameOrId('holyrics_commands')
    const cmdRec = new Record(cmdCol)
    const commandId = 'cmd_' + Date.now() + '_' + $security.randomString(8)
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

    cmdRec.set('command_id', commandId)
    cmdRec.set('church_id', churchId)
    cmdRec.set('agent_id', agentId)
    cmdRec.set('action', 'TEST_CONNECTION')
    cmdRec.set('payload', {})
    cmdRec.set('status', 'PENDING')
    cmdRec.set('created_at', now)

    try {
      $app.save(cmdRec)
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Erro ao criar comando de teste: ' + err.message,
      })
    }

    // 4. Aguarda até 4.5 segundos pela resposta do Agent (polling)
    const startWait = Date.now()
    let finalStatus = 'PENDING'
    let cmdResult = null
    let cmdError = ''

    while (Date.now() - startWait < 4500) {
      try {
        const check = $app.findRecordById('holyrics_commands', cmdRec.id)
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
      $security.randomString(5) // micropausa goja
    }

    if (finalStatus === 'DONE') {
      return e.json(200, {
        success: true,
        agent_online: true,
        holyrics_connected: true,
        result: cmdResult,
        message:
          '🟢 Agent conectado e Holyrics respondendo com sucesso! ' +
          (cmdResult && cmdResult.version ? `(Holyrics v${cmdResult.version})` : ''),
      })
    }

    if (finalStatus === 'FAILED') {
      return e.json(200, {
        success: false,
        agent_online: true,
        holyrics_connected: false,
        error_code: cmdResult?.error_code || 'HOLYRICS_ERROR',
        error: cmdError,
        message: cmdError || 'Agent online, mas Holyrics retornou erro ao responder.',
      })
    }

    // Timeout: comando ainda PENDING ou SENT
    return e.json(200, {
      success: false,
      agent_online: true,
      pending: true,
      command_id: commandId,
      message:
        'O Agent recebeu o comando de teste mas ainda não respondeu a tempo. Verifique se o Holyrics está aberto no computador.',
    })
  },
  $apis.requireAuth(),
)
