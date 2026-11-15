// Eventos da igreja: avisos aos inscritos pelo WhatsApp da igreja (fila do whatsapp_queue.js).
//
// - Mudança de data, horário ou local de um evento que ainda não passou: cada inscrito recebe
//   como o evento ficou (EVENTO_ALTERACAO). Sai 10 minutos depois da última edição; editar de
//   novo nesse tempo troca a mensagem que estava na fila, para não mandar uma por ajuste.
// - Evento futuro apagado: aviso de cancelamento aos inscritos (também EVENTO_ALTERACAO).
// - Véspera, às 8h (Brasília): lembrete para os inscritos de quem começa amanhã
//   (LEMBRETE_EVENTO), com aviso de pagamento pendente quando houver.
// - POST /backend/v1/church-events/{id}/whatsapp: mensagem livre da equipe para os inscritos
//   (todos, pagos, pendentes, presentes ou ausentes), com {nome}, {evento}, {data}, {local},
//   {valor} e {igreja} preenchidos para cada um (EVENTO_MENSAGEM). Pode quem pode editar o
//   evento (as regras da coleção dizem quem).
//
// Os envios automáticos só acontecem se estiverem ligados em Configurações > WhatsApp. Cada
// handler roda isolado no PocketBase, por isso os ajudantes se repetem dentro de cada um.

onRecordAfterUpdateSuccess((e) => {
  e.next()
  const ev = e.record
  const orig = ev.original()
  if (!orig) return
  const WATCH = [
    'starts_on',
    'ends_on',
    'start_time',
    'location',
    'address_street',
    'address_number',
    'address_district',
    'address_city',
  ]
  let changed = false
  for (const f of WATCH) {
    if (ev.getString(f) !== orig.getString(f)) changed = true
  }
  if (!changed || ev.getString('closed_at')) return

  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const lastDay = (ev.getString('ends_on') || ev.getString('starts_on')).slice(0, 10)
  if (!lastDay || lastDay < today) return

  const churchId = ev.getString('church_id')
  try {
    const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
      c: churchId,
    })
    const auto = JSON.parse(st.getString('auto') || '{}') || {}
    if (auto.EVENTO_ALTERACAO !== true) return
  } catch (_) {
    return
  }

  let churchName = 'Igreja'
  try {
    churchName = $app.findRecordById('churches', churchId).getString('name')
  } catch (_) {}
  const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
  const start = ev.getString('starts_on').slice(0, 10)
  const end = ev.getString('ends_on').slice(0, 10)
  const data =
    (end && end !== start ? dmy(start) + ' a ' + dmy(end) : dmy(start)) +
    (ev.getString('start_time') ? ', às ' + ev.getString('start_time') : '')
  const local =
    ev.getString('location') ||
    [ev.getString('address_street'), ev.getString('address_number')].filter(Boolean).join(', ')
  const address = [
    ev.getString('address_street'),
    ev.getString('address_number'),
    ev.getString('address_district'),
    ev.getString('address_city'),
  ]
    .filter(Boolean)
    .join(', ')

  const sendAfter = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const regs = $app.findRecordsByFilter('church_event_registrations', 'event_id = {:e}', '', 0, 0, {
    e: ev.id,
  })
  for (const reg of regs) {
    let to = reg.getString('phone').replace(/\D/g, '')
    while (to.indexOf('0') === 0) to = to.slice(1)
    if (to.length === 10 || to.length === 11) to = '55' + to
    if (to.length < 12 || to.length > 13) continue

    // Edição de novo dentro dos 10 minutos: a mensagem que ainda não saiu dá lugar à nova
    try {
      const pending = $app.findRecordsByFilter(
        'whatsapp_messages',
        "ref_id = {:r} && kind = 'EVENTO_ALTERACAO' && status = 'FILA'",
        '',
        0,
        0,
        { r: reg.id },
      )
      for (const p of pending) {
        p.set('status', 'CANCELADO')
        $app.save(p)
      }
    } catch (_) {}

    const lines = [
      'Olá, ' +
        reg.getString('name').split(' ')[0] +
        '! O evento *' +
        ev.getString('title') +
        '* mudou. Confira como ficou:',
      '',
      '*Data:* ' + data,
    ]
    if (local) lines.push('*Local:* ' + local)
    if (address && address !== local) lines.push('*Endereço:* ' + address)
    lines.push('', 'Qualquer dúvida, é só responder esta mensagem.', '_' + churchName + '_')
    try {
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', churchId)
      msg.set('kind', 'EVENTO_ALTERACAO')
      msg.set('phone', to)
      msg.set('name', reg.getString('name'))
      msg.set('text', lines.join('\n').slice(0, 4000))
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('ref_id', reg.id)
      msg.set('send_after', sendAfter)
      $app.save(msg)
    } catch (err) {
      $app.logger().warn('event change whatsapp failed', 'error', String(err))
    }
  }
}, 'church_events')

