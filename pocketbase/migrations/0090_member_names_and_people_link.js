// Migração 0090: nome na escala + toda conta vira ficha em Membros
//
// 1) church_members.display_name: cópia do nome da pessoa. A coleção users só deixa cada um
//    ver a própria conta, então a escala (que lia o nome pela conta) mostrava "Membro" para
//    todo mundo. O nome é mantido pelo hook church_members_people.js.
// 2) people.profile_pending: a pessoa ainda precisa completar o cadastro (nome completo,
//    nascimento, celular...). Quem entra por convite cai nessa tela no primeiro acesso.
// 3) Cada conta ativa de uma igreja passa a ter a sua ficha em `people` (Membros): liga a
//    ficha que já existe com o mesmo e-mail ou cria uma nova, pendente de completar.

migrate(
  (app) => {
    const members = app.findCollectionByNameOrId('church_members')
    if (!members.fields.getByName('display_name')) {
      members.fields.add(new TextField({ name: 'display_name', max: 200 }))
      app.save(members)
    }
    const people = app.findCollectionByNameOrId('people')
    if (!people.fields.getByName('profile_pending')) {
      people.fields.add(new BoolField({ name: 'profile_pending' }))
      app.save(people)
    }

    let list = []
    try {
      list = app.findAllRecords('church_members')
    } catch (_) {}
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      let user = null
      try {
        user = app.findRecordById('_pb_users_auth_', m.getString('user_id'))
      } catch (_) {}
      if (!user) continue
      const email = user.getString('email')
      const name = user.getString('name') || (email ? email.split('@')[0] : '')

      if (!m.getString('display_name') && name) {
        m.set('display_name', name)
        try {
          app.saveNoValidate(m)
        } catch (_) {}
      }
      if (!m.getBool('is_active')) continue

      const churchId = m.getString('church_id')
      try {
        // Já tem ficha ligada à conta?
        const linked = app.findRecordsByFilter(
          'people',
          'church_id = {:c} && user_id = {:u}',
          '',
          1,
          0,
          { c: churchId, u: user.id },
        )
        if (linked.length > 0) continue

        // Ficha com o mesmo e-mail e sem conta: liga
        if (email) {
          const byEmail = app.findRecordsByFilter(
            'people',
            "church_id = {:c} && email = {:e} && user_id = ''",
            '',
            1,
            0,
            { c: churchId, e: email },
          )
          if (byEmail.length > 0) {
            const p = byEmail[0]
            p.set('user_id', user.id)
            if (!p.getString('phone') || !p.getString('birth_date')) p.set('profile_pending', true)
            app.saveNoValidate(p)
            continue
          }
        }

        const p = new Record(people)
        p.set('church_id', churchId)
        p.set('name', name || 'Sem nome')
        p.set('email', email)
        p.set('phone', m.getString('phone'))
        p.set('status', 'CONGREGADO')
        p.set('is_active', true)
        p.set('user_id', user.id)
        p.set('profile_pending', true)
        app.saveNoValidate(p)
      } catch (err) {
        console.log('[0090] ficha de ' + email + ': ' + err)
      }
    }
  },
  (app) => {
    try {
      const members = app.findCollectionByNameOrId('church_members')
      members.fields.removeByName('display_name')
      app.save(members)
    } catch (_) {}
    try {
      const people = app.findCollectionByNameOrId('people')
      people.fields.removeByName('profile_pending')
      app.save(people)
    } catch (_) {}
  },
)
