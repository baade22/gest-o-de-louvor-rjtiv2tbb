// Membresia: importar participantes de um grupo do WhatsApp.
//
// POST /backend/v1/whatsapp/grupo-contatos { church_id, action, ... }  (chaves membresia.pessoas.*)
// - groups: grupos de que o número da igreja participa
// - participants { group_id }: compara os participantes do grupo com as fichas da Membresia
//   (já cadastrados, não cadastrados, número escondido pelo WhatsApp e fichas sem celular)
// - import { group_id, group_name, items: [{ phone, name, status, congregation, person_id }] }:
//   cria a ficha (VISITANTE ou CONGREGADO) ou põe o celular numa ficha que está sem
//
// Só lê o grupo. Não manda mensagem a ninguém.
// Como em todo hook, o handler roda isolado: os helpers ficam dentro dele.

routerAdd(
  'POST',
  '/backend/v1/whatsapp/grupo-contatos',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    const action = String(body.action || 'groups')
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
    const can = (a) => isMaster || keys.indexOf('membresia.pessoas.' + a) !== -1
    if (!can('ver')) return e.json(403, { message: 'Você não tem acesso aos membros.' })

    const GROUP_JID = /^[\d-]{5,50}@g\.us$/
    const NEW_STATUSES = ['VISITANTE', 'CONGREGADO']
    const digits = (s) => String(s || '').replace(/\D/g, '')
    // Número do WhatsApp (sempre com o código do país); celulares do Brasil sem o 9 ganham o 9
    const fullPhone = (raw) => {
      let d = digits(raw)
      if (d.indexOf('55') === 0 && d.length === 12 && /[6-9]/.test(d.charAt(4)))
        d = d.slice(0, 4) + '9' + d.slice(4)
      return d.length >= 10 && d.length <= 15 ? d : ''
    }
    // Chave para comparar: DDD + 8 últimos dígitos (ignora o 9 e o 55)
    const matchKey = (raw) => {
      let d = digits(raw)
      while (d.indexOf('0') === 0) d = d.slice(1)
      if (d.indexOf('55') === 0 && (d.length === 12 || d.length === 13)) d = d.slice(2)
      if (d.length !== 10 && d.length !== 11) return d.length >= 8 ? 'x' + d : ''
      return d.slice(0, 2) + d.slice(-8)
    }
    // Como a Membresia guarda: (81) 98888-7777; de fora do Brasil fica +código número
    const display = (full) => {
      if (full.indexOf('55') === 0 && full.length === 13)
        return '(' + full.slice(2, 4) + ') ' + full.slice(4, 9) + '-' + full.slice(9)
      if (full.indexOf('55') === 0 && full.length === 12)
        return '(' + full.slice(2, 4) + ') ' + full.slice(4, 8) + '-' + full.slice(8)
      return '+' + full
    }

    const apiUrl = String($os.getenv('WHATSAPP_API_URL') || '')
      .replace(/\s+/g, '')
      .replace(/\/+$/, '')
    const apiKey = String($os.getenv('WHATSAPP_API_KEY') || '').trim()
    let inst = ''
    let ownPhone = ''
    try {
      const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
        c: churchId,
      })
      inst = st.getString('instance')
      ownPhone = st.getString('phone')
    } catch (_) {}
    const evo = (path) => {
      if (!apiUrl || !apiKey)
        return {
          error: e.json(400, { message: 'O WhatsApp ainda não foi configurado no servidor.' }),
        }
      if (!inst)
        return { error: e.json(400, { message: 'Conecte o WhatsApp da igreja primeiro.' }) }
      let res = null
      try {
        res = $http.send({
          url: apiUrl + path.replace('{inst}', encodeURIComponent(inst)),
          method: 'GET',
          headers: { apikey: apiKey },
          timeout: 60,
        })
      } catch (_) {
        return { error: e.json(502, { message: 'Não consegui falar com o servidor do WhatsApp.' }) }
      }
      if (res.statusCode < 200 || res.statusCode >= 300)
        return {
          error: e.json(502, {
            message:
              'O WhatsApp não respondeu (código ' +
              res.statusCode +
              '). Confira se ele está conectado e se o número está no grupo.',
          }),
        }
      let data = null
      try {
        data = res.json
      } catch (_) {}
      return { data: data }
    }

    // Fichas da igreja indexadas pela chave do celular
    const loadPeople = () => {
      const rows = $app.findRecordsByFilter('people', 'church_id = {:c}', 'name', 10000, 0, {
        c: churchId,
      })
      const byKey = {}
      const noPhone = []
      for (const p of rows) {
        const k = matchKey(p.getString('phone'))
        if (k) {
          if (!byKey[k]) byKey[k] = p
        } else {
          const st = p.getString('status')
          if (st !== 'FALECIDO' && st !== 'TRANSFERIDO')
            noPhone.push({ id: p.id, name: p.getString('name'), status: st })
        }
      }
      return { byKey: byKey, noPhone: noPhone }
    }

    // Participantes com número visível (o resto o WhatsApp esconde atrás de um código @lid)
    const readParticipants = (groupId) => {
      const r = evo('/group/participants/{inst}?groupJid=' + encodeURIComponent(groupId))
      if (r.error) return r
      const list = (r.data && Array.isArray(r.data.participants) && r.data.participants) || []
      const own = matchKey(ownPhone)
      const seen = {}
      const out = []
      let hidden = 0
      for (const p of list) {
        const id = String((p && p.id) || '')
        let raw = ''
        if (id.indexOf('@s.whatsapp.net') !== -1) raw = id.split('@')[0]
        else if (p && p.phoneNumber) raw = String(p.phoneNumber).split('@')[0]
        const full = fullPhone(raw.split(':')[0])
        if (!full) {
          hidden++
          continue
        }
        const k = matchKey(full)
        if (!k || seen[k] || (own && k === own)) continue
        seen[k] = true
        out.push({
          phone: full,
          key: k,
          display: display(full),
          wa_name: String((p && (p.name || p.notify || p.verifiedName)) || '')
            .trim()
            .slice(0, 120),
          admin: !!(p && p.admin),
        })
      }
      return { total: list.length, hidden: hidden, list: out }
    }

    if (action === 'groups') {
      const r = evo('/group/fetchAllGroups/{inst}?getParticipants=false')
      if (r.error) return r.error
      const items = []
      for (const g of Array.isArray(r.data) ? r.data : []) {
        const id = String((g && (g.id || g.jid)) || '')
        if (!GROUP_JID.test(id)) continue
        items.push({
          id: id,
          name: String((g && g.subject) || 'Grupo sem nome').slice(0, 100),
          size: (g && g.size) || 0,
        })
      }
      items.sort((a, b) => a.name.localeCompare(b.name))
      return e.json(200, {
        items: items.slice(0, 500),
        can: { novo: can('novo'), alterar: can('alterar') },
      })
    }

    if (action === 'participants') {
      const groupId = String(body.group_id || '')
      if (!GROUP_JID.test(groupId)) return e.json(400, { message: 'Escolha um grupo.' })
      const r = readParticipants(groupId)
      if (r.error) return r.error
      const pp = loadPeople()
      const registered = []
      const unregistered = []
      for (const p of r.list) {
        const found = pp.byKey[p.key]
        if (found)
          registered.push({
            phone: p.display,
            wa_name: p.wa_name,
            person_id: found.id,
            name: found.getString('name'),
            status: found.getString('status'),
          })
        else unregistered.push({ phone: p.display, wa_name: p.wa_name, admin: p.admin })
      }
      registered.sort((a, b) => a.name.localeCompare(b.name))
      unregistered.sort((a, b) => (a.wa_name || 'zz').localeCompare(b.wa_name || 'zz'))
      return e.json(200, {
        total: r.total,
        hidden: r.hidden,
        registered: registered,
        unregistered: unregistered,
        no_phone_people: pp.noPhone,
        can: { novo: can('novo'), alterar: can('alterar') },
      })
    }

    if (action === 'import') {
      const groupId = String(body.group_id || '')
      if (!GROUP_JID.test(groupId)) return e.json(400, { message: 'Escolha um grupo.' })
      const items = Array.isArray(body.items) ? body.items.slice(0, 1000) : []
      if (!items.length) return e.json(400, { message: 'Marque quem você quer importar.' })
      const groupName = String(body.group_name || 'grupo')
        .trim()
        .slice(0, 100)

      // Só aceita números que estão mesmo no grupo agora
      const r = readParticipants(groupId)
      if (r.error) return r.error
      const inGroup = {}
      for (const p of r.list) inGroup[p.key] = p
      const pp = loadPeople()

      const today = new Date().toISOString().slice(0, 10) + ' 12:00:00.000Z'
      const note =
        'Celular importado do grupo "' +
        groupName +
        '" do WhatsApp em ' +
        today.slice(8, 10) +
        '/' +
        today.slice(5, 7) +
        '/' +
        today.slice(0, 4) +
        '.'
      const eventsCol = (() => {
        try {
          return $app.findCollectionByNameOrId('people_events')
        } catch (_) {
          return null
        }
      })()
      const logEvent = (personId, title) => {
        if (!eventsCol) return
        try {
          const ev = new Record(eventsCol)
          ev.set('church_id', churchId)
          ev.set('person_id', personId)
          ev.set('kind', 'CONTATO')
          ev.set('date', today)
          ev.set('title', title)
          ev.set('description', note)
          ev.set('created_by', auth.id)
          $app.save(ev)
        } catch (_) {}
      }

      let created = 0
      let linked = 0
      const skipped = []
      let peopleCol = null
      for (const it of items) {
        const k = matchKey(it && it.phone)
        const p = k ? inGroup[k] : null
        const label = String((it && (it.name || it.phone)) || '?').slice(0, 80)
        if (!p) {
          skipped.push({ name: label, reason: 'não está mais no grupo' })
          continue
        }
        if (pp.byKey[k]) {
          skipped.push({ name: label, reason: 'já tem ficha com este celular' })
          continue
        }
        const personId = String((it && it.person_id) || '')
        if (personId) {
          if (!can('alterar')) {
            skipped.push({ name: label, reason: 'seu perfil não permite alterar fichas' })
            continue
          }
          let person = null
          try {
            person = $app.findRecordById('people', personId)
          } catch (_) {}
          if (!person || person.getString('church_id') !== churchId) {
            skipped.push({ name: label, reason: 'ficha não encontrada' })
            continue
          }
          if (matchKey(person.getString('phone'))) {
            skipped.push({ name: person.getString('name'), reason: 'a ficha já tem celular' })
            continue
          }
          person.set('phone', p.display)
          $app.save(person)
          pp.byKey[k] = person
          logEvent(person.id, 'Celular vindo do grupo do WhatsApp')
          linked++
          continue
        }
        if (!can('novo')) {
          skipped.push({ name: label, reason: 'seu perfil não permite criar fichas' })
          continue
        }
        const name = String((it && it.name) || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200)
        if (name.length < 2) {
          skipped.push({ name: p.display, reason: 'falta o nome' })
          continue
        }
        const status =
          NEW_STATUSES.indexOf(String(it.status)) !== -1 ? String(it.status) : 'VISITANTE'
        if (!peopleCol) peopleCol = $app.findCollectionByNameOrId('people')
        const person = new Record(peopleCol)
        person.set('church_id', churchId)
        person.set('name', name)
        person.set('phone', p.display)
        person.set('status', status)
        person.set('is_active', true)
        const cong = String((it && it.congregation) || '')
          .trim()
          .slice(0, 100)
        if (cong) person.set('congregation', cong)
        person.set('notes', note)
        $app.save(person)
        pp.byKey[k] = person
        logEvent(person.id, 'Entrou pelo grupo do WhatsApp')
        created++
      }
      return e.json(200, { created: created, linked: linked, skipped: skipped })
    }

    return e.json(400, { message: 'Ação desconhecida' })
  },
  $apis.requireAuth(),
)
