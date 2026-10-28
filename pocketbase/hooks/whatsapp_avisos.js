// Avisos pelo WhatsApp: aba "Avisos" da equipe de Mídia (migração 0075).
//
// POST /backend/v1/whatsapp/avisos { church_id, action, ... }  (chaves culto.avisos.*)
// - overview: avisos (avulsos e dos cultos), regras e estado do WhatsApp
// - get / save / delete: um aviso ou regra
// - audience_count: quantas pessoas o público alcança (e quantas ficam sem celular)
// - options: grupos, eventos e busca de pessoas para montar o público
// - schedule: programa o envio (agora ou em dia e hora); pause / resume / cancel
// - recipients / remove: quem recebe e tirar alguém que ainda está na fila
// - test: manda o aviso só para mim
// - week: cultos da semana com a regra que vale para cada um; occurrence: abre o aviso de um
//   culto (para subir a arte da semana); skip: não enviar esta semana
// POST /backend/v1/whatsapp/avisos/upload (multipart: church_id, id, file): arte do aviso
// GET  /backend/v1/whatsapp/media/{token}: o arquivo, para a Evolution baixar e mandar
//
// O cron whatsapp_avisos_tick (a cada minuto) abre os avisos dos cultos na hora da regra,
// começa os programados e encerra os que terminaram. Ao começar, cada pessoa vira uma mensagem
// na fila com horário próprio: uma a cada pace_min a pace_max minutos, só dentro da janela
// (horário de Brasília). Quem manda é o cron da fila (whatsapp_queue.js).
//
// Como em todo hook, cada handler roda isolado: os helpers ficam dentro de cada um.

