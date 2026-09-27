migrate(
  (app) => {
    // 1. Localiza igreja e role GUITARRA existentes
    const church = app.findFirstRecordByData('churches', 'slug', 'nova-alianca')
    const roleGuitarra = app.findFirstRecordByData('roles', 'name', 'GUITARRA')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const membersCol = app.findCollectionByNameOrId('church_members')
    const memberRolesCol = app.findCollectionByNameOrId('member_roles')

    // 2. CRIAÇÃO DE TESTE: Vinni Teste
    let userRecord
    try {
      userRecord = app.findAuthRecordByEmail('_pb_users_auth_', 'vinni.teste@example.com')
    } catch (_) {
      userRecord = new Record(usersCol)
      userRecord.setEmail('vinni.teste@example.com')
      userRecord.setPassword('Skip@Pass')
      userRecord.setVerified(true)
      userRecord.set('name', 'Vinni Teste')
      app.save(userRecord)
    }

    const memberRecord = new Record(membersCol)
    memberRecord.set('church_id', church.id)
    memberRecord.set('user_id', userRecord.id)
    memberRecord.set('role', 'MUSICO')
    memberRecord.set('phone', '81988887777')
    memberRecord.set('is_active', true)
    app.save(memberRecord)

    const mrRecord = new Record(memberRolesCol)
    mrRecord.set('church_id', church.id)
    mrRecord.set('member_id', memberRecord.id)
    mrRecord.set('role_id', roleGuitarra.id)
    app.save(mrRecord)

    console.log(
      '[E2E AUDIT STEP 1 CREATED] user_id=' + userRecord.id + ', member_id=' + memberRecord.id,
    )

    // 3. EDIÇÃO DE TESTE: Alterar nome para "Vinni Teste Alterado" e e-mail para "vinni.alterado@example.com"
    userRecord.set('name', 'Vinni Teste Alterado')
    userRecord.setEmail('vinni.alterado@example.com')
    app.save(userRecord)

    memberRecord.set('phone', '81999990000')
    app.save(memberRecord)

    console.log(
      '[E2E AUDIT STEP 2 EDITED] new_name=' +
        userRecord.getString('name') +
        ', new_email=' +
        userRecord.getString('email'),
    )

    // 4. VERIFICAÇÃO DE PERSISTÊNCIA REAL NO BANCO
    const verifyUser = app.findRecordById('_pb_users_auth_', userRecord.id)
    const verifyMember = app.findRecordById('church_members', memberRecord.id)
    const verifyMR = app.findRecordsByFilter('member_roles', 'member_id = {:mid}', '', 0, 0, {
      mid: memberRecord.id,
    })

    if (verifyUser.getString('name') !== 'Vinni Teste Alterado') {
      throw new Error('Falha na persistência do nome: ' + verifyUser.getString('name'))
    }
    if (verifyUser.getString('email') !== 'vinni.alterado@example.com') {
      throw new Error('Falha na persistência do email: ' + verifyUser.getString('email'))
    }
    if (verifyMember.getString('role') !== 'MUSICO') {
      throw new Error('Falha na role do membro: ' + verifyMember.getString('role'))
    }
    if (verifyMR.length !== 1 || verifyMR[0].getString('role_id') !== roleGuitarra.id) {
      throw new Error('Falha no vínculo de member_roles')
    }

    console.log(
      '[E2E AUDIT STEP 3 VERIFIED] Persistência real de nome e email confirmada no PocketBase!',
    )

    // 5. LIMPEZA COMPLETA: Desvincular e remover dados de teste criados para não deixar resíduo
    for (let i = 0; i < verifyMR.length; i++) {
      app.delete(verifyMR[i])
    }
    app.delete(verifyMember)
    app.delete(verifyUser)

    console.log(
      '[E2E AUDIT STEP 4 CLEANED] Músico de teste desvinculado e limpo com sucesso sem deixar resíduos!',
    )
  },
  (app) => {
    // Reversão limpa
    try {
      const u = app.findAuthRecordByEmail('_pb_users_auth_', 'vinni.teste@example.com')
      app.delete(u)
    } catch (_) {}
    try {
      const u2 = app.findAuthRecordByEmail('_pb_users_auth_', 'vinni.alterado@example.com')
      app.delete(u2)
    } catch (_) {}
  },
)
