// Hook para gerenciar reenvio e cancelamento de convites
// POST /backend/v1/invitations/actions
// Body: { action: 'resend' | 'cancel', invitation_id: string }
// Permissão: MASTER ou ADMIN da congregação

routerAdd(
  'POST',
  '/backend/v1/invitations/actions',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const action = String(body.action || '').trim()
    const invitationId = String(body.invitation_id || '').trim()

    if (!invitationId || !action) {
      return e.json(400, { message: 'invitation_id e action são obrigatórios' })
    }

    let inv = null
    try {
      inv = $app.findRecordById('invitations', invitationId)
    } catch (_) {
      return e.json(404, { message: 'Convite não encontrado' })
    }

    const churchId = inv.getString('church_id')

    // Validação de MASTER/ADMIN
    try {
      const callerMemberships = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: authRecord.id },
      )
      if (callerMemberships.length === 0) {
        return e.json(403, { message: 'Sem acesso a esta congregação' })
      }
      const callerRole = callerMemberships[0].getString('role')
      if (callerRole !== 'MASTER' && callerRole !== 'ADMIN') {
        return e.json(403, { message: 'Apenas MASTER ou Administrador pode alterar convites.' })
      }
      if (inv.getString('role') === 'MASTER' && callerRole !== 'MASTER') {
        return e.json(403, { message: 'Apenas MASTER pode gerenciar convites com nível MASTER.' })
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

    try {
      if (action === 'cancel') {
        inv.set('status', 'CANCELLED')
        $app.save(inv)
        return e.json(200, { success: true, message: 'Convite cancelado com sucesso.' })
      } else if (action === 'resend') {
        // Gera novo token e renova expiração por mais 7 dias
        const newToken =
          $security.randomString(32) +
          $security.sha256(inv.getString('email') + Date.now().toString()).substring(0, 16)
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19)

        inv.set('token', newToken)
        inv.set('status', 'PENDING')
        inv.set('expires_at', newExpiresAt)
        $app.save(inv)

        return e.json(200, {
          success: true,
          message: 'Convite renovado com sucesso!',
          token: newToken,
          expires_at: newExpiresAt,
        })
      } else {
        return e.json(400, { message: 'Ação desconhecida: ' + action })
      }
    } catch (err) {
      return e.json(500, { message: 'Erro ao processar ação: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
