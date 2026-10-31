// WhatsApp: fila de envio e envios automáticos.
//
// - Escala: quando alguém entra numa escala (event_members), a mensagem vai para a fila com
//   10 minutos de folga; se a pessoa sair da escala antes disso, a mensagem é cancelada. Assim
//   quem monta a escala pode mexer à vontade sem mandar aviso errado.
// - Todo dia às 8h (Brasília): lembrete para quem está escalado no dia seguinte (menos quem
//   recusou) e parabéns de aniversário e de casamento (fica registrado na linha do tempo,
//   igual ao botão da tela de Aniversariantes).
// - A cada minuto o cron manda o que está na fila, devagar (no máximo 6 por igreja por
//   minuto, com "digitando..." antes), para o WhatsApp não estranhar. Se o celular estiver
//   desconectado, espera; depois de 2 dias desiste e marca erro.
// Inscrição e pagamento de eventos entram na fila pelos hooks church_event_signup.js e
// church_event_payments.js; os avisos da Mídia (com imagem, vídeo, documento ou áudio), pelo
// whatsapp_avisos.js, já com o horário de cada pessoa e a janela de envio.
//
// Cada envio automático só acontece se estiver ligado em Configurações > WhatsApp.

onRecordAfterCreateSuccess((e) => {
  e.next()
  const em = e.record
  const churchId = em.getString('church_id')
  try {
    const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
      c: churchId,
    })
    let auto = {}
    try {
      auto = JSON.parse(st.getString('auto') || '{}') || {}
    } catch (_) {}
    if (auto.ESCALA !== true) return

    const ev = $app.findRecordById('events', em.getString('event_id'))
    const day = ev.getString('date').slice(0, 10)
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
    if (!day || day < today || ev.getString('status') === 'Cancelado') return

    const member = $app.findRecordById('church_members', em.getString('member_id'))
    let phone = member.getString('phone').replace(/\D/g, '')
    let name = ''
    try {
      const user = $app.findRecordById('users', member.getString('user_id'))
      name = user.getString('name')
      if (!phone) phone = String(user.getString('phone') || '').replace(/\D/g, '')
    } catch (_) {}
    while (phone.indexOf('0') === 0) phone = phone.slice(1)
    if (phone.length === 10 || phone.length === 11) phone = '55' + phone
    if (phone.length < 12 || phone.length > 13) return

    let role = ''
    try {
      role = $app.findRecordById('roles', em.getString('role_id')).getString('name')
    } catch (_) {}
    let link = ''
    try {
      const base = String($app.settings().meta.appURL || '').replace(/\/+$/, '')
      if (base) link = base + '/minhas-escalas'
    } catch (_) {}

    const first = (name || '').trim().split(/\s+/)[0]
    const dmy = day.slice(8, 10) + '/' + day.slice(5, 7)
    const text =
      'Olá' +
      (first ? ', ' + first : '') +
      '! Você foi escalado(a) para *' +
      ev.getString('title') +
      '* em ' +
      dmy +
      (ev.getString('start_time') ? ' às ' + ev.getString('start_time') : '') +
      (role ? ', como _' + role + '_' : '') +
      '.' +
      (link
        ? '\n\nConfirme ou avise se não puder: ' + link
        : '\n\nConfirme ou avise se não puder pelo LouvorFlow.')

    const col = $app.findCollectionByNameOrId('whatsapp_messages')
    const msg = new Record(col)
    msg.set('church_id', churchId)
    msg.set('kind', 'ESCALA')
    msg.set('phone', phone)
    msg.set('name', name)
    msg.set('text', text)
    msg.set('status', 'FILA')
    msg.set('attempts', 0)
    msg.set('ref_id', em.id)
    msg.set('send_after', new Date(Date.now() + 10 * 60 * 1000).toISOString())
    $app.save(msg)
  } catch (_) {
    // Sem WhatsApp configurado ou dados incompletos: segue sem aviso
  }
}, 'event_members')

// Saiu da escala antes do aviso sair: cancela
onRecordAfterDeleteSuccess((e) => {
  e.next()
  try {
    const rows = $app.findRecordsByFilter(
      'whatsapp_messages',
      "ref_id = {:r} && status = 'FILA'",
      '',
      20,
      0,
      { r: e.record.id },
    )
    for (const m of rows) {
      m.set('status', 'CANCELADO')
      m.set('error', 'Saiu da escala antes do envio')
      $app.save(m)
    }
  } catch (_) {}
}, 'event_members')