// Evento futuro apagado: os inscritos ficam sabendo que foi cancelado
onRecordDelete((e) => {
  const ev = e.record
  const churchId = ev.getString('church_id')
  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const lastDay = (ev.getString('ends_on') || ev.getString('starts_on')).slice(0, 10)
  let on = false
  try {
    const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
      c: churchId,
    })
    const auto = JSON.parse(st.getString('auto') || '{}') || {}
    on = auto.EVENTO_ALTERACAO === true
  } catch (_) {}

  const outbox = []
  if (on && lastDay && lastDay >= today && !ev.getString('closed_at')) {
    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', churchId).getString('name')
    } catch (_) {}
    const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
    const start = ev.getString('starts_on').slice(0, 10)
    const end = ev.getString('ends_on').slice(0, 10)
    const data = end && end !== start ? dmy(start) + ' a ' + dmy(end) : dmy(start)
    try {
      const regs = $app.findRecordsByFilter(
        'church_event_registrations',
        'event_id = {:e}',
        '',
        0,
        0,
        { e: ev.id },
      )
      for (const reg of regs) {
        let to = reg.getString('phone').replace(/\D/g, '')
        while (to.indexOf('0') === 0) to = to.slice(1)
        if (to.length === 10 || to.length === 11) to = '55' + to
        if (to.length < 12 || to.length > 13) continue
        const lines = [
          'Olá, ' +
            reg.getString('name').split(' ')[0] +
            '. O evento *' +
            ev.getString('title') +
            '* (' +
            data +
            ') foi cancelado.',
        ]
        if (reg.getBool('paid') && reg.getString('payment_method') !== 'ISENTO') {
          lines.push('', 'Como você já pagou, fale com a igreja sobre a devolução.')
        }
        lines.push('', '_' + churchName + '_')
        outbox.push({ id: reg.id, to: to, name: reg.getString('name'), text: lines.join('\n') })
      }
    } catch (_) {}
  }

  e.next()

  const sendAfter = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  for (const m of outbox) {
    try {
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', churchId)
      msg.set('kind', 'EVENTO_ALTERACAO')
      msg.set('phone', m.to)
      msg.set('name', m.name)
      msg.set('text', m.text.slice(0, 4000))
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('ref_id', m.id)
      msg.set('send_after', sendAfter)
      $app.save(msg)
    } catch (err) {
      $app.logger().warn('event cancel whatsapp failed', 'error', String(err))
    }
  }
}, 'church_events')

