// Hook para buscar um único membro com usuário e funções
// GET /backend/v1/musicians/:id?church_id=xxx
// Permissão: Membro da igreja

routerAdd(
  'GET',
  '/backend/v1/musicians/{id}',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    let rawParam = ''
    try {
      if (e.request && typeof e.request.pathValue === 'function') {
        rawParam = e.request.pathValue('id')
      }
    } catch (_) {}
    if (!rawParam) {
      try {
        const reqInfo = e.requestInfo ? e.requestInfo() : null
        if (reqInfo && reqInfo.pathParams) {
          rawParam = reqInfo.pathParams['id']
        }
      } catch (_) {}
    }
    const memberId = String(rawParam || '').trim()
    const churchId = String(e.requestInfo().query['church_id'] || '').trim()

    if (!memberId) {
      return e.json(400, { message: 'id do membro é obrigatório' })
    }

    try {
      const member = $app.findRecordById('church_members', memberId)
      const targetChurchId = churchId || member.getString('church_id')

      // Validação de acesso à congregação
      // Se fornecido church_id na query e for diferente da igreja do membro, nega acesso imediatamente
      if (churchId && churchId !== member.getString('church_id')) {
        return e.json(403, { message: 'Sem acesso a este membro' })
      }

      const memberChurchId = member.getString('church_id')
      const userMemberships = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: memberChurchId, userId: authRecord.id },
      )

      if (userMemberships.length === 0) {
        return e.json(403, { message: 'Sem acesso a este membro' })
      }
      // Contato e perfis só para quem gere as pessoas (ou para a própria pessoa)
      const caller = userMemberships[0]
      let callerPerms = []
      try {
        callerPerms = JSON.parse(caller.getString('permissions') || '[]') || []
      } catch (_) {}
      const canSeeDetails =
        caller.getString('role') === 'MASTER' ||
        callerPerms.indexOf('admin.pessoas.ver') !== -1 ||
        callerPerms.indexOf('membresia.pessoas.ver') !== -1 ||
        caller.id === member.id
      const userId = member.getString('user_id')
      let userName = ''
      let userEmail = ''

      if (userId) {
        try {
          const u = $app.findRecordById('_pb_users_auth_', userId)
          userName = u.getString('name')
          userEmail = u.getString('email')
        } catch (_) {}
      }

      // Buscar roles atribuídos
      const memberRoles = $app.findRecordsByFilter(
        'member_roles',
        'member_id = {:memberId}',
        '',
        0,
        0,
        { memberId: member.id },
      )

      const roleIds = []
      const rolesList = []
      for (let j = 0; j < memberRoles.length; j++) {
        const mr = memberRoles[j]
        const roleId = mr.getString('role_id')
        if (roleId) {
          roleIds.push(roleId)
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
        opRoles = JSON.parse(member.getString('operational_roles') || '[]') || []
        profileIds = JSON.parse(member.getString('access_profiles') || '[]') || []
      } catch (_) {}
      const accessProfiles = []
      for (const id of profileIds) {
        try {
          const p = $app.findRecordById('access_profiles', id)
          accessProfiles.push({ id: p.id, name: p.getString('name') })
        } catch (_) {}
      }
      if (!canSeeDetails) userEmail = ''

      return e.json(200, {
        id: member.id,
        church_id: member.getString('church_id'),
        user_id: userId,
        role: member.getString('role'),
        operational_roles: opRoles,
        access_profiles: canSeeDetails ? accessProfiles : [],
        permissions: canSeeDetails ? JSON.parse(member.getString('permissions') || '[]') : [],
        phone: canSeeDetails ? member.getString('phone') : '',
        is_active: member.getBool('is_active'),
        created: member.getString('created'),
        updated: member.getString('updated'),
        name: userName,
        email: userEmail,
        role_ids: roleIds,
        roles: rolesList,
        expand: {
          user_id: {
            id: userId,
            name: userName,
            email: userEmail,
          },
        },
      })
    } catch (err) {
      return e.json(404, { message: 'Membro não encontrado: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
