// Contatos e listas de números dos Avisos (migração 0102).
//
// POST /backend/v1/whatsapp/contatos { church_id, action, ... }  (chaves culto.avisos.*)
// - overview: listas (com quantos números) e contatos
// - group_preview { group_id }: participantes de um grupo do WhatsApp, marcando quem já está
//   na base
// - import { group_id, group_name, items: [{ phone, name }], list_ids, new_list }: guarda os
//   números escolhidos do grupo (só os que ainda estão nele) e põe nas listas
// - save_contact { id?, phone, name, note, lists }: novo número digitado ou edição
// - delete_contacts { ids }
// - save_list { id?, name, description } / delete_list { id }
// - set_list { list_id, contact_ids, on }: põe ou tira vários números de uma lista
//
// Os números não viram fichas da Membresia. O aviso usa as listas pelo público LISTAS
// (whatsapp_avisos.js). Como em todo hook, o handler roda isolado: helpers ficam dentro dele.

routerAdd(
  'POST',
  '/backend/v1/whatsapp/contatos',
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
    const deny = () => e.json(403, { message: 'Seu perfil não permite esta ação nos contatos.' })
    const canEdit = can('novo') || can('alterar')

    const GROUP_JID = /^[\d-]{5,50}@g\.us$/
    const digits = (s) => String(s || '').replace(/\D/g, '')
    // Número digitado: tira zeros da frente; com DDD e sem país ganha o 55
    const typedPhone = (raw) => {
      let d = digits(raw)
      while (d.indexOf('0') === 0) d = d.slice(1)
      if (d.length === 10 || d.length === 11) d = '55' + d
      return d.length >= 11 && d.length <= 15 ? d : ''
    }
    // Chave para não repetir: no Brasil DDD + 8 últimos dígitos (com ou sem o 9)
    const keyOf = (d) =>
      d.indexOf('55') === 0 && (d.length === 12 || d.length === 13)
        ? d.slice(2, 4) + d.slice(-8)
        : d
    const display = (d) => {
      if (d.indexOf('55') === 0 && d.length === 13)
        return '(' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9)
      if (d.indexOf('55') === 0 && d.length === 12)
        return '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8)
      return '+' + d
    }
    const cleanName = (s, max) =>
      String(s || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    const listsOf = (r) => {
      try {
        return r.getStringSlice('lists') || []
      } catch (_) {
        const v = r.get('lists')
        return Array.isArray(v) ? v.map(String) : []
      }
    }

    const loadLists = () =>
      $app.findRecordsByFilter('whatsapp_lists', 'church_id = {:c}', 'name', 500, 0, {
        c: churchId,
      })
    const loadContacts = () =>
      $app.findRecordsByFilter('whatsapp_contacts', 'church_id = {:c}', 'name', 10000, 0, {
        c: churchId,
      })
    const ownLists = (ids) => {
      const mine = {}
      for (const l of loadLists()) mine[l.id] = true
      const out = []
      for (const id of Array.isArray(ids) ? ids : []) {
        const s = String(id || '')
        if (mine[s] && out.indexOf(s) === -1) out.push(s)
      }
      return out
    }
    const findContact = (id) => {
      try {
        const r = $app.findRecordById('whatsapp_contacts', String(id || ''))
        return r.getString('church_id') === churchId ? r : null
      } catch (_) {
        return null
      }
    }
    const findList = (id) => {
      try {
        const r = $app.findRecordById('whatsapp_lists', String(id || ''))
        return r.getString('church_id') === churchId ? r : null
      } catch (_) {
        return null
      }
    }
    const serContact = (r) => ({
      id: r.id,
      phone: r.getString('phone'),
      display: display(r.getString('phone')),
      name: r.getString('name'),
      note: r.getString('note'),
      origin: r.getString('origin'),
      lists: listsOf(r),
    })
    const serList = (r, count) => ({
      id: r.id,
      name: r.getString('name'),
      description: r.getString('description'),
      count: count || 0,
    })

    // Participantes do grupo com número visível (lidos direto da Evolution)
    const readGroup = (groupId) => {
      const apiUrl = String($os.getenv('WHATSAPP_API_URL') || '')
        .replace(/\s+/g, '')
        .replace(/\/+$/, '')
      const apiKey = String($os.getenv('WHATSAPP_API_KEY') || '').trim()
      let inst = ''
      let own = ''
      try {
        const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
          c: churchId,
        })
        inst = st.getString('instance')
        own = digits(st.getString('phone'))
      } catch (_) {}
      if (!apiUrl || !apiKey)
        return {
          error: e.json(400, { message: 'O WhatsApp ainda não foi configurado no servidor.' }),
        }
      if (!inst)
        return { error: e.json(400, { message: 'Conecte o WhatsApp da igreja primeiro.' }) }
      let res = null
      try {
        res = $http.send({
          url:
            apiUrl +
            '/group/participants/' +
            encodeURIComponent(inst) +
            '?groupJid=' +
            encodeURIComponent(groupId),
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
              'O WhatsApp não devolveu os participantes (código ' +
              res.statusCode +
              '). Confira se ele está conectado e se o número está no grupo.',
          }),
        }
      let parts = []
      try {
        parts = (res.json && res.json.participants) || []
      } catch (_) {}
      const seen = {}
      if (own) seen[keyOf(own)] = true
      const list = []
      let hidden = 0
      for (const p of Array.isArray(parts) ? parts : []) {
        const id = String((p && p.id) || '')
        let raw = ''
        if (id.indexOf('@s.whatsapp.net') !== -1) raw = id
        else if (p && p.phoneNumber) raw = String(p.phoneNumber)
        const d = digits(raw.split('@')[0].split(':')[0])
        if (d.length < 10 || d.length > 15) {
          hidden++
          continue
        }
        const k = keyOf(d)
        if (seen[k]) continue
        seen[k] = true
        list.push({
          phone: d,
          key: k,
          wa_name: cleanName(p && p.name, 120),
          admin: !!(p && p.admin),
        })
      }
      return { total: parts.length, hidden: hidden, list: list }
    }

    if (action === 'overview') {
      const contacts = loadContacts()
      const counts = {}
      const items = contacts.map((r) => {
        const c = serContact(r)
        for (const l of c.lists) counts[l] = (counts[l] || 0) + 1
        return c
      })
      return e.json(200, {
        lists: loadLists().map((l) => serList(l, counts[l.id])),
        contacts: items,
        can: { novo: can('novo'), alterar: can('alterar'), excluir: can('excluir') },
      })
    }

    if (action === 'group_preview') {
      const groupId = String(body.group_id || '')
      if (!GROUP_JID.test(groupId)) return e.json(400, { message: 'Escolha um grupo.' })
      const g = readGroup(groupId)
      if (g.error) return g.error
      const byKey = {}
      for (const c of loadContacts()) byKey[c.getString('phone_key')] = c
      return e.json(200, {
        total: g.total,
        hidden: g.hidden,
        items: g.list.map((p) => {
          const c = byKey[p.key]
          return {
            phone: p.phone,
            display: display(p.phone),
            wa_name: p.wa_name,
            admin: p.admin,
            contact_id: c ? c.id : '',
            name: c ? c.getString('name') : '',
            lists: c ? listsOf(c) : [],
          }
        }),
      })
    }

    if (action === 'import') {
      if (!canEdit) return deny()
      const groupId = String(body.group_id || '')
      if (!GROUP_JID.test(groupId)) return e.json(400, { message: 'Escolha um grupo.' })
      const items = Array.isArray(body.items) ? body.items.slice(0, 3000) : []
      if (!items.length) return e.json(400, { message: 'Marque os números que quer carregar.' })
      const g = readGroup(groupId)
      if (g.error) return g.error
      const inGroup = {}
      for (const p of g.list) inGroup[p.key] = p

      let listIds = ownLists(body.list_ids)
      const newList = cleanName(body.new_list, 100)
      if (newList) {
        if (!can('novo')) return deny()
        const l = new Record($app.findCollectionByNameOrId('whatsapp_lists'))
        l.set('church_id', churchId)
        l.set('name', newList)
        $app.save(l)
        listIds = listIds.concat([l.id])
      }

      const byKey = {}
      for (const c of loadContacts()) byKey[c.getString('phone_key')] = c
      const groupName = cleanName(body.group_name, 100) || 'grupo'
      const col = $app.findCollectionByNameOrId('whatsapp_contacts')
      let created = 0
      let updated = 0
      let skipped = 0
      for (const it of items) {
        const k = keyOf(digits(it && it.phone))
        const p = inGroup[k]
        if (!p) {
          skipped++
          continue
        }
        const name = cleanName(it && it.name, 120) || p.wa_name
        let c = byKey[k]
        if (c) {
          if (!can('alterar')) {
            skipped++
            continue
          }
          const cur = listsOf(c)
          for (const l of listIds) if (cur.indexOf(l) === -1) cur.push(l)
          c.set('lists', cur)
          if (name && !c.getString('name')) c.set('name', name)
          $app.save(c)
          updated++
          continue
        }
        if (!can('novo')) {
          skipped++
          continue
        }
        c = new Record(col)
        c.set('church_id', churchId)
        c.set('phone', p.phone)
        c.set('phone_key', k)
        c.set('name', name)
        c.set('origin', 'Grupo ' + groupName)
        c.set('lists', listIds)
        $app.save(c)
        byKey[k] = c
        created++
      }
      return e.json(200, { created: created, updated: updated, skipped: skipped })
    }

    if (action === 'save_contact') {
      const id = String(body.id || '')
      let c = null
      if (id) {
        if (!can('alterar')) return deny()
        c = findContact(id)
        if (!c) return e.json(404, { message: 'Contato não encontrado.' })
      } else if (!can('novo')) return deny()
      const phone = typedPhone(body.phone)
      if (!phone) return e.json(400, { message: 'Número inválido. Use DDD + número.' })
      const k = keyOf(phone)
      try {
        const other = $app.findFirstRecordByFilter(
          'whatsapp_contacts',
          'church_id = {:c} && phone_key = {:k}',
          { c: churchId, k: k },
        )
        if (other && other.id !== id)
          return e.json(400, {
            message:
              'Esse número já está na base' +
              (other.getString('name') ? ' como ' + other.getString('name') : '') +
              '.',
          })
      } catch (_) {}
      if (!c) {
        c = new Record($app.findCollectionByNameOrId('whatsapp_contacts'))
        c.set('church_id', churchId)
        c.set('origin', 'Digitado')
      }
      c.set('phone', phone)
      c.set('phone_key', k)
      c.set('name', cleanName(body.name, 120))
      c.set('note', cleanName(body.note, 300))
      c.set('lists', ownLists(body.lists))
      $app.save(c)
      return e.json(200, serContact(c))
    }

    if (action === 'delete_contacts') {
      if (!can('excluir')) return deny()
      let n = 0
      for (const id of Array.isArray(body.ids) ? body.ids.slice(0, 5000) : []) {
        const c = findContact(id)
        if (!c) continue
        $app.delete(c)
        n++
      }
      return e.json(200, { deleted: n })
    }

    if (action === 'save_list') {
      const id = String(body.id || '')
      const name = cleanName(body.name, 100)
      if (!name) return e.json(400, { message: 'Dê um nome para a lista.' })
      let l = null
      if (id) {
        if (!can('alterar')) return deny()
        l = findList(id)
        if (!l) return e.json(404, { message: 'Lista não encontrada.' })
      } else {
        if (!can('novo')) return deny()
        l = new Record($app.findCollectionByNameOrId('whatsapp_lists'))
        l.set('church_id', churchId)
      }
      l.set('name', name)
      l.set('description', cleanName(body.description, 300))
      $app.save(l)
      return e.json(200, serList(l, 0))
    }

    if (action === 'delete_list') {
      if (!can('excluir')) return deny()
      const l = findList(body.id)
      if (!l) return e.json(404, { message: 'Lista não encontrada.' })
      // Tira a lista dos contatos (os números continuam na base)
      for (const c of loadContacts()) {
        const cur = listsOf(c)
        if (cur.indexOf(l.id) === -1) continue
        c.set(
          'lists',
          cur.filter((x) => x !== l.id),
        )
        $app.save(c)
      }
      $app.delete(l)
      return e.json(200, { id: l.id })
    }

    if (action === 'set_list') {
      if (!can('alterar')) return deny()
      const l = findList(body.list_id)
      if (!l) return e.json(404, { message: 'Lista não encontrada.' })
      const on = body.on !== false
      let n = 0
      for (const id of Array.isArray(body.contact_ids) ? body.contact_ids.slice(0, 5000) : []) {
        const c = findContact(id)
        if (!c) continue
        const cur = listsOf(c)
        const has = cur.indexOf(l.id) !== -1
        if (on === has) continue
        c.set('lists', on ? cur.concat([l.id]) : cur.filter((x) => x !== l.id))
        $app.save(c)
        n++
      }
      return e.json(200, { changed: n })
    }

    return e.json(400, { message: 'Ação desconhecida' })
  },
  $apis.requireAuth(),
)
