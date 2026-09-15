// Hook para salvar credenciais de integração por congregação
// POST /backend/v1/integrations/save
// Body: { church_id, provider, apiKey, name, configuration }
// Somente ADMIN da congregação pode salvar. As credenciais são salvas no banco.

routerAdd(
  'POST',
  '/backend/v1/integrations/save',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const churchId = body.church_id || ''
    const provider = body.provider || ''
    const apiKey = body.apiKey || ''
    const name = body.name || provider
    const configuration = body.configuration || {}

    if (!churchId || !provider) {
      return e.json(400, { message: 'church_id e provider são obrigatórios' })
    }

    // 1. Validação de perfil ADMIN do usuário nesta igreja
    try {
      const userMemberships = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: authRecord.id },
      )

      if (userMemberships.length === 0 || userMemberships[0].getString('role') !== 'ADMIN') {
        return e.json(403, { message: 'Apenas administradores podem configurar integrações' })
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

    // 2. Localiza ou cria o registro de integração
    try {
      let record
      const existing = $app.findRecordsByFilter(
        'integrations',
        'church_id = {:churchId} && provider = {:provider}',
        '',
        1,
        0,
        { churchId: churchId, provider: provider },
      )

      const col = $app.findCollectionByNameOrId('integrations')

      if (existing.length > 0) {
        record = existing[0]
      } else {
        record = new Record(col)
        record.set('church_id', churchId)
        record.set('provider', provider)
      }

      record.set('name', name)
      record.set('enabled', true)

      // Atualiza credentials se fornecido apiKey (armazenado como objeto JSON canônico)
      if (apiKey) {
        const cleanKey = String(apiKey).trim()
        record.set('credentials', { apiKey: cleanKey })
      }
      if (configuration) {
        record.set('configuration', configuration)
      }

      $app.save(record)

      let maskedApiKey = ''
      const keyStr = apiKey ? String(apiKey).trim() : ''
      if (keyStr.length > 8) {
        maskedApiKey =
          keyStr.substring(0, 4) + '••••••••••••••••' + keyStr.substring(keyStr.length - 4)
      } else if (keyStr) {
        maskedApiKey = '••••••••••••••••'
      }

      return e.json(200, {
        success: true,
        message: 'Integração salva com sucesso',
        integration: {
          id: record.id,
          church_id: churchId,
          provider: provider,
          name: name,
          enabled: true,
          status: record.getString('status') || 'DISCONNECTED',
          last_tested_at: record.getString('last_tested_at') || null,
          has_credentials: true,
          masked_key: maskedApiKey,
        },
      })
    } catch (err) {
      return e.json(500, { message: 'Erro ao salvar integração: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
