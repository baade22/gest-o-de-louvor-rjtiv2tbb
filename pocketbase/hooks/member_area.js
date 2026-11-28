// Área do membro no app da igreja (migração 0113, pedido do Pedro em 28/11/2026).
//
// Entrar sem senha:
//   POST /backend/v1/public/member/code    { slug, phone | email }        manda o código
//   POST /backend/v1/public/member/verify  { slug, phone | email, code, person_id? }
//        -> { token, record } (ou { choose: [...] } quando o contato é de mais de uma ficha)
// Área logada (só a própria ficha e a família):
//   GET  /backend/v1/member/me?slug=        painel, dados, família, carteirinha, escala
//   POST /backend/v1/member/me              grava os campos pessoais
//   POST /backend/v1/member/family          pede a inclusão de um familiar (vai para aprovação)
// Carteirinha:
//   GET  /backend/v1/public/member/card?c=  diz se a carteirinha do QR é válida
//
// Regras:
// - O código vai para o celular (WhatsApp da igreja) ou o e-mail que JÁ está na ficha. Vale 10
//   minutos, 5 tentativas, guardado só como hash; no máximo 3 pedidos por contato a cada 15
//   minutos e 10 por dia, além do limite por IP (0113).
// - Quem é da equipe (ficha ligada a uma conta de verdade, com e-mail e senha) entra pelo
//   login do LouvorFlow, que tem senha e pode ter MFA. O código do WhatsApp não abre essa conta.
// - A conta criada aqui usa um e-mail técnico (m<ficha>@membros.invalid) e senha aleatória.
//   Não tem church_members: não entra no LouvorFlow e não lê nenhuma coleção pela API.
// - Situação, rol, datas de batismo/admissão, nome e CPF já preenchido ficam com a secretaria.
//
// Como em todo hook do JSVM, cada handler roda isolado: os helpers ficam dentro de cada um.