// Lembrete na véspera, às 8h05 de Brasília (11h05 UTC)
cronAdd('church_event_reminder', '5 11 * * *', () => {
  const tomorrow = new Date(Date.now() - 3 * 3600 * 1000 + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
  const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
  const brl = (v) => {
    const [i, d] = Number(v || 0)
      .toFixed(2)
      .split('.')
    return 'R$ ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d
  }

  let events = []
  try {
    events = $app.findRecordsByFilter(
      'church_events',
      "starts_on >= {:a} && starts_on <= {:b} && closed_at = ''",
      '',
      0,
      0,
      { a: tomorrow + ' 00:00:00', b: tomorrow + ' 23:59:59' },
    )
  } catch (_) {
    return
  }

  const autoOn = {}
  for (const ev of events) {
    const churchId = ev.getString('church_id')
    if (!(churchId in autoOn)) {
      autoOn[churchId] = false
      try {
        const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
          c: churchId,
        })
        const auto = JSON.parse(st.getString('auto') || '{}') || {}
        autoOn[churchId] = auto.LEMBRETE_EVENTO === true
      } catch (_) {}
    }
    if (!autoOn[churchId]) continue

    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', churchId).getString('name')
    } catch (_) {}
    const start = ev.getString('starts_on').slice(0, 10)
    const end = ev.getString('ends_on').slice(0, 10)
    const data =
      (end && end !== start ? dmy(start) + ' a ' + dmy(end) : dmy(start)) +
      (ev.getString('start_time') ? ', às ' + ev.getString('start_time') : '')
    const local =
      ev.getString('location') ||
      [ev.getString('address_street'), ev.getString('address_number')].filter(Boolean).join(', ')
    const price = ev.getFloat('price')

    let regs = []
    try {
      regs = $app.findRecordsByFilter('church_event_registrations', 'event_id = {:e}', '', 0, 0, {
        e: ev.id,
      })
    } catch (_) {}
    for (const reg of regs) {
      let to = reg.getString('phone').replace(/\D/g, '')
      while (to.indexOf('0') === 0) to = to.slice(1)
      if (to.length === 10 || to.length === 11) to = '55' + to
      if (to.length < 12 || to.length > 13) continue
      try {
        const sent = $app.findRecordsByFilter(
          'whatsapp_messages',
          "ref_id = {:r} && kind = 'LEMBRETE_EVENTO'",
          '',
          1,
          0,
          { r: reg.id },
        )
        if (sent.length) continue
      } catch (_) {}

      const lines = [
        'Olá, ' +
          reg.getString('name').split(' ')[0] +
          '! Lembrete: amanhã tem *' +
          ev.getString('title') +
          '*.',
        '',
        '*Data:* ' + data,
      ]
      if (local) lines.push('*Local:* ' + local)
      const due = reg.getFloat('amount_due') > 0 ? reg.getFloat('amount_due') : price
      if (due > 0 && !reg.getBool('paid')) {
        lines.push('', 'Sua inscrição ainda está com o pagamento pendente (' + brl(due) + ').')
      }
      lines.push('', 'Até amanhã!', '_' + churchName + '_')
      try {
        const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
        msg.set('church_id', churchId)
        msg.set('kind', 'LEMBRETE_EVENTO')
        msg.set('phone', to)
        msg.set('name', reg.getString('name'))
        msg.set('text', lines.join('\n').slice(0, 4000))
        msg.set('status', 'FILA')
        msg.set('attempts', 0)
        msg.set('ref_id', reg.id)
        msg.set('send_after', new Date().toISOString())
        $app.save(msg)
      } catch (err) {
        $app.logger().warn('event reminder whatsapp failed', 'error', String(err))
      }
    }
  }
})

