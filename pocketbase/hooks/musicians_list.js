// Hook para listar membros com dados de usuário e funções garantidos
// GET /backend/v1/musicians?church_id=xxx
// Permissão: Usuários autenticados membros da igreja

routerAdd(
  'GET',
  '/backend/v1/musicians',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const churchId = String(e.requestInfo().query['church_id'] || '').trim()
    if (!churchId) {
      return e.json(400, { message: 'church_id é obrigatório' })
    }

    // Valida que o usuário faz parte da igreja
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
        return e.json(403, { message: 'Sem acesso a esta congregação' })
      }
    } catch (_) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

    try {
      const members = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId}',
        '-created',
        0,
        0,
        { churchId: churchId },
      )

      const result = []
      for (let i = 0; i < members.length; i++) {
        const m = members[i]
        const userId = m.getString('user_id')
        let userName = ''
        let userEmail = ''

        if (userId) {
          try {
            const u = $app.findRecordById('_pb_users_auth_', userId)
            userName = u.getString('name')
            userEmail = u.getString('email')
          } catch (_) {}
        }

        // Buscar roles deste membro
        const memberRoles = $app.findRecordsByFilter(
          'member_roles',
          'member_id = {:memberId}',
          '',
          0,
          0,
          { memberId: m.id },
        )

        const rolesList = []
        for (let j = 0; j < memberRoles.length; j++) {
          const mr = memberRoles[j]
          const roleId = mr.getString('role_id')
          if (roleId) {
            try {
              const r = $app.findRecordById('roles', roleId)
              rolesList.push({
                id: r.id,
                name: r.getString('name'),
                color: r.getString('color'),
                description: r.getString('description'),
              })
            } catch (_) {}
          }
        }

        let opRoles = []
        try {
          const raw = m.get('operational_roles')
          if (Array.isArray(raw)) opRoles = raw
          else if (typeof raw === 'string' && raw) opRoles = JSON.parse(raw)
        } catch (_) {}

        result.push({
          id: m.id,
          church_id: m.getString('church_id'),
          user_id: userId,
          role: m.getString('role'),
          operational_roles: opRoles,
          phone: m.getString('phone'),
          is_active: m.getBool('is_active'),
          created: m.getString('created'),
          updated: m.getString('updated'),
          name: userName,
          email: userEmail,
          roles: rolesList,
          expand: {
            user_id: {
              id: userId,
              name: userName,
              email: userEmail,
            },
          },
        })
      }

      return e.json(200, {
        items: result,
        totalItems: result.length,
      })
    } catch (err) {
      return e.json(500, { message: 'Erro ao buscar membros: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