// Envio da fila, a cada minuto
cronAdd('whatsapp_send_queue', '* * * * *', () => {
  const apiUrl = String($os.getenv('WHATSAPP_API_URL') || '')
    .replace(/\s+/g, '') // espaços colados pelo celular quebram a URL
    .replace(/\/+$/, '')
  const apiKey = String($os.getenv('WHATSAPP_API_KEY') || '').trim()
  if (!apiUrl || !apiKey) return

  const PER_CHURCH = 6
  const nowIso = new Date().toISOString().replace('T', ' ')
  let due = []
  try {
    due = $app.findRecordsByFilter(
      'whatsapp_messages',
      "status = 'FILA' && send_after <= {:now}",
      'send_after',
      60,
      0,
      { now: nowIso },
    )
  } catch (_) {
    return
  }
  if (due.length === 0) return

  const evo = (method, path, payload) => {
    const res = $http.send({
      url: apiUrl + path,
      method: method,
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : '',
      timeout: 30,
    })
    let json = null
    try {
      json = res.json
    } catch (_) {}
    return { code: res.statusCode, json: json }
  }

  const churches = {}
  for (const msg of due) {
    const churchId = msg.getString('church_id')
    let c = churches[churchId]
    if (!c) {
      c = churches[churchId] = { sent: 0, open: false, inst: '' }
      try {
        const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
          c: churchId,
        })
        c.inst = st.getString('instance')
        const r = evo('GET', '/instance/connectionState/' + encodeURIComponent(c.inst))
        const state =
          r.json && r.json.instance && r.json.instance.state
            ? r.json.instance.state
            : r.json && r.json.state
              ? r.json.state
              : 'close'
        c.open = state === 'open'
        if (st.getString('status') !== state) {
          st.set('status', state)
          $app.save(st)
        }
      } catch (_) {
        c.open = false
      }
    }

    if (!c.open) {
      // Desconectado: espera; passados 2 dias da hora marcada desiste
      const dueAt = new Date(msg.getString('send_after').replace(' ', 'T')).getTime()
      if (dueAt && Date.now() - dueAt > 2 * 24 * 3600 * 1000) {
        msg.set('status', 'ERRO')
        msg.set('error', 'WhatsApp da igreja desconectado')
        $app.save(msg)
      }
      continue
    }
    // Avisos em massa só saem dentro da janela (horário de Brasília); fora dela, ficam para
    // o começo da próxima (por exemplo, depois de o WhatsApp ficar desconectado)
    const win = /^(\d\d):(\d\d)-(\d\d):(\d\d)$/.exec(msg.getString('window'))
    if (win) {
      const ws = parseInt(win[1], 10) * 60 + parseInt(win[2], 10)
      const we = parseInt(win[3], 10) * 60 + parseInt(win[4], 10)
      const b = new Date(Date.now() - 3 * 3600 * 1000)
      const min = b.getUTCHours() * 60 + b.getUTCMinutes()
      if (min < ws || min >= we) {
        const day = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
        const next = day + (min >= we ? 24 * 3600 * 1000 : 0) + ws * 60000 + 3 * 3600 * 1000
        msg.set('send_after', new Date(next + Math.floor(Math.random() * 20) * 60000).toISOString())
        try {
          $app.save(msg)
        } catch (_) {}
        continue
      }
    }
    if (c.sent >= PER_CHURCH) continue
    c.sent++

    const attempts = msg.getInt('attempts') + 1
    msg.set('attempts', attempts)
    try {
      const inst = encodeURIComponent(c.inst)
      const number = msg.getString('phone')
      const text = msg.getString('text')
      const delay = 1200 + Math.floor(Math.random() * 1500)
      const mediaType = msg.getString('media_type')
      const mediaUrl = msg.getString('media_url')
      let r = null
      if (mediaUrl && mediaType === 'AUDIO') {
        // Áudio vai como "gravado na hora"; o texto, se tiver, sai logo depois
        r = evo('POST', '/message/sendWhatsAppAudio/' + inst, {
          number: number,
          audio: mediaUrl,
          delay: delay,
        })
        if (r.code >= 200 && r.code < 300 && text.trim()) {
          evo('POST', '/message/sendText/' + inst, { number: number, text: text, delay: 800 })
        }
      } else if (mediaUrl && ['IMAGEM', 'VIDEO', 'DOCUMENTO'].indexOf(mediaType) !== -1) {
        const fileName = msg.getString('file_name') || 'arquivo'
        const ext = fileName.toLowerCase().split('.').pop()
        const MIME = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          mp4: 'video/mp4',
          '3gp': 'video/3gpp',
          mov: 'video/quicktime',
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ppt: 'application/vnd.ms-powerpoint',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
        // O nome guardado pelo PocketBase tem um sufixo aleatório: tira para a pessoa ver
        const shown = fileName.replace(/_[a-z0-9]{10}(\.[a-z0-9]+)$/i, '$1')
        r = evo('POST', '/message/sendMedia/' + inst, {
          number: number,
          mediatype:
            mediaType === 'IMAGEM' ? 'image' : mediaType === 'VIDEO' ? 'video' : 'document',
          mimetype: MIME[ext] || 'application/octet-stream',
          caption: text,
          media: mediaUrl,
          fileName: shown,
          delay: delay,
        })
      } else {
        r = evo('POST', '/message/sendText/' + inst, {
          number: number,
          text: text,
          delay: delay,
        })
      }
      if (r.code >= 200 && r.code < 300) {
        msg.set('status', 'ENVIADO')
        msg.set('error', '')
        msg.set('sent_at', new Date().toISOString())
      } else if (r.code === 400) {
        // Número sem WhatsApp ou inválido (ou grupo de que a igreja saiu): não adianta repetir
        msg.set('status', 'ERRO')
        msg.set(
          'error',
          number.indexOf('@g.us') !== -1
            ? 'Grupo não encontrado ou só administradores podem mandar mensagem nele'
            : 'Número sem WhatsApp ou inválido',
        )
      } else if (attempts >= 3) {
        msg.set('status', 'ERRO')
        msg.set('error', 'O servidor do WhatsApp recusou (código ' + r.code + ')')
      } else {
        msg.set('error', 'Tentativa ' + attempts + ' falhou (código ' + r.code + ')')
        msg.set('send_after', new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString())
      }
    } catch (err) {
      if (attempts >= 3) {
        msg.set('status', 'ERRO')
        msg.set('error', 'Servidor do WhatsApp não respondeu')
      } else {
        msg.set('error', 'Tentativa ' + attempts + ': servidor não respondeu')
        msg.set('send_after', new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString())
      }
    }
    try {
      $app.save(msg)
    } catch (_) {}
  }
})