// Mensagem livre da equipe para os inscritos de um evento
routerAdd(
  'POST',
  '/backend/v1/church-events/{id}/whatsapp',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    let ev
    try {
      ev = $app.findRecordById('church_events', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { message: 'Evento não encontrado' })
    }
    // Pode mandar quem pode editar o evento
    let allowed = false
    try {
      const col = $app.findCollectionByNameOrId('church_events')
      allowed = $app.canAccessRecord(ev, e.requestInfo(), col.updateRule)
    } catch (_) {}
    if (!allowed) return e.json(403, { message: 'Permissão insuficiente' })

    const churchId = ev.getString('church_id')
    try {
      $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', { c: churchId })
    } catch (_) {
      return e.json(400, {
        message: 'O WhatsApp da igreja ainda não foi conectado (Configurações > WhatsApp).',
      })
    }

    const body = e.requestInfo().body || {}
    const template = String(body.text || '').trim()
    const target = String(body.to || 'TODOS')
    if (!template) return e.json(400, { message: 'Escreva a mensagem.' })
    if (template.length > 3000) return e.json(400, { message: 'Mensagem longa demais.' })
    if (['TODOS', 'PAGOS', 'PENDENTES', 'PRESENTES', 'AUSENTES'].indexOf(target) === -1) {
      return e.json(400, { message: 'Escolha para quem mandar.' })
    }

    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', churchId).getString('name')
    } catch (_) {}
    const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
    const brl = (v) => {
      const [i, d] = Number(v || 0)
        .toFixed(2)
        .split('.')
      return 'R$ ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d
    }
    const start = ev.getString('starts_on').slice(0, 10)
    const end = ev.getString('ends_on').slice(0, 10)
    const price = ev.getFloat('price')
    const base = {
      evento: ev.getString('title'),
      data:
        (end && end !== start ? dmy(start) + ' a ' + dmy(end) : dmy(start)) +
        (ev.getString('start_time') ? ', ' + ev.getString('start_time') : ''),
      local:
        ev.getString('location') ||
        [ev.getString('address_street'), ev.getString('address_number')].filter(Boolean).join(', '),
      igreja: churchName,
    }
    // Mesmo formato do editor de texto do evento: **negrito**, *itálico* e # título
    const toWhatsApp = (s) =>
      s
        .split('\n')
        .map((l) => l.replace(/^#{1,3}\s+(.*)$/, '**$1**'))
        .join('\n')
        .replace(/\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g, (_, b, i) =>
          b !== undefined ? '*' + b + '*' : '_' + i + '_',
        )

    const regs = $app.findRecordsByFilter(
      'church_event_registrations',
      'event_id = {:e}',
      'name',
      0,
      0,
      { e: ev.id },
    )
    let queued = 0
    let noPhone = 0
    const now = new Date().toISOString()
    for (const reg of regs) {
      const due = reg.getFloat('amount_due') > 0 ? reg.getFloat('amount_due') : price
      const pays = due > 0 && reg.getString('payment_method') !== 'ISENTO'
      if (target === 'PAGOS' && !(pays && reg.getBool('paid'))) continue
      if (target === 'PENDENTES' && !(pays && !reg.getBool('paid'))) continue
      if (target === 'PRESENTES' && !reg.getBool('attended')) continue
      if (target === 'AUSENTES' && reg.getBool('attended')) continue

      let to = reg.getString('phone').replace(/\D/g, '')
      while (to.indexOf('0') === 0) to = to.slice(1)
      if (to.length === 10 || to.length === 11) to = '55' + to
      if (to.length < 12 || to.length > 13) {
        noPhone++
        continue
      }
      const vars = Object.assign({}, base, {
        nome: reg.getString('name').split(' ')[0],
        valor: due > 0 ? brl(due) : 'gratuito',
      })
      const text = toWhatsApp(
        template.replace(/\{(\w+)\}/g, (all, k) =>
          Object.prototype.hasOwnProperty.call(vars, k.toLowerCase()) ? vars[k.toLowerCase()] : all,
        ),
      )
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', churchId)
      msg.set('kind', 'EVENTO_MENSAGEM')
      msg.set('phone', to)
      msg.set('name', reg.getString('name'))
      msg.set('text', text.slice(0, 4000))
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('ref_id', reg.id)
      msg.set('send_after', now)
      $app.save(msg)
      queued++
    }
    return e.json(200, { queued: queued, no_phone: noPhone })
  },
  $apis.requireAuth(),
)
