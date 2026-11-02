// Meu cadastro: a própria pessoa lê e completa a sua ficha em Membros (migração 0090)
// GET  /backend/v1/me/profile?church_id=...  -> { pending, profile }
// POST /backend/v1/me/profile  { church_id, name, birth_date, phone, ... } -> { profile }
// A coleção people só é aberta para quem cuida da Membresia; aqui a pessoa mexe só na
// PRÓPRIA ficha (ligada pela conta) e só nos campos pessoais. Situação (membro, congregado),
// datas de batismo/admissão e observações continuam com a liderança.

routerAdd(
  'GET',
  '/backend/v1/me/profile',
  (e) => {
    const churchId = String(e.request.url.query().get('church_id') || '')
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })
    const uid = e.auth.id
    const active = $app.findRecordsByFilter(
      'church_members',
      'church_id = {:c} && user_id = {:u} && is_active = true',
      '',
      1,
      0,
      { c: churchId, u: uid },
    )
    if (active.length === 0) return e.json(403, { message: 'Sem acesso a esta igreja' })

    const list = $app.findRecordsByFilter(
      'people',
      'church_id = {:c} && user_id = {:u}',
      '',
      1,
      0,
      { c: churchId, u: uid },
    )
    if (list.length === 0) return e.json(200, { pending: false, profile: null })
    const p = list[0]
    const date = (k) => (p.getString(k) || '').substring(0, 10)
    return e.json(200, {
      pending: p.getBool('profile_pending'),
      profile: {
        id: p.id,
        name: p.getString('name'),
        birth_date: date('birth_date'),
        phone: p.getString('phone'),
        email: p.getString('email'),
        gender: p.getString('gender'),
        marital_status: p.getString('marital_status'),
        zip_code: p.getString('zip_code'),
        address: p.getString('address'),
        neighborhood: p.getString('neighborhood'),
        city: p.getString('city'),
        state: p.getString('state'),
        congregation: p.getString('congregation'),
        status: p.getString('status'),
      },
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/me/profile',
  (e) => {
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })
    const uid = e.auth.id
    const active = $app.findRecordsByFilter(
      'church_members',
      'church_id = {:c} && user_id = {:u} && is_active = true',
      '',
      1,
      0,
      { c: churchId, u: uid },
    )
    if (active.length === 0) return e.json(403, { message: 'Sem acesso a esta igreja' })

    const txt = (k, max) =>
      String(body[k] === undefined || body[k] === null ? '' : body[k])
        .trim()
        .substring(0, max)
    const name = txt('name', 200)
    const birth = txt('birth_date', 10)
    const phone = txt('phone', 40)
    if (name.split(/\s+/).filter(Boolean).length < 2)
      return e.json(400, { message: 'Informe o nome completo (nome e sobrenome).' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth))
      return e.json(400, { message: 'Informe a data de nascimento.' })
    if (phone.replace(/\D/g, '').length < 10)
      return e.json(400, { message: 'Informe o celular com DDD.' })

    const gender = txt('gender', 1)
    const marital = txt('marital_status', 20)
    const MARITAL = ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']

    let p = null
    const list = $app.findRecordsByFilter(
      'people',
      'church_id = {:c} && user_id = {:u}',
      '',
      1,
      0,
      { c: churchId, u: uid },
    )
    if (list.length > 0) {
      p = list[0]
    } else {
      p = new Record($app.findCollectionByNameOrId('people'))
      p.set('church_id', churchId)
      p.set('user_id', uid)
      p.set('email', e.auth.getString('email'))
      p.set('status', 'CONGREGADO')
      p.set('is_active', true)
    }
    p.set('name', name)
    p.set('birth_date', birth + ' 12:00:00.000Z')
    p.set('phone', phone)
    p.set('gender', gender === 'M' || gender === 'F' ? gender : '')
    p.set('marital_status', MARITAL.indexOf(marital) >= 0 ? marital : '')
    p.set('zip_code', txt('zip_code', 10))
    p.set('address', txt('address', 300))
    p.set('neighborhood', txt('neighborhood', 120))
    p.set('city', txt('city', 120))
    p.set('state', txt('state', 2).toUpperCase())
    p.set('congregation', txt('congregation', 120))
    p.set('profile_pending', false)
    try {
      $app.save(p)
    } catch (err) {
      return e.json(400, { message: 'Não foi possível salvar: ' + err.message })
    }

    // O nome completo também vira o nome da conta (e o da escala, pelo hook de users)
    try {
      const user = $app.findRecordById('_pb_users_auth_', uid)
      if (user.getString('name') !== name) {
        user.set('name', name)
        $app.save(user)
      }
    } catch (_) {}
    try {
      const m = active[0]
      m.set('display_name', name)
      if (!m.getString('phone')) m.set('phone', phone)
      $app.saveNoValidate(m)
    } catch (_) {}

    return e.json(200, { profile: { id: p.id, name: name } })
  },
  $apis.requireAuth(),
)