routerAdd('POST', '/backend/v1/public/member/code', (e) => {
  const MEMBER_DOMAIN = '@membros.invalid'
  const body = e.requestInfo().body || {}
  if (String(body.website || '') !== '') return e.json(200, { sent: true, channel: 'WHATSAPP' })

  const slug = String(body.slug || '')
    .trim()
    .toLowerCase()
  if (slug && !/^[a-z0-9-]{1,40}$/.test(slug))
    return e.json(404, { message: 'Site não encontrado.' })
  let site = null
  try {
    const list = slug
      ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
          s: slug,
        })
      : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
    site = list.length ? list[0] : null
  } catch (_) {}
  if (!site) return e.json(404, { message: 'Site não encontrado.' })
  const churchId = site.getString('church_id')

  // Celular: DDD + 8 últimos números (aceita com ou sem o 9 e com ou sem +55)
  const phoneKey = (p) => {
    let d = String(p || '').replace(/\D/g, '')
    while (d.indexOf('0') === 0) d = d.slice(1)
    if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2)
    if (d.length !== 10 && d.length !== 11) return ''
    return d.slice(0, 2) + d.slice(-8)
  }
  const waNumber = (p) => {
    let d = String(p || '').replace(/\D/g, '')
    while (d.indexOf('0') === 0) d = d.slice(1)
    if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2)
    return d.length === 10 || d.length === 11 ? '55' + d : ''
  }

  const email = String(body.email || '')
    .trim()
    .toLowerCase()
  const useEmail = !!email
  let target = ''
  if (useEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
      return e.json(400, { message: 'Confira o e-mail.' })
    target = email
  } else {
    target = phoneKey(body.phone)
    if (!target) return e.json(400, { message: 'Digite o celular com DDD.' })
  }

  // Fichas com esse contato (falecidos e transferidos ficam de fora)
  let matches = []
  try {
    const rows = useEmail
      ? $app.findRecordsByFilter(
          'people',
          "church_id = {:c} && email = {:e} && status != 'FALECIDO' && status != 'TRANSFERIDO'",
          'name',
          20,
          0,
          { c: churchId, e: email },
        )
      : $app.findRecordsByFilter(
          'people',
          "church_id = {:c} && phone ~ {:t} && status != 'FALECIDO' && status != 'TRANSFERIDO'",
          'name',
          50,
          0,
          { c: churchId, t: target.slice(-4) },
        )
    matches = useEmail ? rows : rows.filter((p) => phoneKey(p.getString('phone')) === target)
  } catch (_) {}
  if (matches.length === 0) return e.json(404, { found: false, message: 'Contato não encontrado.' })

  // Quem já tem conta da equipe entra pelo LouvorFlow (senha e MFA)
  const isTeam = (p) => {
    const uid = p.getString('user_id')
    if (!uid) return false
    try {
      const u = $app.findRecordById('_pb_users_auth_', uid)
      return u.email().toLowerCase().indexOf(MEMBER_DOMAIN) === -1
    } catch (_) {
      return false
    }
  }
  const usable = matches.filter((p) => !isTeam(p))
  if (usable.length === 0) {
    return e.json(409, {
      team: true,
      message: 'Você já tem acesso da equipe. Entre com o seu e-mail e senha.',
    })
  }

  // Limite por contato
  const since = (ms) => new Date(Date.now() - ms).toISOString().replace('T', ' ')
  const count = (ms) => {
    try {
      return $app.countRecords(
        'member_login_codes',
        $dbx.exp('church_id = {:c} AND target = {:t} AND created >= {:d}', {
          c: churchId,
          t: target,
          d: since(ms),
        }),
      )
    } catch (_) {
      return 0
    }
  }
  if (count(15 * 60000) >= 3 || count(24 * 3600000) >= 10) {
    return e.json(429, {
      message: 'Muitos códigos pedidos para este contato. Espere alguns minutos e tente de novo.',
    })
  }

  let churchName = 'a igreja'
  try {
    churchName =
      site.getString('short_name') ||
      $app.findRecordById('churches', churchId).getString('name') ||
      churchName
  } catch (_) {}

  const code = $security.randomStringWithAlphabet(6, '0123456789')
  const salt = $security.randomString(16)
  const pretty = code.slice(0, 3) + ' ' + code.slice(3)
  const text =
    '*' +
    pretty +
    '* é o seu código para entrar no app da ' +
    churchName +
    '.\n\nVale por 10 minutos. Não passe este código para ninguém: a igreja nunca pede.'

  // Envio: WhatsApp da igreja na hora (fora da fila, que é lenta de propósito); sem WhatsApp,
  // o e-mail da ficha
  let channel = ''
  let sentTo = ''
  const sendWhatsApp = () => {
    const apiUrl = String($os.getenv('WHATSAPP_API_URL') || '')
      .replace(/\s+/g, '')
      .replace(/\/+$/, '')
    const apiKey = String($os.getenv('WHATSAPP_API_KEY') || '').trim()
    if (!apiUrl || !apiKey) return false
    let st = null
    try {
      st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', { c: churchId })
    } catch (_) {
      return false
    }
    const inst = st.getString('instance')
    if (!inst) return false
    const paused = st.getString('paused_until')
    if (paused && new Date(paused.replace(' ', 'T')).getTime() > Date.now()) return false
    const number = waNumber(body.phone)
    if (!number) return false
    let ok = false
    try {
      const res = $http.send({
        url: apiUrl + '/message/sendText/' + encodeURIComponent(inst),
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: number, text: text, delay: 600 }),
        timeout: 20,
      })
      ok = res.statusCode >= 200 && res.statusCode < 300
    } catch (_) {}
    try {
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', churchId)
      msg.set('kind', 'CODIGO')
      msg.set('phone', number)
      msg.set('name', usable[0].getString('name'))
      // O histórico não guarda o código
      msg.set('text', 'Código de entrada no app (não guardado)')
      msg.set('status', ok ? 'ENVIADO' : 'ERRO')
      msg.set('attempts', 1)
      msg.set('send_after', new Date().toISOString())
      if (ok) msg.set('sent_at', new Date().toISOString())
      else msg.set('error', 'Código de entrada não enviado')
      $app.save(msg)
    } catch (_) {}
    if (ok) {
      const d = number.slice(2)
      sentTo = '(' + d.slice(0, 2) + ') ' + (d.length === 11 ? '9••••-' : '••••-') + d.slice(-4)
    }
    return ok
  }
  const sendEmail = (address) => {
    try {
      const meta = $app.settings().meta
      const message = new MailerMessage({
        from: { address: meta.senderAddress, name: meta.senderName || churchName },
        to: [{ address: address }],
        subject: 'Seu código para entrar no app: ' + pretty,
        html:
          '<p>Olá!</p><p>O seu código para entrar no app da ' +
          churchName +
          ' é:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">' +
          pretty +
          '</p><p>Vale por 10 minutos. Não passe este código para ninguém: a igreja nunca pede.</p>' +
          '<p>Se não foi você, ignore este e-mail.</p>',
      })
      $app.newMailClient().send(message)
      const [user, domain] = address.split('@')
      sentTo = user.slice(0, 2) + '•••@' + domain
      return true
    } catch (_) {
      return false
    }
  }

  if (useEmail) {
    if (sendEmail(email)) channel = 'EMAIL'
  } else if (sendWhatsApp()) {
    channel = 'WHATSAPP'
  } else {
    const withEmail = usable.filter((p) => !!p.getString('email'))
    if (withEmail.length === 1 && sendEmail(withEmail[0].getString('email').toLowerCase())) {
      channel = 'EMAIL'
    }
  }
  if (!channel) {
    return e.json(503, {
      message:
        'Não conseguimos mandar o código agora. Tente de novo em instantes ou fale com a secretaria.',
    })
  }

  try {
    const rec = new Record($app.findCollectionByNameOrId('member_login_codes'))
    rec.set('church_id', churchId)
    rec.set('channel', channel)
    rec.set('target', target)
    rec.set(
      'person_ids',
      usable.map((p) => p.id),
    )
    rec.set('code_hash', salt + ':' + $security.sha256(salt + code))
    rec.set('expires_at', new Date(Date.now() + 10 * 60000).toISOString())
    rec.set('attempts', 0)
    rec.set('used', false)
    rec.set('ip', e.realIP())
    $app.save(rec)
  } catch (err) {
    return e.json(500, { message: 'Não foi possível concluir agora. Tente de novo.' })
  }
  return e.json(200, { sent: true, channel: channel, sent_to: sentTo })
})

