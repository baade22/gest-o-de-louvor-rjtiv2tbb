// Hook para criar convite de novo usuário secundário
// POST /backend/v1/invitations/create
// Body: { church_id, email, name, role, operational_roles, role_ids }
// Permissão: Apenas MASTER ou ADMIN da congregação.
// Regra de segurança: ADMIN não pode criar convite com perfil MASTER. Apenas MASTER cria MASTER.

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
    const role = String(body.role || 'MUSICO').trim()
    const operationalRoles = Array.isArray(body.operational_roles)
      ? body.operational_roles
      : ['MUSICO']
    const roleIds = Array.isArray(body.role_ids) ? body.role_ids : []

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
    if (!['MASTER', 'ADMIN', 'LIDER', 'MUSICO'].includes(role)) {
      return e.json(400, { message: 'Nível de permissão inválido' })
    }
    if (operationalRoles.length === 0) {
      return e.json(400, { message: 'Selecione ao menos uma função operacional' })
    }

    // 1. Autorização do chamador na igreja
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
        return e.json(403, {
          message: 'Apenas administradores e MASTER podem criar convites de usuários.',
        })
      }

      if (role === 'MASTER' && callerRole !== 'MASTER') {
        return e.json(403, {
          message: 'Apenas o perfil MASTER pode convidar outro usuário com nível MASTER.',
        })
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
      inv.set('operational_roles', operationalRoles)
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
          operational_roles: operationalRoles,
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
