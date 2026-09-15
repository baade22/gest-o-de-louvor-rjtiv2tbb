// Hook para listar integrações por congregação com credenciais mascaradas
// GET /backend/v1/integrations?church_id=... (requer autenticação e perfil ADMIN)

routerAdd(
  'GET',
  '/backend/v1/integrations',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const churchId = e.request.url.query().get('church_id') || ''
    if (!churchId) {
      return e.json(400, { message: 'church_id é obrigatório' })
    }

    // 1. Valida se o usuário é ADMIN da igreja
    try {
      const userMemberships = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: authRecord.id },
      )

      if (userMemberships.length === 0) {
        return e.json(403, { message: 'Acesso negado a esta congregação' })
      }

      const role = userMemberships[0].getString('role')
      if (role !== 'ADMIN') {
        return e.json(403, { message: 'Apenas administradores podem gerenciar integrações' })
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

    // 2. Busca integrações da congregação
    try {
      const records = $app.findRecordsByFilter(
        'integrations',
        'church_id = {:churchId}',
        '-created',
        50,
        0,
        { churchId: churchId },
      )

      const result = []
      for (let i = 0; i < records.length; i++) {
        const rec = records[i]

        // Leitura ultra-robusta de campo JSON no PocketBase Goja runtime
        let creds = null

        // Tentativa 1: getString (PocketBase converte JSON/bytes nativamente para string JSON)
        try {
          const str = rec.getString('credentials')
          if (str && typeof str === 'string') {
            const parsed = JSON.parse(str)
            creds = parsed
            if (typeof creds === 'string') {
              creds = JSON.parse(creds)
            }
          }
        } catch (_) {}

        // Tentativa 2: get() caso retorne objeto direto ou array de bytes (Goja []byte / Uint8Array)
        if (!creds || typeof creds !== 'object') {
          try {
            const raw = rec.get('credentials')
            if (raw && typeof raw === 'object') {
              if (Array.isArray(raw)) {
                // Byte array UTF-8 para string
                let byteStr = ''
                for (let b = 0; b < raw.length; b++) {
                  byteStr += String.fromCharCode(raw[b])
                }
                const parsed = JSON.parse(byteStr)
                creds = parsed
                if (typeof creds === 'string') {
                  creds = JSON.parse(creds)
                }
              } else {
                creds = raw
              }
            } else if (typeof raw === 'string' && raw) {
              const parsed = JSON.parse(raw)
              creds = parsed
              if (typeof creds === 'string') {
                creds = JSON.parse(creds)
              }
            }
          } catch (_) {}
        }

        let hasApiKey = false
        let maskedApiKey = ''
        let foundKey = ''

        if (creds && typeof creds === 'object') {
          if (creds.apiKey) {
            foundKey = String(creds.apiKey).trim()
          } else if (creds.key) {
            foundKey = String(creds.key).trim()
          }
        }

        if (foundKey) {
          hasApiKey = true
          if (foundKey.length > 8) {
            maskedApiKey =
              foundKey.substring(0, 4) +
              '••••••••••••••••' +
              foundKey.substring(foundKey.length - 4)
          } else {
            maskedApiKey = '••••••••••••••••'
          }
        }

        // Leitura de configuration com o mesmo padrão seguro
        let conf = {}
        try {
          const confStr = rec.getString('configuration')
          if (confStr) {
            conf = JSON.parse(confStr)
          }
        } catch (_) {
          conf = rec.get('configuration') || {}
        }

        result.push({
          id: rec.id,
          church_id: rec.getString('church_id'),
          provider: rec.getString('provider'),
          name: rec.getString('name'),
          enabled: rec.getBool('enabled'),
          status: rec.getString('status') || 'DISCONNECTED',
          last_tested_at: rec.getString('last_tested_at') || null,
          last_error_message: rec.getString('last_error_message') || '',
          configuration: conf || {},
          has_credentials: hasApiKey,
          masked_key: maskedApiKey,
          created: rec.getString('created'),
          updated: rec.getString('updated'),
        })
      }

      return e.json(200, { items: result })
    } catch (err) {
      return e.json(500, { message: 'Erro ao listar integrações: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
