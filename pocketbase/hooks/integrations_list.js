// Hook para gerenciar integrações por igreja
// GET  /backend/v1/integrations?church_id=... -> Retorna status das integrações (COM CREDENCIAIS MASCARADAS)
// POST /backend/v1/integrations/save -> Salva/atualiza credenciais (somente ADMIN da igreja)
// POST /backend/v1/integrations/test -> Testa a credencial contra a API externa real
// POST /backend/v1/integrations/disconnect -> Desativa/remove a integração

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

    // Valida se o usuário é ADMIN da igreja
    try {
      const membership = $app.findFirstRecordByData('church_members', 'church_id', churchId)
      // Buscar associação exata do usuário logado nesta igreja
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

    // Busca integrações da igreja
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
        const creds = rec.get('credentials') || {}
        let hasApiKey = false
        let maskedApiKey = ''

        if (creds && typeof creds === 'object' && creds.apiKey) {
          hasApiKey = true
          const keyStr = String(creds.apiKey)
          if (keyStr.length > 8) {
            maskedApiKey =
              keyStr.substring(0, 4) + '••••••••••••••••' + keyStr.substring(keyStr.length - 4)
          } else {
            maskedApiKey = '••••••••••••••••'
          }
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
          configuration: rec.get('configuration') || {},
          has_credentials: hasApiKey,
          masked_key: maskedApiKey,
          created: rec.getString('created'),
          updated: rec.getString('updated'),
        })
      }

      return e.json(200, { items: result })
    } catch (err) {
      return e.json(500, { message: 'Erro ao listar integrações' })
    }
  },
  $apis.requireAuth(),
)
