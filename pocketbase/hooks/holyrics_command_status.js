// Hook para consultar status assíncrono de um comando do Holyrics
// GET /backend/v1/holyrics/commands/{command_id}/status
// Autenticado: requer login ativo e membro com permissão da mesma igreja do comando (multi-tenant seguro)
// Retorna { success: true, status, result, error, action, command_id }

routerAdd(
  'GET',
  '/backend/v1/holyrics/commands/{command_id}/status',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { success: false, message: 'Não autorizado.' })
    }

    let rawParam = ''
    try {
      if (e.request && typeof e.request.pathValue === 'function') {
        rawParam = e.request.pathValue('command_id')
      }
    } catch (_) {}

    if (!rawParam) {
      try {
        const reqInfo = e.requestInfo ? e.requestInfo() : null
        if (reqInfo && reqInfo.pathParams && reqInfo.pathParams['command_id']) {
          rawParam = reqInfo.pathParams['command_id']
        }
      } catch (_) {}
    }

    if (!rawParam) {
      try {
        const urlPath = String(e.request?.url?.path || e.request?.url || '')
        const match = urlPath.match(/\/backend\/v1\/holyrics\/commands\/([^/?#]+)\/status/)
        if (match && match[1]) {
          rawParam = decodeURIComponent(match[1])
        }
      } catch (_) {}
    }

    const commandIdParam = String(rawParam || '').trim()
    if (!commandIdParam) {
      return e.json(400, { success: false, message: 'command_id é obrigatório.' })
    }

    // Busca o comando pelo id ou command_id
    let cmdRecord = null
    try {
      cmdRecord = $app.findRecordById('holyrics_commands', commandIdParam)
    } catch (_) {
      try {
        const filterRes = $app.findRecordsByFilter(
          'holyrics_commands',
          'command_id = {:cid}',
          '',
          1,
          0,
          { cid: commandIdParam },
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

    const cmdChurchId = cmdRecord.getString('church_id')

    // Validação estrita multi-tenant: o usuário precisa ser membro ativo da igreja do comando
    try {
      const memberships = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: cmdChurchId, userId: authRecord.id },
      )
      if (memberships.length === 0) {
        return e.json(403, {
          success: false,
          error_code: 'MULTI_TENANT_VIOLATION',
          message: 'Acesso negado: o comando pertence a outra congregação.',
        })
      }
    } catch (err) {
      return e.json(500, {
        success: false,
        message: 'Erro ao validar pertinência da congregação: ' + err.message,
      })
    }

    let parsedResult = null
    try {
      const rawRes = cmdRecord.get('result')
      if (typeof rawRes === 'string') {
        parsedResult = JSON.parse(rawRes)
      } else if (Array.isArray(rawRes)) {
        let s = ''
        for (let b = 0; b < rawRes.length; b++) s += String.fromCharCode(rawRes[b])
        parsedResult = JSON.parse(s)
      } else {
        parsedResult = rawRes
      }
    } catch (_) {}

    return e.json(200, {
      success: true,
      command_id: cmdRecord.getString('command_id'),
      action: cmdRecord.getString('action'),
      status: cmdRecord.getString('status'),
      result: parsedResult,
      error: cmdRecord.getString('error'),
      created_at: cmdRecord.getString('created_at'),
      executed_at: cmdRecord.getString('executed_at'),
    })
  },
  $apis.requireAuth(),
)
