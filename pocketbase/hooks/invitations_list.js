// Hook para gerenciar convites (listar, reenviar, cancelar)
// GET /backend/v1/invitations/list?church_id=...
// POST /backend/v1/invitations/resend { invitation_id }
// POST /backend/v1/invitations/cancel { invitation_id }
// Permissão: MASTER ou ADMIN da congregação

routerAdd(
  'GET',
  '/backend/v1/invitations/list',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    let churchId = ''
    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        churchId = String(e.request.url.query().get('church_id') || '').trim()
      }
    } catch (_) {}
    if (!churchId) {
      try {
        const q = e.requestInfo ? e.requestInfo().query : null
        if (q) churchId = String(q.church_id || '').trim()
      } catch (_) {}
    }

    if (!churchId) {
      return e.json(400, { message: 'church_id é obrigatório' })
    }

    // Valida MASTER/ADMIN
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
        return e.json(403, { message: 'Apenas MASTER ou Administrador pode visualizar convites.' })
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

    try {
      const records = $app.findRecordsByFilter(
        'invitations',
        'church_id = {:churchId}',
        '-created',
        50,
        0,
        { churchId: churchId },
      )

      const now = new Date()
      const list = []

      for (let i = 0; i < records.length; i++) {
        const inv = records[i]
        let status = inv.getString('status')
        const expiresAtStr = inv.getString('expires_at')

        // Verifica expiração automática
        if (status === 'PENDING' && expiresAtStr) {
          const exp = new Date(expiresAtStr.replace(' ', 'T') + 'Z')
          if (exp < now) {
            status = 'EXPIRED'
            inv.set('status', 'EXPIRED')
            try {
              $app.save(inv)
            } catch (_) {}
          }
        }

        let opRoles = []
        try {
          const raw = inv.get('operational_roles')
          if (Array.isArray(raw)) opRoles = raw
          else if (typeof raw === 'string' && raw) opRoles = JSON.parse(raw)
        } catch (_) {}

        list.push({
          id: inv.id,
          church_id: inv.getString('church_id'),
          email: inv.getString('email'),
          name: inv.getString('name'),
          token: inv.getString('token'),
          role: inv.getString('role'),
          operational_roles: opRoles,
          status: status,
          expires_at: expiresAtStr,
          accepted_at: inv.getString('accepted_at') || null,
          created: inv.getString('created'),
        })
      }

      return e.json(200, { items: list, totalItems: list.length })
    } catch (err) {
      return e.json(500, { message: 'Erro ao buscar convites: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
