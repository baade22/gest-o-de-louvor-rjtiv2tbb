// Hook para aceitar convite de usuário: cria/atualiza conta de usuário, define a própria senha, ativa conta e vincula à congregação
// POST /backend/v1/invitations/accept
// Body: { token: string, password: string, password_confirm: string }
// Acesso público com validação de senha forte em pt-BR

routerAdd('POST', '/backend/v1/invitations/accept', (e) => {
  const body = e.requestInfo().body || {}
  const token = String(body.token || '').trim()
  const password = String(body.password || '')
  const passwordConfirm = String(body.password_confirm || '')

  if (!token) {
    return e.json(400, { message: 'Token de convite é obrigatório' })
  }
  if (!password || password.length < 8) {
    return e.json(400, { message: 'A senha deve conter no mínimo 8 caracteres' })
  }
  if (password !== passwordConfirm) {
    return e.json(400, { message: 'As senhas informadas não conferem' })
  }

  // Validação de senha: letras e números
  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  if (!hasLetter || !hasNumber) {
    return e.json(400, {
      message: 'A senha deve conter pelo menos uma letra e um número para sua segurança',
    })
  }

  // Localiza o convite
  let inv = null
  try {
    const records = $app.findRecordsByFilter('invitations', 'token = {:token}', '', 1, 0, {
      token: token,
    })
    if (records.length === 0) {
      return e.json(404, { message: 'Convite inválido ou expirado' })
    }
    inv = records[0]
  } catch (err) {
    return e.json(500, { message: 'Erro ao consultar convite: ' + err.message })
  }

  if (inv.getString('status') === 'ACCEPTED') {
    return e.json(400, { message: 'Este convite já foi aceito. Você já pode fazer login.' })
  }
  if (inv.getString('status') === 'CANCELLED') {
    return e.json(400, { message: 'Este convite foi cancelado pela liderança.' })
  }

  const expiresAtStr = inv.getString('expires_at')
  if (expiresAtStr) {
    const exp = new Date(expiresAtStr.replace(' ', 'T') + 'Z')
    if (exp < new Date()) {
      inv.set('status', 'EXPIRED')
      try {
        $app.save(inv)
      } catch (_) {}
      return e.json(400, { message: 'Este convite expirou. Solicite um novo link de acesso.' })
    }
  }

  const churchId = inv.getString('church_id')
  const email = inv.getString('email')
  const name = inv.getString('name')
  const appRole = inv.getString('role') || 'MUSICO'

  let opRoles = []
  try {
    const raw = inv.get('operational_roles')
    if (Array.isArray(raw)) opRoles = raw
    else if (typeof raw === 'string' && raw) opRoles = JSON.parse(raw)
  } catch (_) {}
  if (opRoles.length === 0) {
    opRoles = ['MUSICO']
  }

  let roleIds = []
  try {
    const rawR = inv.get('role_ids')
    if (Array.isArray(rawR)) roleIds = rawR
    else if (typeof rawR === 'string' && rawR) roleIds = JSON.parse(rawR)
  } catch (_) {}

  // 1. Cria ou atualiza o usuário na tabela de auth com a senha definida por ele mesmo
  try {
    let userRecord = null
    const usersCol = $app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      userRecord = $app.findAuthRecordByEmail('_pb_users_auth_', email)
      // Usuário já existe: define a nova senha e marca verificado
      userRecord.setPassword(password)
      userRecord.setVerified(true)
      if (name) userRecord.set('name', name)
      $app.save(userRecord)
    } catch (_) {
      // Usuário não existe: cria conta limpa com a senha que o próprio usuário digitou
      userRecord = new Record(usersCol)
      userRecord.setEmail(email)
      userRecord.setPassword(password)
      userRecord.setVerified(true)
      userRecord.set('name', name)
      $app.save(userRecord)
    }

    // 2. Cria ou atualiza vínculo em church_members com as funções atribuídas
    const membersCol = $app.findCollectionByNameOrId('church_members')
    const memberRolesCol = $app.findCollectionByNameOrId('member_roles')

    let memberRecord = null
    const existingMembers = $app.findRecordsByFilter(
      'church_members',
      'church_id = {:churchId} && user_id = {:userId}',
      '',
      1,
      0,
      { churchId: churchId, userId: userRecord.id },
    )

    if (existingMembers.length > 0) {
      memberRecord = existingMembers[0]
      memberRecord.set('role', appRole)
      memberRecord.set('operational_roles', opRoles)
      memberRecord.set('is_active', true)
      $app.save(memberRecord)
    } else {
      memberRecord = new Record(membersCol)
      memberRecord.set('church_id', churchId)
      memberRecord.set('user_id', userRecord.id)
      memberRecord.set('role', appRole)
      memberRecord.set('operational_roles', opRoles)
      memberRecord.set('is_active', true)
      $app.save(memberRecord)
    }

    // 3. Vincula funções/instrumentos em member_roles se houver
    if (roleIds.length > 0) {
      for (let i = 0; i < roleIds.length; i++) {
        const rId = roleIds[i]
        const existingMr = $app.findRecordsByFilter(
          'member_roles',
          'member_id = {:memberId} && role_id = {:roleId}',
          '',
          1,
          0,
          { memberId: memberRecord.id, roleId: rId },
        )
        if (existingMr.length === 0) {
          const mr = new Record(memberRolesCol)
          mr.set('church_id', churchId)
          mr.set('member_id', memberRecord.id)
          mr.set('role_id', rId)
          $app.save(mr)
        }
      }
    }

    // 4. Marca o convite como aceito
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19)
    inv.set('status', 'ACCEPTED')
    inv.set('accepted_at', nowStr)
    $app.save(inv)

    return e.json(200, {
      success: true,
      message: 'Conta ativada com sucesso! Você já pode fazer login no LouvorFlow.',
      email: email,
    })
  } catch (err) {
    return e.json(500, {
      message: 'Erro ao processar ativação de conta: ' + (err.message || String(err)),
    })
  }
})
