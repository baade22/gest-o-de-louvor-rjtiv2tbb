// Site e App da igreja: rotas públicas, sem login (migração 0098).
//
// GET  /backend/v1/public/site?slug=            tudo da página inicial e das abas do app
// GET  /backend/v1/public/site/page?slug=&page= uma página (Quem somos, Ministérios...)
// GET  /backend/v1/public/site/videos?slug=     últimos vídeos do canal do YouTube (feed público)
// GET  /backend/v1/public/site/manifest?slug=   manifest do app (nome, cores e ícone da igreja)
// POST /backend/v1/public/site/prayer           pedido de oração ou "fale conosco"
//
// Só responde para site publicado. "slug" vazio = o primeiro site publicado (a igreja principal).
// Nunca devolve dado de pessoa: nada de membros, inscritos, escalas, valores ou saldos. A agenda
// leva só cultos (nome, dia e hora) e eventos marcados "mostrar no site". Limite geral das
// rotas /backend/v1/public/ (0064) e limite próprio do envio de pedidos (0098).
//
// Como em todo hook, cada handler roda isolado: os helpers ficam dentro de cada um.

routerAdd('GET', '/backend/v1/public/site', (e) => {
  const q = e.requestInfo().query || {}
  const slug = String(q.slug || '')
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
  const BRT = 3 * 3600 * 1000
  const today = new Date(Date.now() - BRT).toISOString().slice(0, 10)
  const day = (r, f) => r.getString(f).slice(0, 10)
  const inWindow = (r) => {
    const a = day(r, 'starts_on')
    const b = day(r, 'ends_on')
    return (!a || a <= today) && (!b || b >= today)
  }
  const fileUrl = (col, r, f) => {
    const name = r.getString(f)
    return name ? '/api/files/' + col + '/' + r.id + '/' + name : ''
  }
  const json = (r, f, def) => {
    try {
      const v = JSON.parse(r.getString(f) || 'null')
      return v == null ? def : v
    } catch (_) {
      return def
    }
  }
  const sections = Object.assign(
    {
      agenda: true,
      cultos: true,
      assistir: true,
      contribuir: true,
      oracao: true,
      avisos: true,
      novo: true,
    },
    json(site, 'sections', {}),
  )

  let churchName = ''
  try {
    churchName = $app.findRecordById('churches', churchId).getString('name')
  } catch (_) {}

  // Eventos visíveis no site (também usados pelos banners que apontam para um evento)
  const eventLinks = {}
  const agenda = []
  let churchEvents = []
  try {
    churchEvents = $app.findRecordsByFilter(
      'church_events',
      "church_id = {:c} && show_on_site = true && public_key != '' && closed_at = ''",
      'starts_on',
      100,
      0,
      { c: churchId },
    )
  } catch (_) {}
  for (const ev of churchEvents) {
    const start = day(ev, 'starts_on')
    const end = day(ev, 'ends_on') || start
    if (!start || end < today) continue
    const deadline = day(ev, 'registration_deadline')
    const open =
      ev.getBool('registration_open') &&
      !ev.getBool('publish_only') &&
      (!deadline || deadline >= today)
    const url = '/inscricao/' + ev.getString('public_key')
    eventLinks[ev.id] = url
    if (!sections.agenda) continue
    const price = ev.getFloat('price')
    agenda.push({
      kind: 'EVENTO',
      id: ev.id,
      title: ev.getString('title'),
      date: start,
      end_date: end !== start ? end : '',
      time: ev.getString('start_time'),
      location: ev.getString('location'),
      description: ev.getString('description').slice(0, 600),
      cover_url: fileUrl('church_events', ev, 'cover'),
      color: ev.getString('color'),
      url: url,
      signup_open: open,
      price: ev.getBool('hide_price') || !(price > 0) ? null : price,
    })
  }

  // Cultos da agenda do louvor: só nome, dia e hora (sem escala, sem repertório)
  if (sections.agenda && sections.cultos) {
    const until = new Date(Date.now() - BRT + 45 * 86400000).toISOString().slice(0, 10)
    let services = []
    try {
      services = $app.findRecordsByFilter(
        'events',
        "church_id = {:c} && date >= {:a} && date <= {:b} && status != 'Cancelado'",
        'date',
        60,
        0,
        { c: churchId, a: today + ' 00:00:00.000Z', b: until + ' 23:59:59.999Z' },
      )
    } catch (_) {}
    for (const sv of services) {
      const title = sv.getString('title')
      if (/ensaio|reuni[aã]o|passagem/i.test(title)) continue
      agenda.push({
        kind: 'CULTO',
        id: sv.id,
        title: title,
        date: day(sv, 'date'),
        end_date: '',
        time: sv.getString('start_time'),
        location: '',
        description: '',
        cover_url: '',
        color: '',
        url: '',
        signup_open: false,
        price: null,
      })
    }
  }
  agenda.sort((a, b) =>
    a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0,
  )

  const highlights = []
  try {
    const rows = $app.findRecordsByFilter(
      'site_highlights',
      'church_id = {:c} && active = true',
      'order,created',
      20,
      0,
      { c: churchId },
    )
    for (const h of rows) {
      if (!inWindow(h)) continue
      const evId = h.getString('church_event_id')
      let link = h.getString('link')
      if (evId) {
        if (!eventLinks[evId]) continue // evento saiu do site: o banner sai junto
        link = eventLinks[evId]
      }
      highlights.push({
        id: h.id,
        title: h.getString('title'),
        subtitle: h.getString('subtitle'),
        image_url: fileUrl('site_highlights', h, 'image'),
        button_label: h.getString('button_label'),
        link: link,
      })
    }
  } catch (_) {}

  const notices = []
  if (sections.avisos) {
    try {
      const rows = $app.findRecordsByFilter(
        'site_notices',
        'church_id = {:c} && active = true',
        'order,-created',
        20,
        0,
        { c: churchId },
      )
      for (const n of rows) {
        if (!inWindow(n)) continue
        notices.push({ id: n.id, title: n.getString('title'), body: n.getString('body') })
      }
    } catch (_) {}
  }

  const pages = []
  try {
    const rows = $app.findRecordsByFilter(
      'site_pages',
      'church_id = {:c} && active = true',
      'order,title',
      30,
      0,
      { c: churchId },
    )
    for (const p of rows) pages.push({ title: p.getString('title'), slug: p.getString('slug') })
  } catch (_) {}

  let pix = null
  const campaigns = []
  if (sections.contribuir) {
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
    try {
      const rows = $app.findRecordsByFilter(
        'fin_campaigns',
        "church_id = {:c} && is_public = true && status = 'ATIVA'",
        'name',
        20,
        0,
        { c: churchId },
      )
      for (const c of rows) {
        // Só nome e descrição: nada de meta, valores ou quantas pessoas
        campaigns.push({
          id: c.id,
          name: c.getString('name'),
          description: c.getString('description').slice(0, 300),
          color: c.getString('color'),
          end_date: day(c, 'end_date'),
        })
      }
    } catch (_) {}
  }

  let signupUrl = ''
  const linkId = site.getString('signup_link_id')
  if (sections.novo && linkId) {
    try {
      const l = $app.findRecordById('people_signup_links', linkId)
      if (l.getBool('active') && l.getString('church_id') === churchId) {
        signupUrl = '/cadastro/' + l.getString('key')
      }
    } catch (_) {}
  }

  const times = json(site, 'service_times', [])
  return e.json(200, {
    slug: site.getString('slug'),
    church_name: churchName,
    title: site.getString('title') || churchName,
    short_name: site.getString('short_name'),
    tagline: site.getString('tagline'),
    about: site.getString('about'),
    primary_color: site.getString('primary_color'),
    accent_color: site.getString('accent_color'),
    logo_url: fileUrl('site_settings', site, 'logo'),
    icon_url: fileUrl('site_settings', site, 'app_icon'),
    address: site.getString('address'),
    maps_url: site.getString('maps_url'),
    phone: site.getString('phone'),
    whatsapp: site.getString('whatsapp'),
    email: site.getString('email'),
    instagram: site.getString('instagram'),
    facebook: site.getString('facebook'),
    youtube: site.getString('youtube'),
    footer_text: site.getString('footer_text'),
    service_times: Array.isArray(times) ? times.slice(0, 20) : [],
    sections: sections,
    highlights: highlights,
    notices: notices,
    pages: pages,
    agenda: agenda.slice(0, 40),
    campaigns: campaigns,
    pix: pix,
    signup_url: signupUrl,
  })
})

