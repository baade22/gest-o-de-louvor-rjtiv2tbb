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

    // Valida que o usuário faz parte da igreja. Contato (e-mail e telefone) só para quem
    // gere as pessoas (admin.pessoas.ver) ou a membresia; os demais veem só nome e funções
    // (achado A2 da auditoria de 2026-10-25).
    let canSeeContacts = false
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
      const caller = userMemberships[0]
      let callerPerms = []
      try {
        callerPerms = JSON.parse(caller.getString('permissions') || '[]') || []
      } catch (_) {}
      canSeeContacts =
        caller.getString('role') === 'MASTER' ||
        callerPerms.indexOf('admin.pessoas.ver') !== -1 ||
        callerPerms.indexOf('membresia.pessoas.ver') !== -1
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

      const profileNames = {}
      try {
        const profiles = $app.findRecordsByFilter(
          'access_profiles',
          'church_id = {:churchId}',
          '',
          0,
          0,
          { churchId: churchId },
        )
        for (const p of profiles) profileNames[p.id] = p.getString('name')
      } catch (_) {}

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
        let profileIds = []
        try {
          opRoles = JSON.parse(m.getString('operational_roles') || '[]') || []
          profileIds = JSON.parse(m.getString('access_profiles') || '[]') || []
        } catch (_) {}
        const accessProfiles = []
        for (const id of profileIds) {
          if (profileNames[id]) accessProfiles.push({ id: id, name: profileNames[id] })
        }
        if (!canSeeContacts) userEmail = ''

        result.push({
          id: m.id,
          church_id: m.getString('church_id'),
          user_id: userId,
          role: m.getString('role'),
          operational_roles: opRoles,
          access_profiles: accessProfiles,
          phone: canSeeContacts ? m.getString('phone') : '',
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
