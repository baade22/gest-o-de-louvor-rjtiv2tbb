// Conta de acesso <-> ficha em Membros (migração 0090)
//
// - church_members.display_name guarda o nome da pessoa, porque a coleção users só deixa
//   cada um ver a própria conta (sem isso a escala mostrava "Membro" para todos).
// - Toda conta ativa numa igreja tem a sua ficha em `people`: ao entrar por convite (ou ser
//   reativada) liga a ficha com o mesmo e-mail ou cria uma nova com profile_pending = true,
//   e a pessoa completa o cadastro no primeiro acesso (hook me_profile.js).
// Os handlers do JSVM não enxergam funções de fora deles, por isso o código fica dentro.

const churchMemberPeopleSync = (e) => {
  e.next()
  const m = e.record
  try {
    let user = null
    try {
      user = e.app.findRecordById('_pb_users_auth_', m.getString('user_id'))
    } catch (_) {}
    if (!user) return
    const email = user.getString('email')
    const name = user.getString('name') || (email ? email.split('@')[0] : '')

    if (!m.getString('display_name') && name) {
      const fresh = e.app.findRecordById('church_members', m.id)
      fresh.set('display_name', name)
      e.app.saveNoValidate(fresh)
    }
    if (!m.getBool('is_active')) return

    const churchId = m.getString('church_id')
    const linked = e.app.findRecordsByFilter(
      'people',
      'church_id = {:c} && user_id = {:u}',
      '',
      1,
      0,
      { c: churchId, u: user.id },
    )
    if (linked.length > 0) return

    if (email) {
      const byEmail = e.app.findRecordsByFilter(
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
        e.app.saveNoValidate(p)
        return
      }
    }

    const p = new Record(e.app.findCollectionByNameOrId('people'))
    p.set('church_id', churchId)
    p.set('name', name || 'Sem nome')
    p.set('email', email)
    p.set('phone', m.getString('phone'))
    p.set('status', 'CONGREGADO')
    p.set('is_active', true)
    p.set('user_id', user.id)
    p.set('profile_pending', true)
    e.app.saveNoValidate(p)
  } catch (err) {
    console.log('[church_members_people] ' + err)
  }
}

onRecordAfterCreateSuccess(churchMemberPeopleSync, 'church_members')
onRecordAfterUpdateSuccess(churchMemberPeopleSync, 'church_members')

// Nome da conta mudou: atualiza o nome mostrado na escala
onRecordAfterUpdateSuccess((e) => {
  e.next()
  try {
    const name = e.record.getString('name')
    if (!name) return
    const list = e.app.findRecordsByFilter('church_members', 'user_id = {:u}', '', 50, 0, {
      u: e.record.id,
    })
    for (let i = 0; i < list.length; i++) {
      if (list[i].getString('display_name') === name) continue
      list[i].set('display_name', name)
      e.app.saveNoValidate(list[i])
    }
  } catch (err) {
    console.log('[church_members_people] nome: ' + err)
  }
}, 'users')