routerAdd('GET', '/backend/v1/public/site/page', (e) => {
  const q = e.requestInfo().query || {}
  const slug = String(q.slug || '')
    .trim()
    .toLowerCase()
  const page = String(q.page || '')
    .trim()
    .toLowerCase()
  const notFound = () => e.json(404, { message: 'Página não encontrada.' })
  if ((slug && !/^[a-z0-9-]{1,40}$/.test(slug)) || !/^[a-z0-9-]{1,80}$/.test(page))
    return notFound()
  let site = null
  try {
    const list = slug
      ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
          s: slug,
        })
      : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
    site = list.length ? list[0] : null
  } catch (_) {}
  if (!site) return notFound()
  try {
    const p = $app.findFirstRecordByFilter(
      'site_pages',
      'church_id = {:c} && slug = {:p} && active = true',
      { c: site.getString('church_id'), p: page },
    )
    return e.json(200, {
      title: p.getString('title'),
      slug: p.getString('slug'),
      body: p.getString('body'),
    })
  } catch (_) {
    return notFound()
  }
})

routerAdd('GET', '/backend/v1/public/site/videos', (e) => {
  const q = e.requestInfo().query || {}
  const slug = String(q.slug || '')
    .trim()
    .toLowerCase()
  if (slug && !/^[a-z0-9-]{1,40}$/.test(slug)) return e.json(404, { items: [] })
  let site = null
  try {
    const list = slug
      ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
          s: slug,
        })
      : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
    site = list.length ? list[0] : null
  } catch (_) {}
  if (!site) return e.json(404, { items: [] })

  const bodyText = (res) => {
    try {
      if (res.body) return toString(res.body)
    } catch (_) {}
    try {
      return String(res.raw || '')
    } catch (_) {
      return ''
    }
  }
  const store = (() => {
    try {
      return $app.store()
    } catch (_) {
      return null
    }
  })()
  const cacheKey = 'site_videos_' + site.id + '_' + site.getString('updated')
  if (store) {
    try {
      const hit = store.get(cacheKey)
      if (hit && Date.now() - hit.at < 10 * 60000) return e.json(200, hit.data)
    } catch (_) {}
  }

  // Canal: o id (UC...) cadastrado ou, se só tiver o @ do canal, descobre o id na página dele
  let channel = site.getString('youtube_channel_id')
  const handle = (() => {
    const m = /@([A-Za-z0-9._-]{3,100})/.exec(site.getString('youtube'))
    return m ? m[1] : ''
  })()
  if (!channel) {
    const m = /channel\/(UC[A-Za-z0-9_-]{22})/.exec(site.getString('youtube'))
    if (m) channel = m[1]
  }
  if (!channel && handle) {
    try {
      const res = $http.send({
        url: 'https://www.youtube.com/@' + encodeURIComponent(handle),
        method: 'GET',
        headers: { 'Accept-Language': 'pt-BR' },
        timeout: 10,
      })
      const html = bodyText(res)
      const m =
        /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html) ||
        /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(
          html,
        ) ||
        /"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)
      if (m) channel = m[1]
    } catch (_) {}
  }
  const liveUrl = channel
    ? 'https://www.youtube.com/channel/' + channel + '/live'
    : handle
      ? 'https://www.youtube.com/@' + handle + '/live'
      : ''
  const channelUrl = channel
    ? 'https://www.youtube.com/channel/' + channel
    : handle
      ? 'https://www.youtube.com/@' + handle
      : ''
  if (!channel)
    return e.json(200, { items: [], live: null, live_url: liveUrl, channel_url: channelUrl })

  // As abas "Ao vivo" (cultos transmitidos) e "Vídeos" do canal trazem a lista na própria página
  // (ytInitialData). O feed RSS do YouTube fica de reserva (em 2026 respondia 404).
  const unjson = (s) => {
    try {
      return JSON.parse('"' + s + '"')
    } catch (_) {
      return s
    }
  }
  const items = []
  const seen = {}
  let live = null
  const scrape = (tab, kind) => {
    try {
      const res = $http.send({
        url: 'https://www.youtube.com/channel/' + channel + '/' + tab,
        method: 'GET',
        headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' },
        timeout: 12,
      })
      if (res.statusCode !== 200) return
      const parts = bodyText(res).split('"richItemRenderer":').slice(1)
      for (let i = 0; i < parts.length && i < 30; i++) {
        const p = parts[i].slice(0, 12000)
        const id = (/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\//.exec(p) || [])[1]
        if (!id || seen[id]) continue
        const title = (/"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/.exec(
          p,
        ) || [])[1]
        if (!title) continue
        const badge = (/"thumbnailBadgeViewModel":\{"text":"([^"]*)"/.exec(p) || [])[1] || ''
        const isLive = /BADGE_STYLE_LIVE/.test(p) || /^(AO VIVO|LIVE)$/i.test(badge)
        const upcoming = /UPCOMING|Agendado|Programado/i.test(p.slice(0, 4000)) && !badge
        if (upcoming) continue
        const texts = []
        const re = /"text":\{"content":"([^"]*)"/g
        let m
        while ((m = re.exec(p)) && texts.length < 4) texts.push(unjson(m[1]))
        const when = texts.filter((t) => /há|ago|Transmitido|Streamed/i.test(t))[0] || ''
        seen[id] = true
        const item = {
          id: id,
          title: unjson(title),
          duration: isLive ? '' : badge,
          when: when,
          kind: kind,
          live: isLive,
        }
        if (isLive && !live) live = item
        items.push(item)
      }
    } catch (_) {}
  }
  scrape('streams', 'CULTO')
  if (items.length < 12) scrape('videos', 'VIDEO')
  if (!items.length) {
    const decode = (s) =>
      String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
    try {
      const res = $http.send({
        url: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channel,
        method: 'GET',
        timeout: 10,
      })
      if (res.statusCode === 200) {
        const entries = bodyText(res).split('<entry>').slice(1)
        for (const en of entries) {
          const id = (/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/.exec(en) || [])[1]
          if (!id) continue
          items.push({
            id: id,
            title: decode((/<title>([\s\S]*?)<\/title>/.exec(en) || [])[1]),
            duration: '',
            when: ((/<published>([^<]+)<\/published>/.exec(en) || [])[1] || '').slice(0, 10),
            kind: 'VIDEO',
            live: false,
          })
          if (items.length >= 15) break
        }
      }
    } catch (_) {}
  }
  const data = { items: items.slice(0, 24), live: live, live_url: liveUrl, channel_url: channelUrl }
  if (store && items.length) {
    try {
      store.set(cacheKey, { at: Date.now(), data: data })
    } catch (_) {}
  }
  return e.json(200, data)
})

