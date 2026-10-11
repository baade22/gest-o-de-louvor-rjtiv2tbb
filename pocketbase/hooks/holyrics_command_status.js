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

    // Helper para decodificar Goja byte arrays UTF-8 multibyte
    const decodeUtf8Bytes = (bytes) => {
      if (!Array.isArray(bytes) || bytes.length === 0) return ''
      let out = ''
      let i = 0
      const len = bytes.length
      while (i < len) {
        const c = bytes[i++] & 0xff
        if (c <= 0x7f) {
          out += String.fromCharCode(c)
        } else if ((c & 0xe0) === 0xc0) {
          if (i < len) {
            const c2 = bytes[i++] & 0xff
            const cp = ((c & 0x1f) << 6) | (c2 & 0x3f)
            out += String.fromCharCode(cp)
          } else {
            out += String.fromCharCode(c)
          }
        } else if ((c & 0xf0) === 0xe0) {
          if (i + 1 < len) {
            const c2 = bytes[i++] & 0xff
            const c3 = bytes[i++] & 0xff
            const cp = ((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f)
            out += String.fromCharCode(cp)
          } else {
            out += String.fromCharCode(c)
          }
        } else if ((c & 0xf8) === 0xf0) {
          if (i + 2 < len) {
            const c2 = bytes[i++] & 0xff
            const c3 = bytes[i++] & 0xff
            const c4 = bytes[i++] & 0xff
            let cp = ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)
            if (cp > 0xffff) {
              cp -= 0x10000
              out += String.fromCharCode(0xd800 + (cp >> 10))
              out += String.fromCharCode(0xdc00 + (cp & 0x3ff))
            } else {
              out += String.fromCharCode(cp)
            }
          } else {
            out += String.fromCharCode(c)
          }
        } else {
          out += String.fromCharCode(c)
        }
      }
      return out
    }

    let parsedResult = null
    try {
      const rawRes = cmdRecord.get('result')
      if (typeof rawRes === 'string') {
        parsedResult = JSON.parse(rawRes)
      } else if (Array.isArray(rawRes)) {
        const s = decodeUtf8Bytes(rawRes)
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