routerAdd('POST', '/backend/v1/public/member/verify', (e) => {
  const MEMBER_DOMAIN = '@membros.invalid'
  const body = e.requestInfo().body || {}
  const slug = String(body.slug || '')
    .trim()
    .toLowerCase()
  if (slug && !/^[a-z0-9-]{1,40}$/.test(slug))
    return e.json(404, { message: 'Site não encontrado.' })
  let site = null
  try {
    const list = slug
      ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
          s: slug,
        })
      : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
    site = list.length ? list[0] : null
  } catch (_) {}
  if (!site) return e.json(404, { message: 'Site não encontrado.' })
  const churchId = site.getString('church_id')

  const phoneKey = (p) => {
    let d = String(p || '').replace(/\D/g, '')
    while (d.indexOf('0') === 0) d = d.slice(1)
    if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2)
    if (d.length !== 10 && d.length !== 11) return ''
    return d.slice(0, 2) + d.slice(-8)
  }
  const email = String(body.email || '')
    .trim()
    .toLowerCase()
  const target = email || phoneKey(body.phone)
  const code = String(body.code || '').replace(/\D/g, '')
  if (!target || code.length !== 6)
    return e.json(400, { message: 'Digite os 6 números do código.' })

  let rec = null
  try {
    const list = $app.findRecordsByFilter(
      'member_login_codes',
      'church_id = {:c} && target = {:t} && used = false',
      '-created',
      1,
      0,
      { c: churchId, t: target },
    )
    rec = list.length ? list[0] : null
  } catch (_) {}
  const expired =
    !rec || new Date(rec.getString('expires_at').replace(' ', 'T')).getTime() < Date.now()
  if (expired || rec.getInt('attempts') >= 5) {
    return e.json(400, { message: 'O código venceu. Peça um novo.' })
  }
  const parts = rec.getString('code_hash').split(':')
  if (parts.length !== 2 || $security.sha256(parts[0] + code) !== parts[1]) {
    rec.set('attempts', rec.getInt('attempts') + 1)
    try {
      $app.save(rec)
    } catch (_) {}
    const left = 5 - rec.getInt('attempts')
    return e.json(400, {
      message:
        left > 0
          ? 'Código errado. Confira e tente de novo (' +
            left +
            ' tentativa' +
            (left > 1 ? 's' : '') +
            ').'
          : 'Código errado. Peça um novo.',
    })
  }

  let ids = []
  try {
    ids = JSON.parse(rec.getString('person_ids') || '[]') || []
  } catch (_) {}
  const people = []
  for (const id of ids) {
    try {
      const p = $app.findRecordById('people', String(id))
      if (p.getString('church_id') === churchId) people.push(p)
    } catch (_) {}
  }
  if (people.length === 0) return e.json(400, { message: 'O código venceu. Peça um novo.' })

  // Celular de mais de uma ficha (ex.: mãe e filho com o mesmo número): a pessoa escolhe
  let person = null
  const chosen = String(body.person_id || '')
  if (people.length === 1) person = people[0]
  else if (chosen) person = people.find((p) => p.id === chosen) || null
  if (!person) {
    return e.json(200, {
      choose: people.map((p) => ({ id: p.id, name: p.getString('name') })),
    })
  }

  // Conta do membro: a que já está ligada à ficha ou uma nova, só para o app
  let user = null
  const uid = person.getString('user_id')
  if (uid) {
    try {
      user = $app.findRecordById('_pb_users_auth_', uid)
    } catch (_) {}
    if (user && user.email().toLowerCase().indexOf(MEMBER_DOMAIN) === -1) {
      return e.json(409, {
        team: true,
        message: 'Você já tem acesso da equipe. Entre com o seu e-mail e senha.',
      })
    }
  }
  try {
    if (!user) {
      user = new Record($app.findCollectionByNameOrId('_pb_users_auth_'))
      user.setEmail('m' + person.id + MEMBER_DOMAIN)
      user.setPassword($security.randomString(40))
      user.setVerified(true)
      user.set('name', person.getString('name'))
      $app.save(user)
      person.set('user_id', user.id)
      $app.saveNoValidate(person)
    }
    rec.set('used', true)
    $app.save(rec)
  } catch (err) {
    return e.json(500, { message: 'Não foi possível entrar agora. Tente de novo.' })
  }
  // Token direto (a conta de membro não tem senha conhecida nem acesso ao sistema)
  return e.json(200, { token: user.newAuthToken(), record: user })
})