routerAdd(
  'POST',
  '/backend/v1/whatsapp/avisos',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    const action = String(body.action || 'overview')
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })

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
    const can = (a) => isMaster || keys.indexOf('culto.avisos.' + a) !== -1
    if (!can('ver')) return e.json(403, { message: 'Você não tem acesso aos avisos.' })
    const deny = () => e.json(403, { message: 'Seu perfil não permite esta ação nos avisos.' })

    const BRT = 3 * 3600 * 1000
    const MEDIA_TYPES = ['TEXTO', 'IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO']
    const PERSON_STATUSES = ['MEMBRO', 'CONGREGADO', 'VISITANTE', 'AFASTADO']
    const EDITABLE = ['RASCUNHO', 'PROGRAMADO', 'AGUARDANDO', 'ATIVA', 'INATIVA']

    const iso = (ms) => new Date(ms).toISOString().replace('T', ' ')
    const parseDate = (s) => {
      const t = new Date(String(s || '').replace(' ', 'T')).getTime()
      return isNaN(t) ? 0 : t
    }
    const hm = (s, def) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
      if (!m) return def
      const v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
      return v >= 0 && v < 24 * 60 ? v : def
    }
    const fmtHm = (v) =>
      String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0')
    // Põe um horário dentro da janela (Brasília): antes dela vai para o início, depois dela
    // para o início do dia seguinte
    const nextSlot = (t, ws, we) => {
      const b = new Date(t - BRT)
      const min = b.getUTCHours() * 60 + b.getUTCMinutes()
      const day = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
      if (min < ws) return day + ws * 60000 + BRT
      if (min >= we) return day + 24 * 3600 * 1000 + ws * 60000 + BRT
      return t
    }
    const fixPhone = (p) => {
      let d = String(p || '').replace(/\D/g, '')
      while (d.indexOf('0') === 0) d = d.slice(1)
      if (d.length === 10 || d.length === 11) d = '55' + d
      return d.length >= 12 && d.length <= 13 ? d : ''
    }
    const parseJson = (s, def) => {
      try {
        const v = JSON.parse(s || '')
        return v === null || v === undefined ? def : v
      } catch (_) {
        return def
      }
    }
    const reqBase = () => {
      const env = String($os.getenv('WHATSAPP_MEDIA_BASE_URL') || '')
        .replace(/\s+/g, '')
        .replace(/\/+$/, '')
      if (env) return env
      let host = ''
      let proto = 'https'
      try {
        host = String(e.request.header.get('X-Forwarded-Host') || e.request.host || '')
        const p = String(e.request.header.get('X-Forwarded-Proto') || '')
        if (p) proto = p.split(',')[0].trim()
        else if (/^(localhost|127\.)/.test(host)) proto = 'http'
      } catch (_) {}
      return host ? proto + '://' + host.split(',')[0].trim() : ''
    }

    const findCampaign = (id) => {
      try {
        const r = $app.findRecordById('whatsapp_campaigns', String(id || ''))
        return r.getString('church_id') === churchId ? r : null
      } catch (_) {
        return null
      }
    }
    const countMsgs = (campaignId, status) => {
      try {
        return $app.countRecords(
          'whatsapp_messages',
          $dbx.exp('campaign_id = {:c} AND status = {:s}', { c: campaignId, s: status }),
        )
      } catch (_) {
        return 0
      }
    }
    const stats = (r) => ({
      fila: countMsgs(r.id, 'FILA'),
      pausado: countMsgs(r.id, 'PAUSADO'),
      enviado: countMsgs(r.id, 'ENVIADO'),
      erro: countMsgs(r.id, 'ERRO'),
      cancelado: countMsgs(r.id, 'CANCELADO'),
    })
    const ser = (r, withStats) => {
      const out = {
        id: r.id,
        type: r.getString('type'),
        title: r.getString('title'),
        media_type: r.getString('media_type'),
        media_name: r.getString('media'),
        media_path: r.getString('media_token')
          ? '/backend/v1/whatsapp/media/' + r.getString('media_token')
          : '',
        use_event_cover: r.getBool('use_event_cover'),
        text: r.getString('text'),
        audience: parseJson(r.getString('audience'), {}),
        status: r.getString('status'),
        starts_at: r.getString('starts_at'),
        window_start: r.getString('window_start') || '08:00',
        window_end: r.getString('window_end') || '20:00',
        pace_min: r.getInt('pace_min') || 3,
        pace_max: r.getInt('pace_max') || 5,
        total: r.getInt('total'),
        eta: r.getString('eta'),
        note: r.getString('note'),
        weekday: r.getInt('weekday'),
        title_match: r.getString('title_match'),
        days_before: r.getInt('days_before'),
        send_time: r.getString('send_time') || '10:00',
        missing_media: r.getString('missing_media') || 'SO_TEXTO',
        rule_id: r.getString('rule_id'),
        event_id: r.getString('event_id'),
        church_event_id: r.getString('church_event_id'),
        created_by: r.getString('created_by'),
        started_at: r.getString('started_at'),
        finished_at: r.getString('finished_at'),
        created: r.getString('created'),
        updated: r.getString('updated'),
      }
      if (withStats) out.stats = stats(r)
      return out
    }

    // Público: lista de { phone, name } sem repetir número; conta quem ficou sem celular
    const resolveAudience = (aud) => {
      const out = []
      const seen = {}
      let noPhone = 0
      const push = (phone, name) => {
        const p = fixPhone(phone)
        if (!p) {
          noPhone++
          return
        }
        if (seen[p]) return
        seen[p] = true
        out.push({ phone: p, name: String(name || '').trim() })
      }
      const type = String((aud && aud.type) || 'TODOS')
      const cong = String((aud && aud.congregation) || '')
      const okPerson = (p) =>
        p.getString('church_id') === churchId &&
        p.getString('status') !== 'FALECIDO' &&
        p.getString('status') !== 'TRANSFERIDO' &&
        (!cong || p.getString('congregation') === cong)
      try {
        if (type === 'EVENTO') {
          const regs = $app.findRecordsByFilter(
            'church_event_registrations',
            'church_id = {:c} && event_id = {:e}',
            'name',
            3000,
            0,
            { c: churchId, e: String(aud.event_id || '') },
          )
          for (const r of regs) {
            let phone = r.getString('phone')
            if (!phone && r.getString('person_id')) {
              try {
                phone = $app.findRecordById('people', r.getString('person_id')).getString('phone')
              } catch (_) {}
            }
            push(phone, r.getString('name'))
          }
        } else if (type === 'GRUPO' || type === 'PESSOAS') {
          let ids = []
          if (type === 'GRUPO') {
            const gm = $app.findRecordsByFilter(
              'church_group_members',
              'church_id = {:c} && group_id = {:g}',
              '',
              3000,
              0,
              { c: churchId, g: String(aud.group_id || '') },
            )
            ids = gm.map((m) => m.getString('person_id'))
          } else {
            ids = Array.isArray(aud.person_ids) ? aud.person_ids.slice(0, 3000) : []
          }
          for (const id of ids) {
            try {
              const p = $app.findRecordById('people', String(id))
              if (okPerson(p)) push(p.getString('phone'), p.getString('name'))
            } catch (_) {}
          }
        } else {
          let statuses = Array.isArray(aud && aud.statuses)
            ? aud.statuses.filter((s) => PERSON_STATUSES.indexOf(s) !== -1)
            : []
          if (statuses.length === 0) statuses = ['MEMBRO', 'CONGREGADO']
          const people = $app.findRecordsByFilter(
            'people',
            'church_id = {:c}' + (cong ? ' && congregation = {:g}' : ''),
            'name',
            5000,
            0,
            { c: churchId, g: cong },
          )
          for (const p of people) {
            if (!okPerson(p) || statuses.indexOf(p.getString('status')) === -1) continue
            push(p.getString('phone'), p.getString('name'))
          }
        }
      } catch (_) {}
      return { list: out, noPhone: noPhone }
    }

    const cleanAudience = (a) => {
      a = a && typeof a === 'object' ? a : {}
      const type = ['TODOS', 'GRUPO', 'EVENTO', 'PESSOAS'].indexOf(a.type) !== -1 ? a.type : 'TODOS'
      const out = { type: type, congregation: String(a.congregation || '').slice(0, 50) }
      if (type === 'TODOS') {
        out.statuses = (Array.isArray(a.statuses) ? a.statuses : ['MEMBRO', 'CONGREGADO']).filter(
          (s) => PERSON_STATUSES.indexOf(s) !== -1,
        )
      }
      if (type === 'GRUPO') out.group_id = String(a.group_id || '').slice(0, 40)
      if (type === 'EVENTO') out.event_id = String(a.event_id || '').slice(0, 40)
      if (type === 'PESSOAS') {
        out.person_ids = (Array.isArray(a.person_ids) ? a.person_ids : [])
          .map((x) => String(x).slice(0, 40))
          .slice(0, 3000)
      }
      return out
    }

    // Texto com os dados do culto/evento (o nome de cada pessoa entra na hora do envio)
    const fillText = (r, name) => {
      const vars = { primeiro_nome: '', nome: '', igreja: '', culto: '', data: '', hora: '' }
      const full = String(name || '').trim()
      vars.nome = full
      vars.primeiro_nome = full.split(/\s+/)[0] || ''
      try {
        vars.igreja = $app.findRecordById('churches', churchId).getString('name')
      } catch (_) {}
      const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '')
      if (r.getString('event_id')) {
        try {
          const ev = $app.findRecordById('events', r.getString('event_id'))
          vars.culto = ev.getString('title')
          vars.data = dmy(ev.getString('date'))
          vars.hora = ev.getString('start_time')
        } catch (_) {}
      }
      if (r.getString('church_event_id')) {
        try {
          const ce = $app.findRecordById('church_events', r.getString('church_event_id'))
          vars.evento = ce.getString('title')
          vars.data_evento = dmy(ce.getString('starts_on'))
          vars.local = ce.getString('location')
          let base = ''
          try {
            base = String($app.settings().meta.appURL || '').replace(/\/+$/, '')
          } catch (_) {}
          vars.link_inscricao = base ? base + '/inscricao/' + ce.getString('public_key') : ''
        } catch (_) {}
      }
      return String(r.getString('text') || '')
        .replace(/\{(\w+)\}/g, (all, k) =>
          Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : all,
        )
        .replace(/\*\*([^*]+)\*\*/g, '*$1*')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
    }

    // Arte que vai junto: a do aviso; no aviso de um culto sem arte, a da regra; ou a capa
    // do evento
    const mediaOf = (r) => {
      const type = r.getString('media_type')
      if (type === 'TEXTO') return null
      const own = (x) =>
        x && x.getString('media_token') && (x.getString('media') || x.getBool('use_event_cover'))
          ? x
          : null
      let src = own(r)
      if (!src && r.getString('rule_id')) {
        try {
          src = own($app.findRecordById('whatsapp_campaigns', r.getString('rule_id')))
        } catch (_) {}
      }
      if (!src) return null
      let name = src.getString('media')
      if (!name && src.getBool('use_event_cover')) {
        try {
          name = $app
            .findRecordById('church_events', src.getString('church_event_id'))
            .getString('cover')
        } catch (_) {}
        if (!name) return null
      }
      const base = src.getString('media_base') || reqBase()
      if (!base) return null
      return {
        type: type,
        url: base + '/backend/v1/whatsapp/media/' + src.getString('media_token'),
        name: name,
      }
    }

    const reschedule = (r, rows, from) => {
      const ws = hm(r.getString('window_start'), 8 * 60)
      const we = hm(r.getString('window_end'), 20 * 60)
      const pmin = Math.max(1, r.getInt('pace_min') || 3)
      const pmax = Math.max(pmin, r.getInt('pace_max') || 5)
      let t = from
      for (const m of rows) {
        t = nextSlot(t, ws, we)
        m.set('status', 'FILA')
        m.set('send_after', iso(t))
        $app.save(m)
        t += (pmin + Math.random() * (pmax - pmin)) * 60000
      }
      return t
    }

    const userName = auth.getString('name') || auth.getString('email')

    // ---------- leitura ----------

    if (action === 'overview') {
      const rows = $app.findRecordsByFilter(
        'whatsapp_campaigns',
        'church_id = {:c}',
        '-created',
        300,
        0,
        { c: churchId },
      )
      let wa = { status: 'close', phone: '' }
      try {
        const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
          c: churchId,
        })
        wa = { status: st.getString('status') || 'close', phone: st.getString('phone') }
      } catch (_) {}
      const configured = !!(
        String($os.getenv('WHATSAPP_API_URL') || '').trim() &&
        String($os.getenv('WHATSAPP_API_KEY') || '').trim()
      )
      return e.json(200, {
        items: rows.map((r) => {
          const active = ['ENVIANDO', 'PAUSADO', 'CONCLUIDO'].indexOf(r.getString('status')) !== -1
          return ser(r, active)
        }),
        whatsapp: { configured: configured, state: wa.status, phone: wa.phone },
        can: {
          novo: can('novo'),
          alterar: can('alterar'),
          excluir: can('excluir'),
          enviar: can('enviar'),
        },
      })
    }

    if (action === 'get') {
      const r = findCampaign(body.id)
      if (!r) return e.json(404, { message: 'Aviso não encontrado' })
      return e.json(200, ser(r, true))
    }

    if (action === 'audience_count') {
      const res = resolveAudience(cleanAudience(body.audience))
      return e.json(200, { total: res.list.length, no_phone: res.noPhone })
    }

    if (action === 'options') {
      const out = { groups: [], events: [], people: [] }
      try {
        out.groups = $app
          .findRecordsByFilter(
            'church_groups',
            'church_id = {:c} && active = true',
            'name',
            300,
            0,
            { c: churchId },
          )
          .map((g) => ({ id: g.id, name: g.getString('name'), kind: g.getString('kind') }))
      } catch (_) {}
      try {
        const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
        out.events = $app
          .findRecordsByFilter(
            'church_events',
            'church_id = {:c} && starts_on >= {:d}',
            'starts_on',
            200,
            0,
            { c: churchId, d: since },
          )
          .map((x) => ({
            id: x.id,
            title: x.getString('title'),
            starts_on: x.getString('starts_on'),
            location: x.getString('location'),
            congregation: x.getString('congregation'),
            has_cover: !!x.getString('cover'),
          }))
      } catch (_) {}
      const q = String(body.q || '').trim()
      const ids = Array.isArray(body.person_ids) ? body.person_ids.slice(0, 3000) : []
      try {
        if (q.length >= 2) {
          out.people = $app
            .findRecordsByFilter(
              'people',
              "church_id = {:c} && name ~ {:q} && status != 'FALECIDO'",
              'name',
              20,
              0,
              { c: churchId, q: q },
            )
            .map((p) => ({
              id: p.id,
              name: p.getString('name'),
              has_phone: !!fixPhone(p.getString('phone')),
            }))
        } else if (ids.length) {
          for (const id of ids) {
            try {
              const p = $app.findRecordById('people', String(id))
              if (p.getString('church_id') !== churchId) continue
              out.people.push({
                id: p.id,
                name: p.getString('name'),
                has_phone: !!fixPhone(p.getString('phone')),
              })
            } catch (_) {}
          }
        }
      } catch (_) {}
      return e.json(200, out)
    }

    if (action === 'recipients') {
      const r = findCampaign(body.id)
      if (!r) return e.json(404, { message: 'Aviso não encontrado' })
      const page = Math.max(1, parseInt(body.page, 10) || 1)
      const perPage = 100
      const status = String(body.status || '')
      let filter = 'campaign_id = {:c}'
      if (['FILA', 'PAUSADO', 'ENVIADO', 'ERRO', 'CANCELADO'].indexOf(status) !== -1)
        filter += ' && status = {:s}'
      const q = String(body.q || '').trim()
      if (q) filter += ' && name ~ {:q}'
      const rows = $app.findRecordsByFilter(
        'whatsapp_messages',
        filter,
        'send_after',
        perPage + 1,
        (page - 1) * perPage,
        { c: r.id, s: status, q: q },
      )
      return e.json(200, {
        items: rows.slice(0, perPage).map((m) => ({
          id: m.id,
          name: m.getString('name'),
          phone_end: m.getString('phone').slice(-4),
          status: m.getString('status'),
          error: m.getString('error'),
          send_after: m.getString('send_after'),
          sent_at: m.getString('sent_at'),
        })),
        has_more: rows.length > perPage,
        stats: stats(r),
      })
    }

    if (action === 'week') {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(String(body.start || ''))
        ? String(body.start)
        : new Date(Date.now() - BRT).toISOString().slice(0, 10)
      const endMs = new Date(start + 'T00:00:00Z').getTime() + 7 * 24 * 3600 * 1000
      const end = new Date(endMs).toISOString().slice(0, 10)
      const events = $app.findRecordsByFilter(
        'events',
        "church_id = {:c} && date >= {:a} && date < {:b} && status != 'Cancelado'",
        'date',
        100,
        0,
        { c: churchId, a: start + ' 00:00:00', b: end + ' 00:00:00' },
      )
      const rules = $app.findRecordsByFilter(
        'whatsapp_campaigns',
        "church_id = {:c} && type = 'REGRA_CULTO' && status = 'ATIVA'",
        'created',
        200,
        0,
        { c: churchId },
      )
      const items = []
      for (const ev of events) {
        const day = ev.getString('date').slice(0, 10)
        const wd = new Date(day + 'T12:00:00Z').getUTCDay()
        const title = ev.getString('title').toLowerCase()
        const matching = rules.filter(
          (r) =>
            r.getInt('weekday') === wd &&
            (!r.getString('title_match') ||
              title.indexOf(r.getString('title_match').toLowerCase()) !== -1),
        )
        const evOut = {
          id: ev.id,
          title: ev.getString('title'),
          date: day,
          start_time: ev.getString('start_time'),
        }
        if (matching.length === 0) items.push({ event: evOut, rule: null, occurrence: null })
        for (const rule of matching) {
          let occ = null
          try {
            occ = $app.findFirstRecordByFilter(
              'whatsapp_campaigns',
              "type = 'CULTO' && rule_id = {:r} && event_id = {:e}",
              { r: rule.id, e: ev.id },
            )
          } catch (_) {}
          const p = day.split('-').map((x) => parseInt(x, 10))
          const st = hm(rule.getString('send_time'), 10 * 60)
          const sendAt =
            Date.UTC(p[0], p[1] - 1, p[2] - rule.getInt('days_before')) + st * 60000 + BRT
          items.push({
            event: evOut,
            rule: ser(rule, false),
            occurrence: occ ? ser(occ, true) : null,
            send_at: iso(sendAt),
            has_media: !!mediaOf(occ || rule),
          })
        }
      }
      return e.json(200, { start: start, items: items })
    }

    // ---------- escrita ----------

    if (action === 'save') {
      let r = null
      if (body.id) {
        r = findCampaign(body.id)
        if (!r) return e.json(404, { message: 'Aviso não encontrado' })
        if (!can('alterar') && !(can('novo') && r.getString('created_by') === userName))
          return deny()
        if (EDITABLE.indexOf(r.getString('status')) === -1)
          return e.json(400, {
            message: 'Este aviso já começou a sair e não pode mais ser mudado.',
          })
      } else {
        if (!can('novo')) return deny()
        const type = body.type === 'REGRA_CULTO' ? 'REGRA_CULTO' : 'AVULSO'
        r = new Record($app.findCollectionByNameOrId('whatsapp_campaigns'))
        r.set('church_id', churchId)
        r.set('type', type)
        r.set('status', type === 'REGRA_CULTO' ? 'ATIVA' : 'RASCUNHO')
        r.set('created_by', userName)
      }
      const type = r.getString('type')
      const title = String(body.title || '')
        .trim()
        .slice(0, 200)
      if (!title) return e.json(400, { message: 'Dê um nome ao aviso.' })
      const mediaType = MEDIA_TYPES.indexOf(body.media_type) !== -1 ? body.media_type : 'TEXTO'
      const text = String(body.text || '').slice(0, 4000)
      if (mediaType === 'TEXTO' && !text.trim())
        return e.json(400, { message: 'Escreva o texto do aviso.' })
      const ws = hm(body.window_start, 8 * 60)
      const we = hm(body.window_end, 20 * 60)
      if (we - ws < 60)
        return e.json(400, { message: 'A janela de envio precisa ter pelo menos 1 hora.' })
      const pmin = Math.min(60, Math.max(1, parseInt(body.pace_min, 10) || 3))
      const pmax = Math.min(120, Math.max(pmin, parseInt(body.pace_max, 10) || 5))
      r.set('title', title)
      r.set('media_type', mediaType)
      r.set('text', text)
      r.set('window_start', fmtHm(ws))
      r.set('window_end', fmtHm(we))
      r.set('pace_min', pmin)
      r.set('pace_max', pmax)
      if (type !== 'CULTO') r.set('audience', cleanAudience(body.audience))
      const ceId = String(body.church_event_id || '')
      if (ceId) {
        try {
          const ce = $app.findRecordById('church_events', ceId)
          if (ce.getString('church_id') !== churchId) throw new Error('outra igreja')
          r.set('church_event_id', ce.id)
        } catch (_) {
          return e.json(400, { message: 'Evento não encontrado.' })
        }
      } else if (type !== 'CULTO') r.set('church_event_id', '')
      r.set('use_event_cover', body.use_event_cover === true && !!r.getString('church_event_id'))
      if (type === 'REGRA_CULTO') {
        const wd = parseInt(body.weekday, 10)
        if (!(wd >= 0 && wd <= 6)) return e.json(400, { message: 'Escolha o dia do culto.' })
        r.set('weekday', wd)
        r.set(
          'title_match',
          String(body.title_match || '')
            .trim()
            .slice(0, 100),
        )
        r.set('days_before', Math.min(6, Math.max(0, parseInt(body.days_before, 10) || 0)))
        r.set('send_time', fmtHm(hm(body.send_time, 10 * 60)))
        r.set('missing_media', body.missing_media === 'ESPERAR' ? 'ESPERAR' : 'SO_TEXTO')
        if (body.active === false) r.set('status', 'INATIVA')
        else if (body.active === true) r.set('status', 'ATIVA')
      }
      if (r.getBool('use_event_cover') && !r.getString('media_token')) {
        r.set('media_token', $security.randomString(40))
      }
      if (r.getBool('use_event_cover') || r.getString('media')) r.set('media_base', reqBase())
      $app.save(r)
      return e.json(200, ser(r, false))
    }

    if (action === 'delete') {
      if (!can('excluir')) return deny()
      const r = findCampaign(body.id)
      if (!r) return e.json(404, { message: 'Aviso não encontrado' })
      if (['ENVIANDO', 'PAUSADO', 'PROGRAMADO', 'AGUARDANDO'].indexOf(r.getString('status')) !== -1)
        return e.json(400, { message: 'Cancele o envio antes de excluir.' })
      $app.delete(r)
      return e.json(200, { id: body.id })
    }

    if (action === 'occurrence') {
      if (!can('novo') && !can('alterar')) return deny()
      const rule = findCampaign(body.rule_id)
      if (!rule || rule.getString('type') !== 'REGRA_CULTO')
        return e.json(404, { message: 'Regra não encontrada' })
      let ev = null
      try {
        ev = $app.findRecordById('events', String(body.event_id || ''))
      } catch (_) {}
      if (!ev || ev.getString('church_id') !== churchId)
        return e.json(404, { message: 'Culto não encontrado' })
      let occ = null
      try {
        occ = $app.findFirstRecordByFilter(
          'whatsapp_campaigns',
          "type = 'CULTO' && rule_id = {:r} && event_id = {:e}",
          { r: rule.id, e: ev.id },
        )
      } catch (_) {}
      if (!occ) {
        occ = new Record($app.findCollectionByNameOrId('whatsapp_campaigns'))
        occ.set('church_id', churchId)
        occ.set('type', 'CULTO')
        occ.set('status', 'AGUARDANDO')
        occ.set('rule_id', rule.id)
        occ.set('event_id', ev.id)
        occ.set(
          'title',
          (
            ev.getString('title') +
            ' · ' +
            ev.getString('date').slice(8, 10) +
            '/' +
            ev.getString('date').slice(5, 7)
          ).slice(0, 200),
        )
        for (const f of [
          'media_type',
          'text',
          'audience',
          'window_start',
          'window_end',
          'pace_min',
          'pace_max',
          'church_event_id',
        ]) {
          occ.set(f, rule.get(f))
        }
        occ.set('created_by', userName)
        $app.save(occ)
      }
      return e.json(200, ser(occ, true))
    }

    if (action === 'test') {
      if (!can('enviar') && !can('novo')) return deny()
      const r = findCampaign(body.id)
      if (!r) return e.json(404, { message: 'Aviso não encontrado' })
      let phone = fixPhone(body.phone)
      if (!phone) phone = fixPhone(member.getString('phone')) || fixPhone(auth.getString('phone'))
      if (!phone)
        return e.json(400, { message: 'Informe um celular com DDD para receber o teste.' })
      const media = mediaOf(r)
      if (r.getString('media_type') !== 'TEXTO' && !media)
        return e.json(400, { message: 'Suba o arquivo do aviso antes de testar.' })
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', churchId)
      msg.set('kind', 'TESTE')
      msg.set('phone', phone)
      msg.set('name', userName)
      msg.set('text', fillText(r, userName))
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('send_after', iso(Date.now()))
      if (media) {
        msg.set('media_type', media.type)
        msg.set('media_url', media.url)
        msg.set('file_name', media.name)
      }
      $app.save(msg)
      return e.json(200, { id: msg.id, phone_end: phone.slice(-4) })
    }

    if (!can('enviar')) return deny()

    if (action === 'schedule') {
      const r = findCampaign(body.id)
      if (!r || r.getString('type') === 'REGRA_CULTO')
        return e.json(404, { message: 'Aviso não encontrado' })
      if (['RASCUNHO', 'PROGRAMADO', 'AGUARDANDO'].indexOf(r.getString('status')) === -1)
        return e.json(400, { message: 'Este aviso já foi enviado.' })
      if (r.getString('media_type') !== 'TEXTO' && !mediaOf(r))
        return e.json(400, { message: 'Suba o arquivo do aviso antes de programar.' })
      let at = Date.now()
      if (body.mode === 'DATA') {
        at = parseDate(body.starts_at)
        if (!at) return e.json(400, { message: 'Escolha o dia e a hora.' })
        if (at < Date.now() - 5 * 60000) return e.json(400, { message: 'Esse horário já passou.' })
      }
      const res = resolveAudience(parseJson(r.getString('audience'), {}))
      if (res.list.length === 0)
        return e.json(400, { message: 'Ninguém do público escolhido tem celular cadastrado.' })
      r.set('status', 'PROGRAMADO')
      r.set('starts_at', iso(at))
      r.set('total', res.list.length)
      r.set('note', '')
      if (!r.getString('media_base')) r.set('media_base', reqBase())
      $app.save(r)
      return e.json(200, ser(r, false))
    }

    if (action === 'skip') {
      const r = findCampaign(body.id)
      if (!r || r.getString('type') !== 'CULTO')
        return e.json(404, { message: 'Aviso não encontrado' })
      if (['AGUARDANDO', 'PROGRAMADO'].indexOf(r.getString('status')) === -1)
        return e.json(400, { message: 'Este aviso já começou a sair.' })
      r.set('status', 'CANCELADO')
      r.set('note', 'Não enviar esta semana (' + userName + ')')
      $app.save(r)
      return e.json(200, ser(r, false))
    }

    if (action === 'pause' || action === 'resume' || action === 'cancel') {
      const r = findCampaign(body.id)
      if (!r) return e.json(404, { message: 'Aviso não encontrado' })
      const st = r.getString('status')
      if (action === 'pause') {
        if (st !== 'ENVIANDO') return e.json(400, { message: 'Este aviso não está enviando.' })
        const rows = $app.findRecordsByFilter(
          'whatsapp_messages',
          "campaign_id = {:c} && status = 'FILA'",
          '',
          0,
          0,
          { c: r.id },
        )
        for (const m of rows) {
          m.set('status', 'PAUSADO')
          $app.save(m)
        }
        r.set('status', 'PAUSADO')
        r.set('note', 'Pausado por ' + userName)
      } else if (action === 'resume') {
        if (st !== 'PAUSADO') return e.json(400, { message: 'Este aviso não está pausado.' })
        const rows = $app.findRecordsByFilter(
          'whatsapp_messages',
          "campaign_id = {:c} && status = 'PAUSADO'",
          'send_after',
          0,
          0,
          { c: r.id },
        )
        const end = reschedule(r, rows, Date.now() + 60000)
        r.set('status', 'ENVIANDO')
        r.set('eta', iso(end))
        r.set('note', '')
      } else {
        if (['PROGRAMADO', 'AGUARDANDO', 'ENVIANDO', 'PAUSADO'].indexOf(st) === -1)
          return e.json(400, { message: 'Não há envio para cancelar.' })
        const rows = $app.findRecordsByFilter(
          'whatsapp_messages',
          "campaign_id = {:c} && (status = 'FILA' || status = 'PAUSADO')",
          '',
          0,
          0,
          { c: r.id },
        )
        for (const m of rows) {
          m.set('status', 'CANCELADO')
          m.set('error', 'Envio cancelado')
          $app.save(m)
        }
        r.set('status', 'CANCELADO')
        r.set('note', 'Cancelado por ' + userName)
        r.set('finished_at', iso(Date.now()))
      }
      $app.save(r)
      return e.json(200, ser(r, true))
    }

    if (action === 'remove') {
      let m = null
      try {
        m = $app.findRecordById('whatsapp_messages', String(body.message_id || ''))
      } catch (_) {}
      if (!m || m.getString('church_id') !== churchId || !m.getString('campaign_id'))
        return e.json(404, { message: 'Pessoa não encontrada neste aviso' })
      if (['FILA', 'PAUSADO'].indexOf(m.getString('status')) === -1)
        return e.json(400, { message: 'Esta mensagem já saiu.' })
      m.set('status', 'CANCELADO')
      m.set('error', 'Tirado da lista por ' + userName)
      $app.save(m)
      return e.json(200, { id: m.id })
    }

    return e.json(400, { message: 'Ação desconhecida' })
  },
  $apis.requireAuth(),
)