routerAdd('GET', '/backend/v1/public/site/manifest', (e) => {
  const q = e.requestInfo().query || {}
  const slug = String(q.slug || '')
    .trim()
    .toLowerCase()
  if (slug && !/^[a-z0-9-]{1,40}$/.test(slug)) return e.json(404, {})
  let site = null
  try {
    const list = slug
      ? $app.findRecordsByFilter('site_settings', 'published = true && slug = {:s}', '', 1, 0, {
          s: slug,
        })
      : $app.findRecordsByFilter('site_settings', 'published = true', 'created', 1, 0)
    site = list.length ? list[0] : null
  } catch (_) {}
  if (!site) return e.json(404, {})
  let churchName = ''
  try {
    churchName = $app.findRecordById('churches', site.getString('church_id')).getString('name')
  } catch (_) {}
  // O endereço do app (start_url) precisa ser do mesmo site que abriu: vem do navegador
  let origin = String(q.origin || '')
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin)) origin = ''
  const base = (origin || '') + '/igreja' + (slug ? '?s=' + slug : '')
  const icon = site.getString('app_icon')
  const iconUrl = icon
    ? String($app.settings().meta.appURL || '').replace(/\/$/, '') +
      '/api/files/site_settings/' +
      site.id +
      '/' +
      icon
    : ''
  const icons = iconUrl
    ? [
        { src: iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: iconUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
      ]
    : [
        { src: (origin || '') + '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: (origin || '') + '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ]
  const title = site.getString('title') || churchName || 'Igreja'
  e.response.header().set('Content-Type', 'application/manifest+json; charset=utf-8')
  return e.json(200, {
    name: title,
    short_name: site.getString('short_name') || title.slice(0, 12),
    description: site.getString('tagline') || title,
    lang: 'pt-BR',
    start_url: base,
    scope: (origin || '') + '/igreja',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: site.getString('primary_color') || '#14213d',
    icons: icons,
  })
})

