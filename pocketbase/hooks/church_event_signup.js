// Inscrição pública em eventos da igreja (link / QR code) — sem login.
//
// GET  /backend/v1/event-signup/info?key=...         → dados públicos do evento, vagas e Pix
// GET  /backend/v1/event-signup/coupon?key=&code=    → confere um cupom e devolve o valor
// POST /backend/v1/event-signup                      → grava a inscrição (não paga) e
//                                                      devolve o código do comprovante
//
// A chave é church_events.public_key. O evento precisa estar com inscrições abertas, dentro
// do prazo e com vaga. Limites por IP nas migrações 0047 e 0068. Depois de gravar, devolve a
// mensagem de confirmação do evento e, se marcado, manda por e-mail (SMTP da igreja).
//
// As contas de cupom e a troca de {nome}, {evento}... repetem src/lib/eventPage.ts.

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
    const churchId = ev.getString('church_id')
    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', churchId).getString('name')
    } catch (_) {}
    const capacity = ev.getInt('capacity')
    let taken = 0
    if (capacity > 0) {
      taken = $app.countRecords('church_event_registrations', $dbx.hashExp({ event_id: ev.id }))
    }

    // Mesma ordem de src/lib/eventPage.ts (signupClosedReason)
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
    const deadline = ev.getString('registration_deadline').slice(0, 10)
    let reason = ''
    if (ev.getString('closed_at')) reason = 'ended'
    else if (ev.getBool('publish_only')) reason = 'soon'
    else if (!ev.getBool('registration_open')) reason = 'closed'
    else if (deadline && today > deadline) reason = 'deadline'
    else if (capacity > 0 && taken >= capacity) reason = 'full'

    const price = ev.getFloat('price')
    let pix = null
    if (price > 0) {
      try {
        const s = $app.findFirstRecordByFilter('fin_settings', 'church_id = {:c}', { c: churchId })
        if (s.getString('pix_key')) {
          pix = {
            key: s.getString('pix_key'),
            key_type: s.getString('pix_key_type'),
            name: s.getString('pix_name') || s.getString('legal_name') || churchName,
            city: s.getString('pix_city') || s.getString('city'),
          }
        }
      } catch (_) {}
    }
    let coupons = []
    try {
      coupons = JSON.parse(ev.getString('coupons') || '[]') || []
    } catch (_) {}
    const file = (name) => {
      const f = ev.getString(name)
      return f ? '/api/files/church_events/' + ev.id + '/' + f : ''
    }

    return e.json(200, {
      valid: true,
      open: reason === '',
      closed_reason: reason,
      church_name: churchName,
      title: ev.getString('title'),
      description: ev.getString('description'),
      starts_on: ev.getString('starts_on'),
      ends_on: ev.getString('ends_on'),
      start_time: ev.getString('start_time'),
      location: ev.getString('location'),
      address_cep: ev.getString('address_cep'),
      address_street: ev.getString('address_street'),
      address_number: ev.getString('address_number'),
      address_complement: ev.getString('address_complement'),
      address_district: ev.getString('address_district'),
      address_city: ev.getString('address_city'),
      address_state: ev.getString('address_state'),
      contact_name: ev.getString('contact_name'),
      contact_phone: ev.getString('contact_phone'),
      registration_deadline: ev.getString('registration_deadline'),
      cover_url: file('cover'),
      cover_side_url: file('cover_side'),
      color: ev.getString('color'),
      hide_header: ev.getBool('hide_header'),
      couple_only: ev.getBool('couple_only'),
      paid_event: price > 0,
      // "Esconder o valor": o preço só vem na resposta da inscrição
      price: ev.getBool('hide_price') ? null : price,
      payment_info: ev.getBool('hide_price') ? '' : ev.getString('payment_info'),
      has_coupons: price > 0 && Array.isArray(coupons) && coupons.length > 0,
      questions: (() => {
        let qs = []
        try {
          qs = JSON.parse(ev.getString('questions') || '[]') || []
        } catch (_) {}
        return (Array.isArray(qs) ? qs : []).map((q) => ({
          id: String(q.id || ''),
          label: String(q.label || ''),
          kind: String(q.kind || 'TEXT'),
          options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
          required: !!q.required,
        }))
      })(),
      pix: pix,
      spots_left: capacity > 0 ? Math.max(0, capacity - taken) : null,
    })
  } catch (err) {
    return e.json(500, { valid: false, message: 'Não foi possível abrir a inscrição agora.' })
  }
})

