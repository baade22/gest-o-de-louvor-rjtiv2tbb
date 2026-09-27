// Hook para salvar (criar ou editar) membro/músico com nome, email, telefone, roles e instrumentos
// POST /backend/v1/musicians/save
// Body: { church_id, member_id (opcional), name, email, phone, role, is_active, role_ids }
// Permissão: Apenas ADMIN da igreja pode criar/editar membros de sua igreja.

routerAdd(
  'POST',
  '/backend/v1/musicians/save',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado. Faça login novamente.' })
    }

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const memberId = String(body.member_id || '').trim()
    const name = String(body.name || '').trim()
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const phone = String(body.phone || '').trim()
    const role = String(body.role || 'MUSICO').trim()
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true
    const roleIds = Array.isArray(body.role_ids) ? body.role_ids : []

    // 1. Validações básicas
    if (!churchId) {
      return e.json(400, { message: 'Igreja não informada.' })
    }
    if (!name || name.replace(/\s+/g, '').length === 0) {
      return e.json(400, { message: 'O nome é obrigatório e não pode conter apenas espaços.' })
    }
    if (name.length < 2) {
      return e.json(400, { message: 'O nome deve ter pelo menos 2 caracteres.' })
    }
    if (!email) {
      return e.json(400, { message: 'O e-mail é obrigatório.' })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return e.json(400, { message: 'Informe um formato de e-mail válido.' })
    }
    if (!['ADMIN', 'LIDER', 'MUSICO'].includes(role)) {
      return e.json(400, {
        message: 'Nível de permissão inválido. Deve ser ADMIN, LIDER ou MUSICO.',
      })
    }
    if (roleIds.length === 0) {
      return e.json(400, { message: 'Selecione ao menos um instrumento ou função para o músico.' })
    }

    // 2. Validação Multi-tenant & Autorização de ADMIN
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
        return e.json(403, {
          message: 'Sem acesso a esta congregação.',
        })
      }

      const callerRole = callerMemberships[0].getString('role')
      if (callerRole !== 'ADMIN') {
        return e.json(403, {
          message: 'Apenas administradores desta igreja podem cadastrar ou editar membros.',
        })
      }
    } catch (err) {
      return e.json(403, { message: 'Permissão insuficiente para esta congregação.' })
    }

    // 3. Execução: Criação ou Edição
    try {
      const usersCol = $app.findCollectionByNameOrId('_pb_users_auth_')
      const membersCol = $app.findCollectionByNameOrId('church_members')
      const memberRolesCol = $app.findCollectionByNameOrId('member_roles')

      if (memberId) {
        // --- MODO EDIÇÃO ---
        let memberRecord
        try {
          memberRecord = $app.findRecordById('church_members', memberId)
        } catch (_) {
          return e.json(404, { message: 'Membro não encontrado.' })
        }

        // Validação estrita de isolamento multi-tenant
        if (memberRecord.getString('church_id') !== churchId) {
          return e.json(403, { message: 'Acesso negado: este membro pertence a outra igreja.' })
        }

        const userId = memberRecord.getString('user_id')
        if (!userId) {
          return e.json(500, { message: 'Registro de membro corrompido: sem usuário vinculado.' })
        }

        let userRecord
        try {
          userRecord = $app.findRecordById('_pb_users_auth_', userId)
        } catch (_) {
          return e.json(404, { message: 'Usuário de autenticação não encontrado.' })
        }

        // Atualizar nome do usuário (e email caso tenha mudado)
        userRecord.set('name', name)
        if (email && email !== userRecord.getString('email')) {
          // Verificar se outro usuário já usa esse e-mail
          try {
            const existingWithEmail = $app.findAuthRecordByEmail('_pb_users_auth_', email)
            if (existingWithEmail && existingWithEmail.id !== userRecord.id) {
              return e.json(400, {
                message: 'Este e-mail já está sendo utilizado por outro usuário no sistema.',
              })
            }
          } catch (_) {}
          userRecord.setEmail(email)
        }
        $app.save(userRecord)

        // Atualizar church_members
        memberRecord.set('role', role)
        memberRecord.set('phone', phone || null)
        memberRecord.set('is_active', isActive)
        $app.save(memberRecord)

        // Sincronizar funções/instrumentos (member_roles)
        const oldMemberRoles = $app.findRecordsByFilter(
          'member_roles',
          'member_id = {:memberId}',
          '',
          0,
          0,
          { memberId: memberId },
        )
        for (let i = 0; i < oldMemberRoles.length; i++) {
          $app.delete(oldMemberRoles[i])
        }

        for (let i = 0; i < roleIds.length; i++) {
          const roleId = roleIds[i]
          const mr = new Record(memberRolesCol)
          mr.set('church_id', churchId)
          mr.set('member_id', memberId)
          mr.set('role_id', roleId)
          $app.save(mr)
        }

        return e.json(200, {
          success: true,
          message: 'Músico atualizado com sucesso!',
          member: {
            id: memberRecord.id,
            church_id: churchId,
            user_id: userRecord.id,
            name: userRecord.getString('name'),
            email: userRecord.getString('email'),
            phone: memberRecord.getString('phone'),
            role: memberRecord.getString('role'),
            is_active: memberRecord.getBool('is_active'),
          },
        })
      } else {
        // --- MODO CRIAÇÃO ---
        let userRecord
        try {
          userRecord = $app.findAuthRecordByEmail('_pb_users_auth_', email)
          // Se já existe, atualizamos o nome informado pelo admin se necessário
          userRecord.set('name', name)
          $app.save(userRecord)
        } catch (_) {
          // Não existe: cria novo usuário de autenticação
          userRecord = new Record(usersCol)
          userRecord.setEmail(email)
          userRecord.setPassword('Skip@Pass')
          userRecord.setVerified(true)
          userRecord.set('name', name)
          $app.save(userRecord)
        }

        // Verifica se usuário já é membro desta congregação
        const existingMember = $app.findRecordsByFilter(
          'church_members',
          'church_id = {:churchId} && user_id = {:userId}',
          '',
          1,
          0,
          { churchId: churchId, userId: userRecord.id },
        )

        let newMember
        if (existingMember.length > 0) {
          // Reativa ou atualiza membro existente
          newMember = existingMember[0]
          newMember.set('role', role)
          newMember.set('phone', phone || null)
          newMember.set('is_active', isActive)
          $app.save(newMember)
        } else {
          // Cria novo church_members
          newMember = new Record(membersCol)
          newMember.set('church_id', churchId)
          newMember.set('user_id', userRecord.id)
          newMember.set('role', role)
          newMember.set('phone', phone || null)
          newMember.set('is_active', isActive)
          $app.save(newMember)
        }

        // Sincronizar funções/instrumentos (member_roles)
        const oldMemberRoles = $app.findRecordsByFilter(
          'member_roles',
          'member_id = {:memberId}',
          '',
          0,
          0,
          { memberId: newMember.id },
        )
        for (let i = 0; i < oldMemberRoles.length; i++) {
          $app.delete(oldMemberRoles[i])
        }

        for (let i = 0; i < roleIds.length; i++) {
          const roleId = roleIds[i]
          const mr = new Record(memberRolesCol)
          mr.set('church_id', churchId)
          mr.set('member_id', newMember.id)
          mr.set('role_id', roleId)
          $app.save(mr)
        }

        return e.json(200, {
          success: true,
          message: 'Músico cadastrado com sucesso!',
          member: {
            id: newMember.id,
            church_id: churchId,
            user_id: userRecord.id,
            name: userRecord.getString('name'),
            email: userRecord.getString('email'),
            phone: newMember.getString('phone'),
            role: newMember.getString('role'),
            is_active: newMember.getBool('is_active'),
          },
        })
      }
    } catch (err) {
      return e.json(500, {
        message: 'Erro ao processar dados no banco: ' + (err.message || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