// Lembrete de escala e parabéns, todo dia às 8h de Brasília (11h UTC)
cronAdd('whatsapp_daily', '0 11 * * *', () => {
  let settings = []
  try {
    settings = $app.findAllRecords('whatsapp_settings')
  } catch (_) {
    return
  }
  const brt = new Date(Date.now() - 3 * 3600 * 1000)
  const today = brt.toISOString().slice(0, 10)
  const tomorrow = new Date(brt.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)
  const col = $app.findCollectionByNameOrId('whatsapp_messages')
  let appUrl = ''
  try {
    appUrl = String($app.settings().meta.appURL || '').replace(/\/+$/, '')
  } catch (_) {}

  const fixPhone = (p) => {
    let d = String(p || '').replace(/\D/g, '')
    while (d.indexOf('0') === 0) d = d.slice(1)
    if (d.length === 10 || d.length === 11) d = '55' + d
    return d.length >= 12 && d.length <= 13 ? d : ''
  }
  const already = (refId, kind) => {
    try {
      $app.findFirstRecordByFilter(
        'whatsapp_messages',
        'ref_id = {:r} && kind = {:k} && created >= {:d}',
        { r: refId, k: kind, d: today + ' 00:00:00' },
      )
      return true
    } catch (_) {
      return false
    }
  }
  const enqueue = (churchId, kind, phone, name, text, refId) => {
    const msg = new Record(col)
    msg.set('church_id', churchId)
    msg.set('kind', kind)
    msg.set('phone', phone)
    msg.set('name', name)
    msg.set('text', text)
    msg.set('status', 'FILA')
    msg.set('attempts', 0)
    msg.set('ref_id', refId)
    msg.set('send_after', new Date().toISOString())
    $app.save(msg)
  }

  for (const st of settings) {
    const churchId = st.getString('church_id')
    let auto = {}
    try {
      auto = JSON.parse(st.getString('auto') || '{}') || {}
    } catch (_) {}
    let churchName = 'Igreja'
    let church = null
    try {
      church = $app.findRecordById('churches', churchId)
      churchName = church.getString('name') || churchName
    } catch (_) {}

    // 1. Lembrete de quem está escalado amanhã
    if (auto.LEMBRETE_ESCALA === true) {
      try {
        const events = $app.findRecordsByFilter(
          'events',
          "church_id = {:c} && date >= {:a} && date < {:b} && status != 'Cancelado'",
          '',
          50,
          0,
          {
            c: churchId,
            a: tomorrow + ' 00:00:00',
            b: tomorrow + ' 23:59:59.999',
          },
        )
        for (const ev of events) {
          const ems = $app.findRecordsByFilter(
            'event_members',
            "event_id = {:e} && status != 'RECUSADO'",
            '',
            200,
            0,
            { e: ev.id },
          )
          for (const em of ems) {
            if (already(em.id, 'LEMBRETE_ESCALA')) continue
            try {
              const member = $app.findRecordById('church_members', em.getString('member_id'))
              let name = ''
              let phone = member.getString('phone')
              try {
                const user = $app.findRecordById('users', member.getString('user_id'))
                name = user.getString('name')
                if (!phone) phone = user.getString('phone')
              } catch (_) {}
              phone = fixPhone(phone)
              if (!phone) continue
              let role = ''
              try {
                role = $app.findRecordById('roles', em.getString('role_id')).getString('name')
              } catch (_) {}
              const first = (name || '').trim().split(/\s+/)[0]
              const pending = em.getString('status') === 'PENDENTE'
              const text =
                'Olá' +
                (first ? ', ' + first : '') +
                '! Lembrete: amanhã você está na escala de *' +
                ev.getString('title') +
                '*' +
                (ev.getString('start_time') ? ' às ' + ev.getString('start_time') : '') +
                (role ? ', como _' + role + '_' : '') +
                '.' +
                (pending
                  ? '\n\nVocê ainda não confirmou' +
                    (appUrl ? ': ' + appUrl + '/minhas-escalas' : ' no LouvorFlow.')
                  : '') +
                '\n\nDeus abençoe!'
              enqueue(churchId, 'LEMBRETE_ESCALA', phone, name, text, em.id)
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // 2. Parabéns de aniversário e de casamento
    const md = today.slice(5, 10)
    const greet = [
      {
        kind: 'ANIVERSARIO',
        on: auto.ANIVERSARIO === true,
        field: 'birth_date',
        custom: 'greeting_birthday',
        title: 'Parabéns de aniversário pelo WhatsApp',
        def: 'Feliz aniversário, {nome}! 🎉 Que o Senhor abençoe sua vida ricamente neste novo ano. Com carinho, {igreja}.',
      },
      {
        kind: 'CASAMENTO',
        on: auto.CASAMENTO === true,
        field: 'wedding_date',
        custom: 'greeting_wedding',
        title: 'Parabéns de casamento pelo WhatsApp',
        def: 'Feliz aniversário de casamento, {nome}! 💍 Que Deus continue abençoando a família de vocês. Com carinho, {igreja}.',
      },
    ]
    for (const g of greet) {
      if (!g.on) continue
      let people = []
      try {
        people = $app.findRecordsByFilter(
          'people',
          'church_id = {:c} && ' +
            g.field +
            " != '' && " +
            g.field +
            " ~ {:md} && status != 'FALECIDO' && status != 'TRANSFERIDO'",
          '',
          500,
          0,
          { c: churchId, md: '-' + md + ' ' },
        )
      } catch (_) {}
      const template = (church && church.getString(g.custom).trim()) || g.def
      for (const p of people) {
        if (p.getString(g.field).slice(5, 10) !== md) continue
        const phone = fixPhone(p.getString('phone'))
        if (!phone || already(p.id, g.kind)) continue
        // Já parabenizado hoje pela tela (botão manual)? Não repete
        try {
          $app.findFirstRecordByFilter(
            'people_events',
            "person_id = {:p} && kind = 'CONTATO' && title = {:t} && date >= {:d}",
            { p: p.id, t: g.title, d: today + ' 00:00:00' },
          )
          continue
        } catch (_) {}
        const full = p.getString('name').trim()
        const year = parseInt(p.getString(g.field).slice(0, 4), 10)
        const years = year ? parseInt(today.slice(0, 4), 10) - year : null
        const text = template
          .replace(/\{nome\}/g, full.split(/\s+/)[0] || '')
          .replace(/\{nome_completo\}/g, full)
          .replace(/\{anos\}/g, years === null ? '' : String(years))
          .replace(/\{igreja\}/g, churchName)
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/ ([,.!?])/g, '$1')
          .trim()
        try {
          enqueue(churchId, g.kind, phone, full, text, p.id)
          const evCol = $app.findCollectionByNameOrId('people_events')
          const pe = new Record(evCol)
          pe.set('church_id', churchId)
          pe.set('person_id', p.id)
          pe.set('kind', 'CONTATO')
          pe.set('date', today + ' 00:00:00.000Z')
          pe.set('title', g.title)
          pe.set('description', text)
          $app.save(pe)
        } catch (_) {}
      }
    }
  }
})
