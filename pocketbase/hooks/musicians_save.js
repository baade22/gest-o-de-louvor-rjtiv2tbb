// Hook para salvar (criar ou editar) uma pessoa com acesso: nome, e-mail, telefone, perfis de
// acesso e instrumentos.
// POST /backend/v1/musicians/save
// Body: { church_id, member_id (opcional), name, email, phone, is_active, role_ids,
//         access_profiles: [ids], is_master }
// Permissão: MASTER, ou quem tem admin.pessoas.novo (criar) / admin.pessoas.alterar (editar).
// Perfis de acesso: quem não é MASTER só dá ou tira perfis que não liberem nada além do que
// ele mesmo tem, não muda o próprio acesso e não mexe em MASTER. Só o MASTER dá o acesso MASTER.
// O acesso efetivo (permissions, congregações) é calculado por church_members_access.js.

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
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true
    const roleIds = Array.isArray(body.role_ids) ? body.role_ids : []
    const wantsMaster = body.is_master === true
    const profilesGiven = Array.isArray(body.access_profiles)
    const wantedProfiles = []
    if (profilesGiven) {
      for (const id of body.access_profiles) {
        const s = String(id || '').trim()
        if (s && wantedProfiles.indexOf(s) === -1) wantedProfiles.push(s)
      }
    }

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
    if (!wantsMaster && !memberId && wantedProfiles.length === 0) {
      return e.json(400, { message: 'Escolha ao menos um perfil de acesso.' })
    }

    const parseList = (s) => {
      try {
        const v = JSON.parse(s || '[]')
        return Array.isArray(v) ? v.map((x) => String(x)) : []
      } catch (_) {
        return []
      }
    }

    // 2. Quem está pedindo
    let caller = null
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: authRecord.id },
      )
      caller = rows.length > 0 ? rows[0] : null
    } catch (_) {}
    if (!caller) {
      return e.json(403, { message: 'Sem acesso a esta congregação.' })
    }
    const callerIsMaster = caller.getString('role') === 'MASTER'
    const callerPerms = parseList(caller.getString('permissions'))
    const need = memberId ? 'admin.pessoas.alterar' : 'admin.pessoas.novo'
    if (!callerIsMaster && callerPerms.indexOf(need) === -1) {
      return e.json(403, {
        message: 'Seu perfil de acesso não permite cadastrar ou editar pessoas.',
      })
    }
    if (wantsMaster && !callerIsMaster) {
      return e.json(403, { message: 'Só o MASTER da igreja pode dar o acesso MASTER.' })
    }

    // Perfis pedidos: precisam ser desta igreja
    const profileById = {}
    for (const id of wantedProfiles) {
      let p = null
      try {
        p = $app.findRecordById('access_profiles', id)
      } catch (_) {}
      if (!p || p.getString('church_id') !== churchId) {
        return e.json(400, { message: 'Perfil de acesso inválido.' })
      }
      profileById[id] = p
    }

    // Confere a troca de perfis de quem não é MASTER ("ninguém dá mais do que tem")
    const checkProfileChange = (before, targetUserId) => {
      if (callerIsMaster || !profilesGiven) return null
      const diff = wantedProfiles
        .filter((x) => before.indexOf(x) === -1)
        .concat(before.filter((x) => wantedProfiles.indexOf(x) === -1))
      if (diff.length === 0) return null
      if (targetUserId === authRecord.id) return 'Você não pode mudar o seu próprio acesso.'
      for (const id of diff) {
        let p = profileById[id] || null
        if (!p) {
          try {
            p = $app.findRecordById('access_profiles', id)
          } catch (_) {}
        }
        if (!p) continue
        for (const k of parseList(p.getString('permissions'))) {
          if (callerPerms.indexOf(k) === -1) {
            return (
              'Você não pode dar ou tirar o perfil "' +
              p.getString('name') +
              '": ele libera coisas que você mesmo não tem. Peça ao MASTER.'
            )
          }
        }
      }
      return null
    }

    const writeLog = (member, before, wasMaster, isNew) => {
      try {
        const after = parseList(member.getString('access_profiles'))
        const isMasterNow = member.getString('role') === 'MASTER'
        const added = after.filter((x) => before.indexOf(x) === -1)
        const removed = before.filter((x) => after.indexOf(x) === -1)
        if (!isNew && added.length === 0 && removed.length === 0 && wasMaster === isMasterNow) {
          return
        }
        const names = (ids) =>
          ids.map((id) => {
            try {
              return $app.findRecordById('access_profiles', id).getString('name')
            } catch (_) {
              return '(perfil excluído)'
            }
          })
        const log = new Record($app.findCollectionByNameOrId('audit_logs'))
        log.set('church_id', churchId)
        log.set('user_id', authRecord.id)
        log.set('action', 'ACESSO_ALTERADO')
        log.set('entity_type', 'church_members')
        log.set('entity_id', member.id)
        log.set('details', {
          by_name: authRecord.getString('name') || authRecord.getString('email'),
          added: names(added),
          removed: names(removed),
          master_before: wasMaster,
          master_after: isMasterNow,
          new_member: isNew,
        })
        $app.save(log)
      } catch (_) {}
    }

    // Aplica perfis e MASTER no vínculo (o cálculo do acesso é do hook church_members_access)
    const applyAccess = (member) => {
      if (profilesGiven) member.set('access_profiles', wantedProfiles)
      if (wantsMaster) member.set('role', 'MASTER')
      else if (member.getString('role') === 'MASTER' || !member.getString('role')) {
        member.set('role', 'MUSICO')
      }
    }

    // 3. Execução: Criação ou Edição
    try {
      const usersCol = $app.findCollectionByNameOrId('_pb_users_auth_')
      const membersCol = $app.findCollectionByNameOrId('church_members')
      const memberRolesCol = $app.findCollectionByNameOrId('member_roles')

      const syncInstruments = (mId) => {
        const oldMemberRoles = $app.findRecordsByFilter(
          'member_roles',
          'member_id = {:memberId}',
          '',
          0,
          0,
          { memberId: mId },
        )
        for (let i = 0; i < oldMemberRoles.length; i++) {
          $app.delete(oldMemberRoles[i])
        }
        for (let i = 0; i < roleIds.length; i++) {
          let role = null
          try {
            role = $app.findRecordById('roles', String(roleIds[i]))
          } catch (_) {}
          if (!role || role.getString('church_id') !== churchId) continue
          const mr = new Record(memberRolesCol)
          mr.set('church_id', churchId)
          mr.set('member_id', mId)
          mr.set('role_id', role.id)
          $app.save(mr)
        }
      }

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

        // Proteção do MASTER: quem não é MASTER não edita (rebaixa, desativa) um MASTER
        const wasMaster = memberRecord.getString('role') === 'MASTER'
        if (wasMaster && !callerIsMaster) {
          return e.json(403, {
            message: 'Apenas o perfil MASTER pode editar outro MASTER.',
          })
        }
        if (wasMaster && !wantsMaster && wantedProfiles.length === 0) {
          return e.json(400, {
            message: 'Ao tirar o acesso MASTER, escolha ao menos um perfil de acesso.',
          })
        }

        const userId = memberRecord.getString('user_id')
        if (!userId) {
          return e.json(500, { message: 'Registro de membro corrompido: sem usuário vinculado.' })
        }
        const before = parseList(memberRecord.getString('access_profiles'))
        const denied = checkProfileChange(before, userId)
        if (denied) return e.json(403, { message: denied })

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

        applyAccess(memberRecord)
        memberRecord.set('phone', phone || null)
        memberRecord.set('is_active', isActive)
        $app.save(memberRecord)
        syncInstruments(memberId)
        writeLog(memberRecord, before, wasMaster, false)

        return e.json(200, {
          success: true,
          message: 'Pessoa atualizada com sucesso!',
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
        let before = []
        let wasMaster = false
        if (existingMember.length > 0) {
          // Reativa ou atualiza membro existente
          newMember = existingMember[0]
          wasMaster = newMember.getString('role') === 'MASTER'
          // Proteção do MASTER: um não-MASTER não pode alterar um membro que já é MASTER
          // (ex.: reaproveitar o fluxo de "criação" por e-mail para rebaixá-lo).
          if (wasMaster && !callerIsMaster) {
            return e.json(403, {
              message: 'Apenas o perfil MASTER pode editar outro MASTER.',
            })
          }
          before = parseList(newMember.getString('access_profiles'))
        } else {
          newMember = new Record(membersCol)
          newMember.set('church_id', churchId)
          newMember.set('user_id', userRecord.id)
        }
        const denied = checkProfileChange(before, userRecord.id)
        if (denied) return e.json(403, { message: denied })

        applyAccess(newMember)
        newMember.set('phone', phone || null)
        newMember.set('is_active', isActive)
        $app.save(newMember)
        syncInstruments(newMember.id)
        writeLog(newMember, before, wasMaster, existingMember.length === 0)

        return e.json(200, {
          success: true,
          message: 'Pessoa cadastrada com sucesso!',
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
