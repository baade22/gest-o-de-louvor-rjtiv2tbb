// Hook para testar credenciais de integração contra o serviço externo real
// POST /backend/v1/integrations/test
// Body: { church_id, provider, apiKey? }
// Realiza teste REAL na YouTube Data API v3 (ex: search com limit 1 de "louvor")
// Atualiza status e last_tested_at no banco
// Mensagens amigáveis em pt-BR

routerAdd(
  'POST',
  '/backend/v1/integrations/test',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const churchId = body.church_id || ''
    const provider = body.provider || ''
    const directApiKey = body.apiKey ? String(body.apiKey).trim() : ''

    if (!churchId || !provider) {
      return e.json(400, { message: 'church_id e provider são obrigatórios' })
    }

    // 1. Validação de perfil ADMIN
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
        return e.json(403, { message: 'Apenas administradores podem testar integrações' })
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

    // 2. Obter chave a ser testada (da requisição ou do banco)
    let keyToTest = directApiKey
    let integrationRecord = null

    try {
      const existing = $app.findRecordsByFilter(
        'integrations',
        'church_id = {:churchId} && provider = {:provider}',
        '',
        1,
        0,
        { churchId: churchId, provider: provider },
      )
      if (existing.length > 0) {
        integrationRecord = existing[0]
        if (!keyToTest) {
          const creds = integrationRecord.get('credentials') || {}
          if (creds && typeof creds === 'object' && creds.apiKey) {
            keyToTest = String(creds.apiKey).trim()
          }
        }
      }
    } catch (_) {}

    if (!keyToTest) {
      return e.json(400, {
        success: false,
        message: 'Nenhuma chave de API configurada para testar.',
      })
    }

    // 3. Teste para o provider YouTube
    if (provider === 'youtube') {
      const ytUrl =
        'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=louvor&key=' +
        keyToTest

      try {
        const res = $http.send({
          url: ytUrl,
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          timeout: 10,
        })

        const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

        if (res.statusCode === 200) {
          // Sucesso! Atualiza registro no banco
          if (integrationRecord) {
            integrationRecord.set('status', 'CONNECTED')
            integrationRecord.set('last_tested_at', now)
            integrationRecord.set('last_error_message', '')
            $app.save(integrationRecord)
          }

          return e.json(200, {
            success: true,
            status: 'CONNECTED',
            last_tested_at: now,
            message: '✓ Conexão realizada com sucesso. A API do YouTube está funcionando.',
          })
        }

        // Falhas específicas
        let errorMsg =
          '✕ Não foi possível conectar ao YouTube. Verifique: API Key, YouTube Data API v3 habilitada, restrições da chave, quota disponível.'

        if (res.statusCode === 403) {
          errorMsg =
            '✕ Não foi possível conectar ao YouTube. Verifique: API Key, YouTube Data API v3 habilitada, restrições da chave, quota disponível.'
        } else if (res.statusCode === 400) {
          errorMsg = '✕ Não foi possível conectar ao YouTube. A API Key informada parece inválida.'
        }

        if (integrationRecord) {
          integrationRecord.set('status', 'ERROR')
          integrationRecord.set('last_tested_at', now)
          integrationRecord.set('last_error_message', errorMsg)
          $app.save(integrationRecord)
        }

        return e.json(200, {
          success: false,
          status: 'ERROR',
          last_tested_at: now,
          message: errorMsg,
        })
      } catch (err) {
        return e.json(200, {
          success: false,
          status: 'ERROR',
          message:
            '✕ Não foi possível conectar ao YouTube. Falha na comunicação de rede com o serviço.',
        })
      }
    }

    return e.json(400, {
      success: false,
      message: 'Provider desconhecido ou ainda sem suporte a teste de conexão.',
    })
  },
  $apis.requireAuth(),
)
