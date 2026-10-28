// Hook para criar convite de novo usuário secundário
// POST /backend/v1/invitations/create
// Body: { church_id, email, name, is_master, access_profiles: [ids], role_ids }
// Permissão: MASTER ou quem tem admin.pessoas.novo. Só o MASTER convida MASTER, e quem não é
// MASTER só convida com perfis que não liberem nada além do que ele mesmo tem.

routerAdd(
  'POST',
  '/backend/v1/invitations/create',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const name = String(body.name || '').trim()
    const isMasterInvite = body.is_master === true
    const role = isMasterInvite ? 'MASTER' : 'MUSICO'
    const profileIds = []
    if (Array.isArray(body.access_profiles)) {
      for (const id of body.access_profiles) {
        const s = String(id || '').trim()
        if (s && profileIds.indexOf(s) === -1) profileIds.push(s)
      }
    }
    const rawRoleIds = Array.isArray(body.role_ids) ? body.role_ids : []
    const roleIds = []
    for (let r = 0; r < rawRoleIds.length; r++) {
      const candidateId = String(rawRoleIds[r] || '').trim()
      if (!candidateId) continue
      try {
        const foundRole = $app.findRecordById('roles', candidateId)
        if (foundRole && foundRole.getString('church_id') === churchId) {
          roleIds.push(foundRole.id)
        }
      } catch (_) {
        // Ignora role_ids de outra congregação ou inexistentes
      }
    }

    if (!churchId) {
      return e.json(400, { message: 'church_id é obrigatório' })
    }
    if (!name || name.length < 2) {
      return e.json(400, { message: 'O nome completo deve ter pelo menos 2 caracteres' })
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      return e.json(400, { message: 'Formato de e-mail inválido' })
    }
    if (!isMasterInvite && profileIds.length === 0) {
      return e.json(400, { message: 'Escolha ao menos um perfil de acesso' })
    }

    // 1. Autorização do chamador na igreja (perfis de acesso)
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

      const caller = callerMemberships[0]
      const callerIsMaster = caller.getString('role') === 'MASTER'
      let callerPerms = []
      try {
        callerPerms = JSON.parse(caller.getString('permissions') || '[]') || []
      } catch (_) {}
      if (!callerIsMaster && callerPerms.indexOf('admin.pessoas.novo') === -1) {
        return e.json(403, {
          message: 'Seu perfil de acesso não permite convidar pessoas.',
        })
      }
      if (isMasterInvite && !callerIsMaster) {
        return e.json(403, {
          message: 'Apenas o perfil MASTER pode convidar outro usuário com nível MASTER.',
        })
      }
      // Perfis do convite: desta igreja e, para quem não é MASTER, sem liberar nada além do
      // que o próprio convidante tem
      for (const id of profileIds) {
        let p = null
        try {
          p = $app.findRecordById('access_profiles', id)
        } catch (_) {}
        if (!p || p.getString('church_id') !== churchId) {
          return e.json(400, { message: 'Perfil de acesso inválido.' })
        }
        if (!callerIsMaster) {
          let keys = []
          try {
            keys = JSON.parse(p.getString('permissions') || '[]') || []
          } catch (_) {}
          for (const k of keys) {
            if (callerPerms.indexOf(k) === -1) {
              return e.json(403, {
                message:
                  'Você não pode convidar com o perfil "' +
                  p.getString('name') +
                  '": ele libera coisas que você mesmo não tem. Peça ao MASTER.',
              })
            }
          }
        }
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente: ' + err.message })
    }

    // 2. Verificar se o usuário já existe e já é membro ativo da igreja
    try {
      let existingUser = null
      try {
        existingUser = $app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {}

      if (existingUser) {
        const existingMembers = $app.findRecordsByFilter(
          'church_members',
          'church_id = {:churchId} && user_id = {:userId} && is_active = true',
          '',
          1,
          0,
          { churchId: churchId, userId: existingUser.id },
        )
        if (existingMembers.length > 0) {
          return e.json(400, {
            message: 'Este usuário já é um membro ativo desta congregação.',
          })
        }
      }
    } catch (err) {
      return e.json(500, { message: 'Erro ao verificar usuário existente: ' + err.message })
    }

    // 3. Gerar token aleatório criptograficamente seguro e data de expiração (7 dias)
    const token =
      $security.randomString(32) + $security.sha256(email + Date.now().toString()).substring(0, 16)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19)

    // Se já havia um convite pendente para este email e congregação, cancelamos o antigo
    try {
      const oldInvitations = $app.findRecordsByFilter(
        'invitations',
        'church_id = {:churchId} && email = {:email} && status = "PENDING"',
        '',
        10,
        0,
        { churchId: churchId, email: email },
      )
      for (let i = 0; i < oldInvitations.length; i++) {
        oldInvitations[i].set('status', 'CANCELLED')
        $app.save(oldInvitations[i])
      }
    } catch (_) {}

    try {
      const invCol = $app.findCollectionByNameOrId('invitations')
      const inv = new Record(invCol)
      inv.set('church_id', churchId)
      inv.set('email', email)
      inv.set('name', name)
      inv.set('token', token)
      inv.set('role', role)
      inv.set('operational_roles', [])
      inv.set('access_profiles', profileIds)
      inv.set('role_ids', roleIds)
      inv.set('status', 'PENDING')
      inv.set('expires_at', expiresAt)
      $app.save(inv)

      return e.json(200, {
        success: true,
        message: 'Convite gerado com sucesso!',
        invitation: {
          id: inv.id,
          church_id: churchId,
          email: email,
          name: name,
          token: token,
          role: role,
          access_profiles: profileIds,
          status: 'PENDING',
          expires_at: expiresAt,
        },
      })
    } catch (err) {
      return e.json(500, { message: 'Erro ao registrar convite: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
