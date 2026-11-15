// Site e App da igreja: rotas do painel (migração 0098). Chaves admin.site.ver / admin.site.alterar.
//
// POST /backend/v1/site/options { church_id }
//   o que o painel precisa de outros módulos, sem exigir as chaves deles: eventos da igreja que
//   ainda vão acontecer (com "mostrar no site"), links de autocadastro (para o "Sou novo"),
//   se a chave PIX está cadastrada e as campanhas públicas.
// POST /backend/v1/site/event { church_id, event_id, show }
//   liga/desliga um evento na agenda do site.
//
// Como em todo hook, cada handler roda isolado: os helpers ficam dentro de cada um.

routerAdd('POST', '/backend/v1/site/options', (e) => {
  const auth = e.auth
  if (!auth) return e.json(401, { message: 'Não autorizado' })
  const body = e.requestInfo().body || {}
  const churchId = String(body.church_id || '')
  if (!/^[a-z0-9]{15}$/.test(churchId)) return e.json(400, { message: 'church_id é obrigatório' })
  let member = null
  try {
    member = $app.findFirstRecordByFilter(
      'church_members',
      'church_id = {:c} && user_id = {:u} && is_active = true',
      { c: churchId, u: auth.id },
    )
  } catch (_) {
    return e.json(403, { message: 'Você não tem acesso a esta igreja.' })
  }
  let keys = []
  try {
    keys = JSON.parse(member.getString('permissions') || '[]') || []
  } catch (_) {}
  const isMaster = member.getString('role') === 'MASTER' || keys.indexOf('*') !== -1
  if (!isMaster && keys.indexOf('admin.site.ver') === -1)
    return e.json(403, { message: 'Você não tem acesso ao Site e App.' })

  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const events = []
  try {
    const rows = $app.findRecordsByFilter(
      'church_events',
      "church_id = {:c} && closed_at = ''",
      'starts_on',
      200,
      0,
      { c: churchId },
    )
    for (const ev of rows) {
      const start = ev.getString('starts_on').slice(0, 10)
      const end = ev.getString('ends_on').slice(0, 10) || start
      if (end < today) continue
      events.push({
        id: ev.id,
        title: ev.getString('title'),
        starts_on: start,
        ends_on: end,
        start_time: ev.getString('start_time'),
        has_link: !!ev.getString('public_key'),
        registration_open: ev.getBool('registration_open') && !ev.getBool('publish_only'),
        show_on_site: ev.getBool('show_on_site'),
      })
    }
  } catch (_) {}

  const links = []
  try {
    const rows = $app.findRecordsByFilter(
      'people_signup_links',
      'church_id = {:c}',
      'title',
      50,
      0,
      {
        c: churchId,
      },
    )
    for (const l of rows)
      links.push({ id: l.id, title: l.getString('title'), active: l.getBool('active') })
  } catch (_) {}

  let pix = false
  try {
    pix = !!$app
      .findFirstRecordByFilter('fin_settings', 'church_id = {:c}', { c: churchId })
      .getString('pix_key')
  } catch (_) {}

  const campaigns = []
  try {
    const rows = $app.findRecordsByFilter(
      'fin_campaigns',
      "church_id = {:c} && is_public = true && status = 'ATIVA'",
      'name',
      20,
      0,
      { c: churchId },
    )
    for (const c of rows) campaigns.push({ id: c.id, name: c.getString('name') })
  } catch (_) {}

  return e.json(200, {
    events: events,
    signup_links: links,
    pix_configured: pix,
    campaigns: campaigns,
  })
})

routerAdd('POST', '/backend/v1/site/event', (e) => {
  const auth = e.auth
  if (!auth) return e.json(401, { message: 'Não autorizado' })
  const body = e.requestInfo().body || {}
  const churchId = String(body.church_id || '')
  const eventId = String(body.event_id || '')
  if (!/^[a-z0-9]{15}$/.test(churchId) || !/^[a-z0-9]{15}$/.test(eventId))
    return e.json(400, { message: 'Dados inválidos.' })
  let member = null
  try {
    member = $app.findFirstRecordByFilter(
      'church_members',
      'church_id = {:c} && user_id = {:u} && is_active = true',
      { c: churchId, u: auth.id },
    )
  } catch (_) {
    return e.json(403, { message: 'Você não tem acesso a esta igreja.' })
  }
  let keys = []
  try {
    keys = JSON.parse(member.getString('permissions') || '[]') || []
  } catch (_) {}
  const isMaster = member.getString('role') === 'MASTER' || keys.indexOf('*') !== -1
  if (!isMaster && keys.indexOf('admin.site.alterar') === -1)
    return e.json(403, { message: 'Seu perfil não permite alterar o Site e App.' })

  let ev = null
  try {
    ev = $app.findRecordById('church_events', eventId)
  } catch (_) {}
  if (!ev || ev.getString('church_id') !== churchId)
    return e.json(404, { message: 'Evento não encontrado.' })
  const show = body.show === true
  if (show && !ev.getString('public_key'))
    return e.json(400, { message: 'O evento ainda não tem página pública (link de inscrição).' })
  ev.set('show_on_site', show)
  $app.saveNoValidate(ev)
  return e.json(200, { ok: true, show_on_site: show })
})