routerAdd('POST', '/backend/v1/public/site/prayer', (e) => {
  const body = e.requestInfo().body || {}
  const text = (v, max) =>
    String(v == null ? '' : v)
      .trim()
      .slice(0, max)
  // Campo invisível no formulário: robôs preenchem, pessoas não
  if (text(body.website, 200) !== '') return e.json(200, { ok: true })

  const slug = text(body.slug, 40).toLowerCase()
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
  let sections = {}
  try {
    sections = JSON.parse(site.getString('sections') || '{}') || {}
  } catch (_) {}
  if (sections.oracao === false) return e.json(404, { message: 'Envio desligado.' })

  const kind = body.kind === 'CONTATO' ? 'CONTATO' : 'ORACAO'
  const name = text(body.name, 120).replace(/\s+/g, ' ')
  const contact = text(body.contact, 120)
  const message = text(body.message, 3000)
  const wants = body.wants_contact === true
  if (message.length < 3) return e.json(400, { message: 'Escreva a sua mensagem.' })
  if (
    (wants || kind === 'CONTATO') &&
    contact.replace(/\D/g, '').length < 8 &&
    contact.indexOf('@') === -1
  )
    return e.json(400, { message: 'Informe um WhatsApp ou e-mail para a resposta.' })
  if (body.consent !== true)
    return e.json(400, { message: 'É preciso concordar com o uso dos dados só para este pedido.' })

  try {
    const col = $app.findCollectionByNameOrId('site_prayer_requests')
    const rec = new Record(col)
    rec.set('church_id', site.getString('church_id'))
    rec.set('kind', kind)
    rec.set('name', name)
    rec.set('contact', contact)
    rec.set('wants_contact', wants || kind === 'CONTATO')
    rec.set('message', message)
    rec.set('status', 'NOVO')
    rec.set('consent_at', new Date().toISOString().replace('T', ' '))
    $app.save(rec)
  } catch (err) {
    return e.json(500, { message: 'Não foi possível enviar agora. Tente de novo em instantes.' })
  }
  return e.json(200, { ok: true })
})