routerAdd('GET', '/backend/v1/event-signup/coupon', (e) => {
  let q = {}
  try {
    q = e.requestInfo().query || {}
  } catch (_) {}
  const key = String(q.key || '').trim()
  // O navegador já manda o código sem acento (normalizeCouponCode)
  const norm = (c) =>
    String(c || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 30)
  const code = norm(q.code)
  if (!/^[A-Za-z0-9]{20,40}$/.test(key) || !code) {
    return e.json(400, { valid: false, message: 'Cupom inválido.' })
  }
  try {
    const ev = $app.findFirstRecordByFilter('church_events', 'public_key = {:key}', { key: key })
    let coupons = []
    try {
      coupons = JSON.parse(ev.getString('coupons') || '[]') || []
    } catch (_) {}
    const coupon = (Array.isArray(coupons) ? coupons : []).find((c) => norm(c.code) === code)
    if (!coupon) return e.json(404, { valid: false, message: 'Cupom não encontrado.' })
    const limit = Number(coupon.limit) || 0
    if (limit > 0) {
      const used = $app.countRecords(
        'church_event_registrations',
        $dbx.hashExp({ event_id: ev.id, coupon_code: code }),
      )
      if (used >= limit) return e.json(400, { valid: false, message: 'Este cupom já esgotou.' })
    }
    const base = Math.max(0, ev.getFloat('price'))
    const value = Number(coupon.value) || 0
    const off = coupon.kind === 'PERCENT' ? (base * Math.min(value, 100)) / 100 : value
    const amount = Math.max(0, Math.round((base - off) * 100) / 100)
    return e.json(200, { valid: true, code: code, amount: amount })
  } catch (_) {
    return e.json(404, { valid: false, message: 'Cupom não encontrado.' })
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
  const partnerName = text(body.partner_name, 200).replace(/\s+/g, ' ')
  const partnerPhone = text(body.partner_phone, 40)
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
  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const deadline = ev.getString('registration_deadline').slice(0, 10)
  if (
    ev.getString('closed_at') ||
    ev.getBool('publish_only') ||
    !ev.getBool('registration_open') ||
    (deadline && today > deadline)
  ) {
    return e.json(400, { message: 'As inscrições deste evento estão encerradas.' })
  }
  if (ev.getBool('couple_only') && partnerName.length < 3) {
    return e.json(400, { message: 'Informe o nome do cônjuge.' })
  }
  // Questionário: guarda só as perguntas do evento e confere as obrigatórias
  // (mesmas regras de cleanAnswers em src/lib/eventPage.ts)
  let questions = []
  try {
    questions = JSON.parse(ev.getString('questions') || '[]') || []
  } catch (_) {}
  const given = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const answers = {}
  for (const q of Array.isArray(questions) ? questions : []) {
    const qid = String(q.id || '')
    if (!qid) continue
    let v = text(given[qid], 500)
    if (q.kind === 'YESNO' && v !== 'Sim' && v !== 'Não') v = ''
    if (q.kind === 'CHOICE' && (Array.isArray(q.options) ? q.options : []).indexOf(v) === -1) v = ''
    if (q.required && !v) {
      return e.json(400, { message: 'Responda: ' + String(q.label || '').slice(0, 120) })
    }
    if (v) answers[qid] = v
  }

  const capacity = ev.getInt('capacity')
  if (capacity > 0) {
    const taken = $app.countRecords('church_event_registrations', $dbx.hashExp({ event_id: ev.id }))
    if (taken >= capacity) return e.json(400, { message: 'As vagas deste evento acabaram.' })
  }

  // Cupom (mesma conta de priceWithCoupon em src/lib/eventPage.ts)
  const price = Math.max(0, ev.getFloat('price'))
  let amount = price
  let couponCode = ''
  const norm = (c) =>
    String(c || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 30)
  const wanted = norm(body.coupon)
  if (wanted && price > 0) {
    let coupons = []
    try {
      coupons = JSON.parse(ev.getString('coupons') || '[]') || []
    } catch (_) {}
    const coupon = (Array.isArray(coupons) ? coupons : []).find((c) => norm(c.code) === wanted)
    if (!coupon) return e.json(400, { message: 'Cupom não encontrado.' })
    const limit = Number(coupon.limit) || 0
    if (limit > 0) {
      const used = $app.countRecords(
        'church_event_registrations',
        $dbx.hashExp({ event_id: ev.id, coupon_code: wanted }),
      )
      if (used >= limit) return e.json(400, { message: 'Este cupom já esgotou.' })
    }
    const value = Number(coupon.value) || 0
    const off = coupon.kind === 'PERCENT' ? (price * Math.min(value, 100)) / 100 : value
    amount = Math.max(0, Math.round((price - off) * 100) / 100)
    couponCode = wanted
  }

  let rec
  try {
    const col = $app.findCollectionByNameOrId('church_event_registrations')
    rec = new Record(col)
    rec.set('church_id', ev.getString('church_id'))
    rec.set('event_id', ev.id)
    rec.set('name', name)
    rec.set('phone', phone)
    rec.set('email', email)
    rec.set('notes', text(body.notes, 500))
    rec.set('partner_name', ev.getBool('couple_only') ? partnerName : '')
    rec.set('partner_phone', ev.getBool('couple_only') ? partnerPhone : '')
    rec.set('coupon_code', couponCode)
    rec.set('amount_due', amount)
    rec.set('answers', answers)
    rec.set('source', 'LINK')
    rec.set('paid', amount <= 0)
    rec.set('payment_method', amount <= 0 ? 'ISENTO' : '')
    $app.save(rec)
  } catch (err) {
    return e.json(400, { message: 'Confira os dados e tente de novo.' })
  }

  // Mensagem de confirmação com os campos preenchidos
  let churchName = 'Igreja'
  try {
    churchName = $app.findRecordById('churches', ev.getString('church_id')).getString('name')
  } catch (_) {}
  const brl = (v) => {
    const [i, d] = Number(v || 0)
      .toFixed(2)
      .split('.')
    return 'R$ ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d
  }
  const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
  const start = ev.getString('starts_on').slice(0, 10)
  const end = ev.getString('ends_on').slice(0, 10)
  const vars = {
    nome: name.split(' ')[0],
    evento: ev.getString('title'),
    data:
      (end && end !== start ? dmy(start) + ' a ' + dmy(end) : dmy(start)) +
      (ev.getString('start_time') ? ', ' + ev.getString('start_time') : ''),
    local:
      ev.getString('location') ||
      [ev.getString('address_street'), ev.getString('address_number')].filter(Boolean).join(', '),
    valor: amount > 0 ? brl(amount) : 'gratuito',
    igreja: churchName,
  }
  const message = String(ev.getString('confirm_message') || '').replace(/\{(\w+)\}/g, (all, k) =>
    Object.prototype.hasOwnProperty.call(vars, k.toLowerCase()) ? vars[k.toLowerCase()] : all,
  )

  if (email && message && ev.getBool('send_confirm_email')) {
    try {
      const settings = $app.settings()
      if (settings.smtp.enabled) {
        const esc = (s) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
        const inline = (s) =>
          esc(s)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')
        const html = message
          .replace(/\r\n?/g, '\n')
          .split(/\n\s*\n/)
          .map((block) => {
            const lines = block.split('\n')
            if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
              return (
                '<ul>' +
                lines.map((l) => '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') +
                '</ul>'
              )
            }
            if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
              return '<h3>' + inline(lines[0].replace(/^#{1,3}\s+/, '')) + '</h3>'
            }
            return '<p>' + lines.map(inline).join('<br>') + '</p>'
          })
          .join('')
        $app.newMailClient().send(
          new MailerMessage({
            from: {
              address: settings.meta.senderAddress,
              name: settings.meta.senderName || churchName,
            },
            to: [{ address: email }],
            subject: 'Inscrição recebida: ' + ev.getString('title'),
            html:
              '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b">' +
              html +
              '</div>',
          }),
        )
      }
    } catch (err) {
      // A inscrição já foi gravada; falha no e-mail não volta atrás
      $app.logger().warn('event signup email failed', 'error', String(err))
    }
  }

  return e.json(200, {
    ok: true,
    id: rec.id,
    amount: amount,
    price: price,
    coupon_code: couponCode,
    payment_info: ev.getString('payment_info'),
    message: message,
    // Comprovante: a equipe lê este código (QR) na entrada
    checkin_code: rec.getString('checkin_code'),
  })
})