routerAdd(
  'GET',
  '/backend/v1/member/me',
  (e) => {
    const q = e.requestInfo().query || {}
    const slug = String(q.slug || '')
      .trim()
      .toLowerCase()
    let churchId = ''
    try {
      const list = slug
        ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
            s: slug,
          })
        : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
      if (list.length) churchId = list[0].getString('church_id')
    } catch (_) {}
    if (!churchId) return e.json(404, { message: 'Site não encontrado.' })

    const uid = e.auth.id
    let person = null
    try {
      const list = $app.findRecordsByFilter(
        'people',
        'church_id = {:c} && user_id = {:u}',
        '',
        1,
        0,
        { c: churchId, u: uid },
      )
      person = list.length ? list[0] : null
    } catch (_) {}
    if (!person) {
      return e.json(404, {
        no_profile: true,
        message: 'Sua conta ainda não tem ficha nesta igreja. Fale com a secretaria.',
      })
    }

    const day = (r, f) => (r.getString(f) || '').substring(0, 10)
    const BRT = 3 * 3600 * 1000
    const today = new Date(Date.now() - BRT).toISOString().slice(0, 10)
    const age = (birth) => {
      if (!birth) return null
      const b = new Date(birth + 'T12:00:00Z')
      const t = new Date(today + 'T12:00:00Z')
      let a = t.getUTCFullYear() - b.getUTCFullYear()
      if (
        t.getUTCMonth() < b.getUTCMonth() ||
        (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())
      )
        a--
      return a
    }

    // Cadastro: o que falta preencher (o que é da secretaria não conta)
    const CHECK = [
      ['birth_date', 'data de nascimento'],
      ['phone', 'celular'],
      ['email', 'e-mail'],
      ['gender', 'sexo'],
      ['marital_status', 'estado civil'],
      ['document', 'CPF'],
      ['zip_code', 'CEP'],
      ['address', 'endereço'],
      ['neighborhood', 'bairro'],
      ['city', 'cidade'],
    ]
    const missing = []
    for (const c of CHECK) if (!String(person.getString(c[0]) || '').trim()) missing.push(c[1])
    const percent = Math.round(((CHECK.length - missing.length) / CHECK.length) * 100)

    // Família (vínculos gravados num sentido só: "relative_id é <kind> de person_id")
    const INVERSE = {
      CONJUGE: 'CONJUGE',
      FILHO: 'PAI_MAE',
      PAI_MAE: 'FILHO',
      IRMAO: 'IRMAO',
      OUTRO: 'OUTRO',
    }
    const family = []
    try {
      const rels = $app.findRecordsByFilter(
        'people_relations',
        'church_id = {:c} && (person_id = {:p} || relative_id = {:p})',
        '',
        50,
        0,
        { c: churchId, p: person.id },
      )
      for (const r of rels) {
        const mine = r.getString('person_id') === person.id
        const otherId = mine ? r.getString('relative_id') : r.getString('person_id')
        const kind = mine ? r.getString('kind') : INVERSE[r.getString('kind')] || 'OUTRO'
        try {
          const o = $app.findRecordById('people', otherId)
          let hasApp = false
          const ouid = o.getString('user_id')
          if (ouid) hasApp = true
          family.push({
            id: o.id,
            name: o.getString('name'),
            kind: kind,
            gender: o.getString('gender'),
            status: o.getString('status'),
            age: age(day(o, 'birth_date')),
            has_app: hasApp,
          })
        } catch (_) {}
      }
    } catch (_) {}
    let pendingFamily = []
    try {
      pendingFamily = $app
        .findRecordsByFilter(
          'people_signups',
          "church_id = {:c} && relative_of = {:p} && status = 'PENDENTE'",
          '-created',
          20,
          0,
          { c: churchId, p: person.id },
        )
        .map((s) => ({ name: s.getString('name'), kind: s.getString('relative_kind') }))
    } catch (_) {}

    // Carteirinha (só para membro): código aleatório criado na primeira vez
    let card = null
    let churchName = ''
    try {
      churchName = $app.findRecordById('churches', churchId).getString('name')
    } catch (_) {}
    if (person.getString('status') === 'MEMBRO') {
      let cardCode = person.getString('card_code')
      if (!cardCode) {
        cardCode = $security.randomString(24)
        try {
          const fresh = $app.findRecordById('people', person.id)
          fresh.set('card_code', cardCode)
          $app.saveNoValidate(fresh)
        } catch (_) {
          cardCode = ''
        }
      }
      card = {
        code: cardCode,
        church_name: churchName,
        roll_number: person.getString('roll_number'),
        member_since: day(person, 'admission_date') || day(person, 'baptism_date'),
      }
    }

    // Próximas inscrições em eventos
    const registrations = []
    try {
      const regs = $app.findRecordsByFilter(
        'church_event_registrations',
        'church_id = {:c} && person_id = {:p}',
        '-created',
        30,
        0,
        { c: churchId, p: person.id },
      )
      for (const r of regs) {
        try {
          const ev = $app.findRecordById('church_events', r.getString('event_id'))
          const date = day(ev, 'ends_on') || day(ev, 'starts_on')
          if (date && date < today) continue
          registrations.push({
            id: r.id,
            event: ev.getString('title'),
            date: day(ev, 'starts_on'),
            time: ev.getString('start_time'),
            location: ev.getString('location'),
            paid: r.getBool('paid'),
            amount_due: r.getFloat('amount_due'),
            checkin_code: r.getString('checkin_code'),
          })
        } catch (_) {}
      }
      registrations.sort((a, b) => (a.date < b.date ? -1 : 1))
    } catch (_) {}

    // Quem é da equipe: próxima escala e atalho para o LouvorFlow
    let team = false
    let nextScale = null
    try {
      const cm = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        '',
        1,
        0,
        { c: churchId, u: uid },
      )
      team = cm.length > 0
      if (team) {
        const sc = $app.findRecordsByFilter(
          'event_members',
          "church_id = {:c} && member_id = {:m} && event_id.date >= {:d} && event_id.status != 'Cancelado'",
          'event_id.date',
          1,
          0,
          { c: churchId, m: cm[0].id, d: today + ' 00:00:00' },
        )
        if (sc.length) {
          const em = sc[0]
          const ev = $app.findRecordById('events', em.getString('event_id'))
          let role = ''
          try {
            role = $app.findRecordById('roles', em.getString('role_id')).getString('name')
          } catch (_) {}
          nextScale = {
            id: em.id,
            event: ev.getString('title'),
            date: day(ev, 'date'),
            time: ev.getString('start_time'),
            role: role,
            status: em.getString('status'),
          }
        }
      }
    } catch (_) {}

    const doc = person.getString('document').replace(/\D/g, '')
    return e.json(200, {
      church_name: churchName,
      team: team,
      next_scale: nextScale,
      profile: {
        id: person.id,
        name: person.getString('name'),
        status: person.getString('status'),
        congregation: person.getString('congregation'),
        roll_number: person.getString('roll_number'),
        birth_date: day(person, 'birth_date'),
        gender: person.getString('gender'),
        marital_status: person.getString('marital_status'),
        wedding_date: day(person, 'wedding_date'),
        phone: person.getString('phone'),
        email: person.getString('email'),
        zip_code: person.getString('zip_code'),
        address: person.getString('address'),
        neighborhood: person.getString('neighborhood'),
        city: person.getString('city'),
        state: person.getString('state'),
        profession: person.getString('profession'),
        // CPF: só os números do meio, para a pessoa reconhecer
        document_masked:
          doc.length === 11
            ? '•••.' + doc.slice(3, 6) + '.' + doc.slice(6, 9) + '-••'
            : doc
              ? '••••'
              : '',
        has_document: !!doc,
        baptism_date: day(person, 'baptism_date'),
        admission_date: day(person, 'admission_date'),
      },
      completeness: { percent: percent, missing: missing },
      family: family,
      pending_family: pendingFamily,
      card: card,
      registrations: registrations.slice(0, 10),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/member/me',
  (e) => {
    const body = e.requestInfo().body || {}
    const slug = String(body.slug || '')
      .trim()
      .toLowerCase()
    let churchId = ''
    try {
      const list = slug
        ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
            s: slug,
          })
        : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
      if (list.length) churchId = list[0].getString('church_id')
    } catch (_) {}
    if (!churchId) return e.json(404, { message: 'Site não encontrado.' })
    let person = null
    try {
      const list = $app.findRecordsByFilter(
        'people',
        'church_id = {:c} && user_id = {:u}',
        '',
        1,
        0,
        { c: churchId, u: e.auth.id },
      )
      person = list.length ? list[0] : null
    } catch (_) {}
    if (!person) return e.json(404, { message: 'Ficha não encontrada.' })

    const text = (v, max) =>
      String(v == null ? '' : v)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, max)
    const oneOf = (v, list) => (list.indexOf(String(v || '')) >= 0 ? String(v) : '')
    const ymd = (v) => {
      const s = String(v || '').trim()
      if (!s) return ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
      const year = Number(s.slice(0, 4))
      return year >= 1900 && year <= new Date().getFullYear() ? s + ' 00:00:00.000Z' : null
    }

    const phone = text(body.phone, 40)
    if (!phone || phone.replace(/\D/g, '').length < 10)
      return e.json(400, { message: 'Informe o celular com DDD.' })
    const email = text(body.email, 200).toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return e.json(400, { message: 'Confira o e-mail.' })
    const birth = ymd(body.birth_date)
    if (birth === null) return e.json(400, { message: 'Confira a data de nascimento.' })
    const wedding = ymd(body.wedding_date)
    if (wedding === null) return e.json(400, { message: 'Confira a data de casamento.' })

    person.set('phone', phone)
    person.set('email', email)
    person.set('birth_date', birth)
    person.set('gender', oneOf(body.gender, ['M', 'F']))
    person.set(
      'marital_status',
      oneOf(body.marital_status, ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']),
    )
    person.set('wedding_date', wedding)
    person.set('zip_code', text(body.zip_code, 12))
    person.set('address', text(body.address, 300))
    person.set('neighborhood', text(body.neighborhood, 120))
    person.set('city', text(body.city, 120))
    person.set('state', text(body.state, 2).toUpperCase())
    person.set('profession', text(body.profession, 120))
    // CPF: a pessoa preenche se ainda não tem; trocar é com a secretaria
    if (!person.getString('document').replace(/\D/g, '')) {
      const cpf = String(body.document || '').replace(/\D/g, '')
      if (cpf) {
        let ok = cpf.length === 11 && !/^(\d)\1{10}$/.test(cpf)
        if (ok) {
          for (const n of [9, 10]) {
            let sum = 0
            for (let i = 0; i < n; i++) sum += Number(cpf[i]) * (n + 1 - i)
            const dv = ((sum * 10) % 11) % 10
            if (dv !== Number(cpf[n])) ok = false
          }
        }
        if (!ok) return e.json(400, { message: 'Confira o CPF.' })
        person.set(
          'document',
          cpf.slice(0, 3) + '.' + cpf.slice(3, 6) + '.' + cpf.slice(6, 9) + '-' + cpf.slice(9),
        )
      }
    }
    person.set('profile_pending', false)
    try {
      $app.save(person)
    } catch (err) {
      return e.json(400, { message: 'Não foi possível salvar. Confira os campos.' })
    }
    try {
      const ev = new Record($app.findCollectionByNameOrId('people_events'))
      ev.set('church_id', churchId)
      ev.set('person_id', person.id)
      ev.set('kind', 'NOTA')
      ev.set('title', 'Dados atualizados pela própria pessoa no app')
      ev.set('date', new Date().toISOString())
      $app.save(ev)
    } catch (_) {}
    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/member/family',
  (e) => {
    const body = e.requestInfo().body || {}
    const slug = String(body.slug || '')
      .trim()
      .toLowerCase()
    let churchId = ''
    try {
      const list = slug
        ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
            s: slug,
          })
        : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
      if (list.length) churchId = list[0].getString('church_id')
    } catch (_) {}
    if (!churchId) return e.json(404, { message: 'Site não encontrado.' })
    let person = null
    try {
      const list = $app.findRecordsByFilter(
        'people',
        'church_id = {:c} && user_id = {:u}',
        '',
        1,
        0,
        { c: churchId, u: e.auth.id },
      )
      person = list.length ? list[0] : null
    } catch (_) {}
    if (!person) return e.json(404, { message: 'Ficha não encontrada.' })

    const text = (v, max) =>
      String(v == null ? '' : v)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, max)
    const KINDS = ['CONJUGE', 'FILHO', 'PAI_MAE', 'IRMAO', 'OUTRO']
    const kind = KINDS.indexOf(String(body.kind)) >= 0 ? String(body.kind) : ''
    const name = text(body.name, 200)
    if (name.length < 3) return e.json(400, { message: 'Informe o nome completo.' })
    if (!kind) return e.json(400, { message: 'Diga o parentesco.' })
    const s = String(body.birth_date || '').trim()
    let birth = ''
    if (s) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
        Number(s.slice(0, 4)) < 1900 ||
        s > new Date().toISOString().slice(0, 10)
      )
        return e.json(400, { message: 'Confira a data de nascimento.' })
      birth = s + ' 00:00:00.000Z'
    }
    const phone = text(body.phone, 40)

    // No máximo 10 pedidos pendentes por pessoa
    try {
      const n = $app.countRecords(
        'people_signups',
        $dbx.exp("church_id = {:c} AND relative_of = {:p} AND status = 'PENDENTE'", {
          c: churchId,
          p: person.id,
        }),
      )
      if (n >= 10) return e.json(429, { message: 'Já há pedidos esperando a secretaria.' })
    } catch (_) {}

    const LABEL = {
      CONJUGE: 'cônjuge',
      FILHO: 'filho(a)',
      PAI_MAE: 'pai/mãe',
      IRMAO: 'irmão(ã)',
      OUTRO: 'parente',
    }
    try {
      const rec = new Record($app.findCollectionByNameOrId('people_signups'))
      rec.set('church_id', churchId)
      rec.set('name', name)
      rec.set('birth_date', birth)
      rec.set('gender', ['M', 'F'].indexOf(String(body.gender)) >= 0 ? String(body.gender) : '')
      rec.set('phone', phone)
      rec.set('address', person.getString('address'))
      rec.set('neighborhood', person.getString('neighborhood'))
      rec.set('city', person.getString('city'))
      rec.set('state', person.getString('state'))
      rec.set('zip_code', person.getString('zip_code'))
      rec.set('congregation', person.getString('congregation'))
      rec.set('relationship', 'FREQUENTA')
      rec.set(
        'how_found',
        'Pedido pela área do membro: ' + LABEL[kind] + ' de ' + person.getString('name'),
      )
      rec.set('relative_of', person.id)
      rec.set('relative_kind', kind)
      rec.set('status', 'PENDENTE')
      $app.save(rec)
    } catch (err) {
      return e.json(500, { message: 'Não foi possível enviar agora.' })
    }
    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)

