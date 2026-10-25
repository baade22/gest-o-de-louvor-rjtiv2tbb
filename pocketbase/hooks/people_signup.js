// Autocadastro da membresia (QR code / link) — acesso público, sem login.
//
// GET  /backend/v1/signup/info?key=...  → nome da igreja e congregação do link
// POST /backend/v1/signup               → grava a ficha em people_signups (PENDENTE)
//
// A chave vem do QR code (people_signup_links.key) e o link precisa estar ativo.
// A ficha só vira membro depois que um MASTER/ADMIN aprova no LouvorFlow.
// Limite por IP configurado na migração 0045.

routerAdd('GET', '/backend/v1/signup/info', (e) => {
  let key = ''
  try {
    key = String(e.requestInfo().query.key || '').trim()
  } catch (_) {}
  if (!/^[A-Za-z0-9]{20,40}$/.test(key)) {
    return e.json(404, { valid: false, message: 'Link de cadastro inválido.' })
  }

  try {
    const found = $app.findRecordsByFilter('people_signup_links', 'key = {:key}', '', 1, 0, { key: key })
    if (found.length === 0 || !found[0].getBool('active')) {
      return e.json(404, {
        valid: false,
        message: 'Este link de cadastro não está mais ativo. Peça um novo à secretaria da igreja.',
      })
    }
    const link = found[0]
    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', link.getString('church_id')).getString('name')
    } catch (_) {}
    return e.json(200, {
      valid: true,
      church_name: churchName,
      congregation: link.getString('congregation'),
      title: link.getString('title'),
    })
  } catch (err) {
    return e.json(500, { valid: false, message: 'Não foi possível abrir o cadastro agora.' })
  }
})

routerAdd('POST', '/backend/v1/signup', (e) => {
  const body = e.requestInfo().body || {}

  const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max)
  const oneOf = (v, list) => (list.indexOf(String(v || '')) >= 0 ? String(v) : '')
  const ymd = (v) => {
    const s = String(v || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
    const year = Number(s.slice(0, 4))
    const now = new Date().getFullYear()
    return year >= 1900 && year <= now ? s + ' 00:00:00.000Z' : ''
  }

  // Campo invisível no formulário: robôs preenchem, pessoas não
  if (text(body.website, 200) !== '') {
    return e.json(200, { ok: true })
  }

  const key = text(body.key, 40)
  if (!/^[A-Za-z0-9]{20,40}$/.test(key)) {
    return e.json(404, { message: 'Link de cadastro inválido.' })
  }

  const name = text(body.name, 200).replace(/\s+/g, ' ')
  const phone = text(body.phone, 40)
  const email = text(body.email, 200).toLowerCase()
  const relationship = oneOf(body.relationship, ['VISITANTE', 'FREQUENTA', 'MEMBRO'])

  if (name.length < 3) return e.json(400, { message: 'Informe o nome completo.' })
  if (!relationship) return e.json(400, { message: 'Diga se é visitante, se frequenta ou se já é membro.' })
  if (!phone && !email) return e.json(400, { message: 'Informe um telefone ou um e-mail para contato.' })
  if (phone && phone.replace(/\D/g, '').length < 8) return e.json(400, { message: 'Confira o telefone.' })
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return e.json(400, { message: 'Confira o e-mail.' })
  }
  if (body.consent !== true) {
    return e.json(400, { message: 'É preciso concordar com o uso dos dados pela igreja.' })
  }

  let link
  try {
    const found = $app.findRecordsByFilter('people_signup_links', 'key = {:key}', '', 1, 0, { key: key })
    if (found.length === 0 || !found[0].getBool('active')) {
      return e.json(404, { message: 'Este link de cadastro não está mais ativo.' })
    }
    link = found[0]
  } catch (err) {
    return e.json(500, { message: 'Não foi possível enviar agora. Tente de novo em instantes.' })
  }

  try {
    const col = $app.findCollectionByNameOrId('people_signups')
    const rec = new Record(col)
    rec.set('church_id', link.getString('church_id'))
    rec.set('link_id', link.id)
    rec.set('name', name)
    rec.set('birth_date', ymd(body.birth_date))
    rec.set('gender', oneOf(body.gender, ['M', 'F']))
    rec.set(
      'marital_status',
      oneOf(body.marital_status, ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']),
    )
    rec.set('phone', phone)
    rec.set('email', email)
    rec.set('address', text(body.address, 300))
    rec.set('neighborhood', text(body.neighborhood, 120))
    rec.set('city', text(body.city, 120))
    rec.set('state', text(body.state, 2).toUpperCase())
    rec.set('zip_code', text(body.zip_code, 10))
    // A congregação do link vale mais que a digitada (QR da Aldeia → Aldeia)
    rec.set('congregation', link.getString('congregation') || text(body.congregation, 120))
    rec.set('relationship', relationship)
    rec.set('baptized', body.baptized === true)
    rec.set('how_found', text(body.how_found, 200))
    rec.set('prayer_request', text(body.prayer_request, 1000))
    rec.set('status', 'PENDENTE')
    $app.save(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    return e.json(400, { message: 'Confira os dados e tente de novo.' })
  }
})