// Arte do aviso (imagem, vídeo, documento ou áudio), até 16 MB
routerAdd(
  'POST',
  '/backend/v1/whatsapp/avisos/upload',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
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
    if (
      !isMaster &&
      keys.indexOf('culto.avisos.novo') === -1 &&
      keys.indexOf('culto.avisos.alterar') === -1
    )
      return e.json(403, { message: 'Seu perfil não permite mudar avisos.' })

    let r = null
    try {
      r = $app.findRecordById('whatsapp_campaigns', String(body.id || ''))
    } catch (_) {}
    if (!r || r.getString('church_id') !== churchId)
      return e.json(404, { message: 'Aviso não encontrado' })
    if (
      ['RASCUNHO', 'PROGRAMADO', 'AGUARDANDO', 'ATIVA', 'INATIVA'].indexOf(
        r.getString('status'),
      ) === -1
    )
      return e.json(400, { message: 'Este aviso já começou a sair e não pode mais ser mudado.' })

    if (body.remove === true || body.remove === 'true') {
      if (r.getString('media')) r.set('media-', r.getString('media'))
    } else {
      let files = []
      try {
        files = e.findUploadedFiles('file') || []
      } catch (_) {}
      if (files.length === 0) return e.json(400, { message: 'Escolha um arquivo.' })
      const f = files[0]
      const name = String(f.originalName || f.name || '').toLowerCase()
      const ext = name.indexOf('.') !== -1 ? name.split('.').pop() : ''
      const ALLOWED = {
        IMAGEM: ['jpg', 'jpeg', 'png', 'webp'],
        VIDEO: ['mp4', '3gp', 'mov'],
        DOCUMENTO: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
        AUDIO: ['mp3', 'ogg', 'm4a', 'aac', 'opus', 'wav'],
      }
      const type = r.getString('media_type')
      const allowed = ALLOWED[type] || []
      if (allowed.indexOf(ext) === -1) {
        return e.json(400, {
          message:
            type === 'TEXTO'
              ? 'Escolha antes o tipo do aviso (imagem, vídeo, documento ou áudio).'
              : 'Para este tipo de aviso use: ' + allowed.join(', ') + '.',
        })
      }
      if (f.size > 16 * 1024 * 1024)
        return e.json(400, { message: 'O arquivo passa de 16 MB. Use um menor.' })
      r.set('media', f)
    }
    r.set('media_token', $security.randomString(40))
    let base = String($os.getenv('WHATSAPP_MEDIA_BASE_URL') || '')
      .replace(/\s+/g, '')
      .replace(/\/+$/, '')
    if (!base) {
      try {
        const host = String(e.request.header.get('X-Forwarded-Host') || e.request.host || '')
          .split(',')[0]
          .trim()
        let proto = String(e.request.header.get('X-Forwarded-Proto') || '')
          .split(',')[0]
          .trim()
        if (!proto) proto = /^(localhost|127\.)/.test(host) ? 'http' : 'https'
        if (host) base = proto + '://' + host
      } catch (_) {}
    }
    r.set('media_base', base)
    $app.save(r)
    return e.json(200, {
      id: r.id,
      media_name: r.getString('media'),
      media_path: '/backend/v1/whatsapp/media/' + r.getString('media_token'),
    })
  },
  $apis.requireAuth(),
)

