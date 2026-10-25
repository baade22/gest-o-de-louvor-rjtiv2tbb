// Inscrição pública em eventos da igreja (link / QR code) — sem login.
//
// GET  /backend/v1/event-signup/info?key=...  → dados públicos do evento e vagas
// POST /backend/v1/event-signup               → grava a inscrição (não paga)
//
// A chave é church_events.public_key. O evento precisa estar com inscrições
// abertas e com vaga. Limite por IP configurado na migração 0047.

routerAdd('GET', '/backend/v1/event-signup/info', (e) => {
  let key = ''
  try {
    key = String(e.requestInfo().query.key || '').trim()
  } catch (_) {}
  if (!/^[A-Za-z0-9]{20,40}$/.test(key)) {
    return e.json(404, { valid: false, message: 'Link de inscrição inválido.' })
  }
  try {
    const found = $app.findRecordsByFilter('church_events', 'public_key = {:key}', '', 1, 0, {
      key: key,
    })
    if (found.length === 0) {
      return e.json(404, { valid: false, message: 'Evento não encontrado.' })
    }
    const ev = found[0]
    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', ev.getString('church_id')).getString('name')
    } catch (_) {}
    const capacity = ev.getInt('capacity')
    let taken = 0
    if (capacity > 0) {
      taken = $app.countRecords('church_event_registrations', $dbx.hashExp({ event_id: ev.id }))
    }
    return e.json(200, {
      valid: true,
      open: ev.getBool('registration_open') && (capacity === 0 || taken < capacity),
      closed_reason: !ev.getBool('registration_open')
        ? 'closed'
        : capacity > 0 && taken >= capacity
          ? 'full'
          : '',
      church_name: churchName,
      title: ev.getString('title'),
      description: ev.getString('description'),
      starts_on: ev.getString('starts_on'),
      ends_on: ev.getString('ends_on'),
      start_time: ev.getString('start_time'),
      location: ev.getString('location'),
      price: ev.getFloat('price'),
      payment_info: ev.getString('payment_info'),
      spots_left: capacity > 0 ? Math.max(0, capacity - taken) : null,
    })
  } catch (err) {
    return e.json(500, { valid: false, message: 'Não foi possível abrir a inscrição agora.' })
  }
})

routerAdd('POST', '/backend/v1/event-signup', (e) => {
  const body = e.requestInfo().body || {}
  const text = (v, max) =>
    String(v == null ? '' : v)
      .trim()
      .slice(0, max)

  // Campo invisível no formulário: robôs preenchem, pessoas não
  if (text(body.website, 200) !== '') return e.json(200, { ok: true })

  const key = text(body.key, 40)
  if (!/^[A-Za-z0-9]{20,40}$/.test(key))
    return e.json(404, { message: 'Link de inscrição inválido.' })

  const name = text(body.name, 200).replace(/\s+/g, ' ')
  const phone = text(body.phone, 40)
  const email = text(body.email, 200).toLowerCase()
  if (name.length < 3) return e.json(400, { message: 'Informe o nome completo.' })
  if (phone.replace(/\D/g, '').length < 8)
    return e.json(400, { message: 'Informe um telefone com DDD.' })
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return e.json(400, { message: 'Confira o e-mail.' })
  if (body.consent !== true) {
    return e.json(400, { message: 'É preciso concordar com o uso dos dados pela igreja.' })
  }

  let ev
  try {
    const found = $app.findRecordsByFilter('church_events', 'public_key = {:key}', '', 1, 0, {
      key: key,
    })
    if (found.length === 0) return e.json(404, { message: 'Evento não encontrado.' })
    ev = found[0]
  } catch (err) {
    return e.json(500, { message: 'Não foi possível enviar agora. Tente de novo em instantes.' })
  }
  if (!ev.getBool('registration_open')) {
    return e.json(400, { message: 'As inscrições deste evento estão encerradas.' })
  }
  const capacity = ev.getInt('capacity')
  if (capacity > 0) {
    const taken = $app.countRecords('church_event_registrations', $dbx.hashExp({ event_id: ev.id }))
    if (taken >= capacity) return e.json(400, { message: 'As vagas deste evento acabaram.' })
  }

  try {
    const col = $app.findCollectionByNameOrId('church_event_registrations')
    const rec = new Record(col)
    rec.set('church_id', ev.getString('church_id'))
    rec.set('event_id', ev.id)
    rec.set('name', name)
    rec.set('phone', phone)
    rec.set('email', email)
    rec.set('notes', text(body.notes, 500))
    rec.set('source', 'LINK')
    rec.set('paid', ev.getFloat('price') <= 0)
    rec.set('payment_method', ev.getFloat('price') <= 0 ? 'ISENTO' : '')
    $app.save(rec)
    return e.json(200, {
      ok: true,
      price: ev.getFloat('price'),
      payment_info: ev.getString('payment_info'),
    })
  } catch (err) {
    return e.json(400, { message: 'Confira os dados e tente de novo.' })
  }
})
