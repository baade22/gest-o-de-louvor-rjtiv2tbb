// Hook para desconectar/remover credenciais de integração
// POST /backend/v1/integrations/disconnect
// Body: { church_id, provider }
// Somente ADMIN da igreja

routerAdd(
  'POST',
  '/backend/v1/integrations/disconnect',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const churchId = body.church_id || ''
    const provider = body.provider || ''

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
        return e.json(403, { message: 'Apenas administradores podem desconectar integrações' })
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

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
        const record = existing[0]
        record.set('enabled', false)
        record.set('status', 'DISCONNECTED')
        record.set('credentials', {})
        record.set('last_error_message', '')
        $app.save(record)
      }

      return e.json(200, {
        success: true,
        message: 'Integração desconectada com sucesso.',
      })
    } catch (err) {
      return e.json(500, { message: 'Erro ao desconectar integração' })
    }
  },
  $apis.requireAuth(),
)