// O arquivo do aviso, para a Evolution baixar. Público, mas só com o token (40 caracteres
// aleatórios) que o servidor manda junto com cada mensagem.
routerAdd('GET', '/backend/v1/whatsapp/media/{token}', (e) => {
  let token = ''
  try {
    token = String(e.request.pathValue('token') || '')
  } catch (_) {}
  if (!/^[A-Za-z0-9]{32,64}$/.test(token)) return e.json(404, { message: 'Não encontrado' })
  let r = null
  try {
    r = $app.findFirstRecordByFilter('whatsapp_campaigns', 'media_token = {:t}', { t: token })
  } catch (_) {
    return e.json(404, { message: 'Não encontrado' })
  }
  let src = r
  let name = r.getString('media')
  if (!name && r.getBool('use_event_cover')) {
    try {
      src = $app.findRecordById('church_events', r.getString('church_event_id'))
      name = src.getString('cover')
    } catch (_) {}
  }
  if (!name) return e.json(404, { message: 'Não encontrado' })
  const ext = name.toLowerCase().split('.').pop()
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
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
  }
  let fsys = null
  try {
    fsys = $app.newFilesystem()
    const reader = fsys.getReader(src.baseFilesPath() + '/' + name)
    try {
      const h = e.response.header()
      h.set('Content-Disposition', 'inline; filename="' + name.replace(/["\r\n\\]/g, '_') + '"')
      h.set('X-Content-Type-Options', 'nosniff')
      h.set('Cache-Control', 'private, max-age=3600')
    } catch (_) {}
    return e.stream(200, MIME[ext] || 'application/octet-stream', reader)
  } catch (err) {
    if (fsys) {
      try {
        fsys.close()
      } catch (_) {}
    }
    return e.json(404, { message: 'Não encontrado' })
  }
})

// A cada minuto: abre os avisos dos cultos, começa os programados e encerra os terminados
cronAdd('whatsapp_avisos_tick', '* * * * *', () => {
  const BRT = 3 * 3600 * 1000
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString().replace('T', ' ')
  const parseDate = (s) => {
    const t = new Date(String(s || '').replace(' ', 'T')).getTime()
    return isNaN(t) ? 0 : t
  }
  const today = new Date(now - BRT).toISOString().slice(0, 10)
  const hm = (s, def) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
    if (!m) return def
    const v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
    return v >= 0 && v < 24 * 60 ? v : def
  }
  const nextSlot = (t, ws, we) => {
    const b = new Date(t - BRT)
    const min = b.getUTCHours() * 60 + b.getUTCMinutes()
    const day = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
    if (min < ws) return day + ws * 60000 + BRT
    if (min >= we) return day + 24 * 3600 * 1000 + ws * 60000 + BRT
    return t
  }
  const fixPhone = (p) => {
    let d = String(p || '').replace(/\D/g, '')
    while (d.indexOf('0') === 0) d = d.slice(1)
    if (d.length === 10 || d.length === 11) d = '55' + d
    return d.length >= 12 && d.length <= 13 ? d : ''
  }
  const parseJson = (s, def) => {
    try {
      const v = JSON.parse(s || '')
      return v === null || v === undefined ? def : v
    } catch (_) {
      return def
    }
  }
  const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '')
  let appUrl = ''
  try {
    appUrl = String($app.settings().meta.appURL || '').replace(/\/+$/, '')
  } catch (_) {}
  const msgCol = $app.findCollectionByNameOrId('whatsapp_messages')
  const campCol = $app.findCollectionByNameOrId('whatsapp_campaigns')

  const resolveAudience = (churchId, aud) => {
    const out = []
    const seen = {}
    const push = (phone, name) => {
      const p = fixPhone(phone)
      if (!p || seen[p]) return
      seen[p] = true
      out.push({ phone: p, name: String(name || '').trim() })
    }
    const type = String((aud && aud.type) || 'TODOS')
    const cong = String((aud && aud.congregation) || '')
    const okPerson = (p) =>
      p.getString('church_id') === churchId &&
      p.getString('status') !== 'FALECIDO' &&
      p.getString('status') !== 'TRANSFERIDO' &&
      (!cong || p.getString('congregation') === cong)
    try {
      if (type === 'EVENTO') {
        const regs = $app.findRecordsByFilter(
          'church_event_registrations',
          'church_id = {:c} && event_id = {:e}',
          'name',
          3000,
          0,
          { c: churchId, e: String(aud.event_id || '') },
        )
        for (const r of regs) {
          let phone = r.getString('phone')
          if (!phone && r.getString('person_id')) {
            try {
              phone = $app.findRecordById('people', r.getString('person_id')).getString('phone')
            } catch (_) {}
          }
          push(phone, r.getString('name'))
        }
      } else if (type === 'GRUPO' || type === 'PESSOAS') {
        let ids = []
        if (type === 'GRUPO') {
          ids = $app
            .findRecordsByFilter(
              'church_group_members',
              'church_id = {:c} && group_id = {:g}',
              '',
              3000,
              0,
              { c: churchId, g: String(aud.group_id || '') },
            )
            .map((m) => m.getString('person_id'))
        } else {
          ids = Array.isArray(aud.person_ids) ? aud.person_ids.slice(0, 3000) : []
        }
        for (const id of ids) {
          try {
            const p = $app.findRecordById('people', String(id))
            if (okPerson(p)) push(p.getString('phone'), p.getString('name'))
          } catch (_) {}
        }
      } else {
        let statuses = Array.isArray(aud && aud.statuses) ? aud.statuses : []
        if (statuses.length === 0) statuses = ['MEMBRO', 'CONGREGADO']
        const people = $app.findRecordsByFilter(
          'people',
          'church_id = {:c}' + (cong ? ' && congregation = {:g}' : ''),
          'name',
          5000,
          0,
          { c: churchId, g: cong },
        )
        for (const p of people) {
          if (!okPerson(p) || statuses.indexOf(p.getString('status')) === -1) continue
          push(p.getString('phone'), p.getString('name'))
        }
      }
    } catch (_) {}
    return out
  }

  // Arte: a do aviso; no aviso de culto sem arte, a da regra; ou a capa do evento
  const mediaOf = (r) => {
    const type = r.getString('media_type')
    if (type === 'TEXTO') return null
    const own = (x) =>
      x && x.getString('media_token') && (x.getString('media') || x.getBool('use_event_cover'))
        ? x
        : null
    let src = own(r)
    if (!src && r.getString('rule_id')) {
      try {
        src = own($app.findRecordById('whatsapp_campaigns', r.getString('rule_id')))
      } catch (_) {}
    }
    if (!src || !src.getString('media_base')) return null
    let name = src.getString('media')
    if (!name) {
      try {
        name = $app
          .findRecordById('church_events', src.getString('church_event_id'))
          .getString('cover')
      } catch (_) {}
      if (!name) return null
    }
    return {
      type: type,
      url:
        src.getString('media_base') + '/backend/v1/whatsapp/media/' + src.getString('media_token'),
      name: name,
    }
  }

  // Cada pessoa do público vira uma mensagem com horário próprio, devagar e dentro da janela
  const expand = (c, media) => {
    const churchId = c.getString('church_id')
    const vars = { igreja: '', culto: '', data: '', hora: '' }
    try {
      vars.igreja = $app.findRecordById('churches', churchId).getString('name')
    } catch (_) {}
    if (c.getString('event_id')) {
      try {
        const ev = $app.findRecordById('events', c.getString('event_id'))
        vars.culto = ev.getString('title')
        vars.data = dmy(ev.getString('date'))
        vars.hora = ev.getString('start_time')
      } catch (_) {}
    }
    if (c.getString('church_event_id')) {
      try {
        const ce = $app.findRecordById('church_events', c.getString('church_event_id'))
        vars.evento = ce.getString('title')
        vars.data_evento = dmy(ce.getString('starts_on'))
        vars.local = ce.getString('location')
        vars.link_inscricao = appUrl ? appUrl + '/inscricao/' + ce.getString('public_key') : ''
      } catch (_) {}
    }
    const text = String(c.getString('text') || '')
    if (!media && !text.trim()) {
      c.set('status', 'CANCELADO')
      c.set('note', 'Sem arquivo e sem texto: nada para enviar')
      c.set('finished_at', iso(now))
      $app.save(c)
      return
    }
    const people = resolveAudience(churchId, parseJson(c.getString('audience'), {}))
    if (people.length === 0) {
      c.set('status', 'CONCLUIDO')
      c.set('total', 0)
      c.set('note', 'Ninguém do público tem celular cadastrado')
      c.set('finished_at', iso(now))
      $app.save(c)
      return
    }
    const ws = hm(c.getString('window_start'), 8 * 60)
    const we = hm(c.getString('window_end'), 20 * 60)
    const pmin = Math.max(1, c.getInt('pace_min') || 3)
    const pmax = Math.max(pmin, c.getInt('pace_max') || 5)
    let t = Math.max(now, parseDate(c.getString('starts_at')))
    let last = t
    for (const p of people) {
      t = nextSlot(t, ws, we)
      const full = p.name
      const v = Object.assign({}, vars, { nome: full, primeiro_nome: full.split(/\s+/)[0] || '' })
      const msg = new Record(msgCol)
      msg.set('church_id', churchId)
      msg.set('kind', 'AVISO')
      msg.set('campaign_id', c.id)
      msg.set('ref_id', c.id)
      msg.set('phone', p.phone)
      msg.set('name', full)
      msg.set(
        'text',
        text
          .replace(/\{(\w+)\}/g, (all, k) =>
            Object.prototype.hasOwnProperty.call(v, k) ? v[k] : all,
          )
          .replace(/\*\*([^*]+)\*\*/g, '*$1*')
          .replace(/[ \t]{2,}/g, ' ')
          .trim()
          .slice(0, 4000),
      )
      if (media) {
        msg.set('media_type', media.type)
        msg.set('media_url', media.url)
        msg.set('file_name', media.name)
      }
      msg.set('window', c.getString('window_start') + '-' + c.getString('window_end'))
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('send_after', iso(t))
      $app.save(msg)
      last = t
      t += (pmin + Math.random() * (pmax - pmin)) * 60000
    }
    c.set('status', 'ENVIANDO')
    c.set('total', people.length)
    c.set('started_at', iso(now))
    c.set('eta', iso(last))
    if (!media && c.getString('media_type') !== 'TEXTO') c.set('note', 'Saiu só o texto (sem arte)')
    $app.save(c)
  }

  // 1. Regras dos cultos: na hora marcada, abre o aviso do culto e começa
  let rules = []
  try {
    rules = $app.findRecordsByFilter(
      'whatsapp_campaigns',
      "type = 'REGRA_CULTO' && status = 'ATIVA'",
      '',
      500,
      0,
    )
  } catch (_) {}
  const until = new Date(now - BRT + 8 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  for (const rule of rules) {
    try {
      const events = $app.findRecordsByFilter(
        'events',
        "church_id = {:c} && date >= {:a} && date <= {:b} && status != 'Cancelado'",
        'date',
        60,
        0,
        { c: rule.getString('church_id'), a: today + ' 00:00:00', b: until + ' 23:59:59.999' },
      )
      for (const ev of events) {
        const day = ev.getString('date').slice(0, 10)
        if (new Date(day + 'T12:00:00Z').getUTCDay() !== rule.getInt('weekday')) continue
        const match = rule.getString('title_match').toLowerCase()
        if (match && ev.getString('title').toLowerCase().indexOf(match) === -1) continue
        const p = day.split('-').map((x) => parseInt(x, 10))
        const sendAt =
          Date.UTC(p[0], p[1] - 1, p[2] - rule.getInt('days_before')) +
          hm(rule.getString('send_time'), 10 * 60) * 60000 +
          BRT
        if (now < sendAt) continue
        let occ = null
        try {
          occ = $app.findFirstRecordByFilter(
            'whatsapp_campaigns',
            "type = 'CULTO' && rule_id = {:r} && event_id = {:e}",
            { r: rule.id, e: ev.id },
          )
        } catch (_) {}
        if (occ && occ.getString('status') !== 'AGUARDANDO') continue
        if (!occ) {
          occ = new Record(campCol)
          occ.set('church_id', rule.getString('church_id'))
          occ.set('type', 'CULTO')
          occ.set('status', 'AGUARDANDO')
          occ.set('rule_id', rule.id)
          occ.set('event_id', ev.id)
          occ.set('title', (ev.getString('title') + ' · ' + dmy(day)).slice(0, 200))
          for (const f of [
            'media_type',
            'text',
            'audience',
            'window_start',
            'window_end',
            'pace_min',
            'pace_max',
            'church_event_id',
          ]) {
            occ.set(f, rule.get(f))
          }
          occ.set('created_by', 'Automático')
          $app.save(occ)
        }
        const media = mediaOf(occ)
        if (
          !media &&
          occ.getString('media_type') !== 'TEXTO' &&
          rule.getString('missing_media') === 'ESPERAR'
        ) {
          if (occ.getString('note') !== 'Esperando a arte') {
            occ.set('note', 'Esperando a arte')
            $app.save(occ)
          }
          continue
        }
        occ.set('starts_at', iso(now))
        expand(occ, media)
      }
    } catch (err) {
      console.log('whatsapp_avisos_tick: regra ' + rule.id + ': ' + err)
    }
  }

  // 2. Avisos programados que chegaram na hora
  let due = []
  try {
    due = $app.findRecordsByFilter(
      'whatsapp_campaigns',
      "status = 'PROGRAMADO' && starts_at <= {:now}",
      'starts_at',
      20,
      0,
      { now: iso(now) },
    )
  } catch (_) {}
  for (const c of due) {
    try {
      expand(c, mediaOf(c))
    } catch (err) {
      console.log('whatsapp_avisos_tick: aviso ' + c.id + ': ' + err)
    }
  }

  // 3. Terminou de enviar? Culto passou e o aviso ficou esperando a arte?
  let open = []
  try {
    open = $app.findRecordsByFilter(
      'whatsapp_campaigns',
      "status = 'ENVIANDO' || (status = 'AGUARDANDO' && type = 'CULTO')",
      '',
      200,
      0,
    )
  } catch (_) {}
  for (const c of open) {
    try {
      if (c.getString('status') === 'ENVIANDO') {
        const left = $app.countRecords(
          'whatsapp_messages',
          $dbx.exp("campaign_id = {:c} AND (status = 'FILA' OR status = 'PAUSADO')", { c: c.id }),
        )
        if (left === 0) {
          c.set('status', 'CONCLUIDO')
          c.set('finished_at', iso(now))
          $app.save(c)
        }
        continue
      }
      let day = ''
      try {
        day = $app.findRecordById('events', c.getString('event_id')).getString('date').slice(0, 10)
      } catch (_) {}
      let ruleOk = true
      try {
        ruleOk =
          $app.findRecordById('whatsapp_campaigns', c.getString('rule_id')).getString('status') ===
          'ATIVA'
      } catch (_) {
        ruleOk = false
      }
      if (!day || day < today || !ruleOk) {
        c.set('status', 'CANCELADO')
        c.set('note', !ruleOk ? 'A regra foi desligada' : 'O culto passou sem envio')
        c.set('finished_at', iso(now))
        $app.save(c)
      }
    } catch (_) {}
  }
})