routerAdd('GET', '/backend/v1/public/member/card', (e) => {
  const q = e.requestInfo().query || {}
  const code = String(q.c || '').trim()
  if (!/^[A-Za-z0-9]{16,40}$/.test(code)) return e.json(404, { valid: false })
  let p = null
  try {
    p = $app.findFirstRecordByFilter('people', 'card_code = {:c}', { c: code })
  } catch (_) {}
  if (!p) return e.json(404, { valid: false })
  let churchName = ''
  try {
    churchName = $app.findRecordById('churches', p.getString('church_id')).getString('name')
  } catch (_) {}
  const STATUS = {
    MEMBRO: 'Membro',
    CONGREGADO: 'Congregado',
    VISITANTE: 'Visitante',
    AFASTADO: 'Afastado',
    TRANSFERIDO: 'Transferido',
    FALECIDO: 'Falecido',
  }
  return e.json(200, {
    valid: p.getString('status') === 'MEMBRO',
    name: p.getString('name'),
    status: STATUS[p.getString('status')] || '',
    church_name: churchName,
    congregation: p.getString('congregation'),
  })
})

// Familiar pedido pela área do membro: ao aprovar o cadastro, cria o vínculo de família
onRecordAfterUpdateSuccess((e) => {
  e.next()
  const s = e.record
  const relOf = s.getString('relative_of')
  const personId = s.getString('person_id')
  const kind = s.getString('relative_kind')
  if (s.getString('status') !== 'APROVADO' || !relOf || !personId || !kind) return
  if (relOf === personId) return
  try {
    const churchId = s.getString('church_id')
    const exists = $app.findRecordsByFilter(
      'people_relations',
      'church_id = {:c} && ((person_id = {:a} && relative_id = {:b}) || (person_id = {:b} && relative_id = {:a}))',
      '',
      1,
      0,
      { c: churchId, a: relOf, b: personId },
    )
    if (exists.length) return
    const r = new Record($app.findCollectionByNameOrId('people_relations'))
    r.set('church_id', churchId)
    r.set('person_id', relOf)
    r.set('relative_id', personId)
    r.set('kind', kind)
    r.set('lives_together', true)
    $app.save(r)
  } catch (err) {
    $app.logger().warn('member family link failed', 'error', String(err))
  }
}, 'people_signups')
