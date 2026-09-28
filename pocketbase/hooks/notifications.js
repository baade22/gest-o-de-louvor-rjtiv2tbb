// Hook para ler e marcar notificações internas
// GET /backend/v1/notifications/list?church_id=...
// POST /backend/v1/notifications/mark_read { notification_id?: string, all?: boolean }

routerAdd(
  'GET',
  '/backend/v1/notifications/list',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { message: 'Não autorizado' })
    }

    let churchId = ''
    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        churchId = String(e.request.url.query().get('church_id') || '').trim()
      }
    } catch (_) {}
    if (!churchId) {
      try {
        const q = e.requestInfo ? e.requestInfo().query : null
        if (q && q.church_id) churchId = String(q.church_id).trim()
      } catch (_) {}
    }

    let filter = 'user_id = {:userId}'
    const params = { userId: auth.id }
    if (churchId) {
      filter += ' && church_id = {:churchId}'
      params.churchId = churchId
    }

    let records = []
    try {
      records = $app.findRecordsByFilter('notifications', filter, '-created', 50, 0, params)
    } catch (err) {
      return e.json(500, { message: 'Erro ao buscar notificações: ' + err.message })
    }

    const items = []
    let unreadCount = 0
    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      const isRead = !!r.get('read')
      if (!isRead) unreadCount++
      items.push({
        id: r.id,
        church_id: r.getString('church_id'),
        user_id: r.getString('user_id'),
        title: r.getString('title'),
        message: r.getString('message'),
        type: r.getString('type'),
        source: r.getString('source'),
        event_id: r.getString('event_id'),
        link: r.getString('link'),
        read: isRead,
        read_at: r.getString('read_at'),
        created: r.getString('created'),
      })
    }

    return e.json(200, { notifications: items, unread_count: unreadCount })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/notifications/mark_read',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const notifId = String(body.notification_id || '').trim()
    const markAll = !!body.all
    const nowIso = new Date().toISOString()

    if (markAll) {
      try {
        const list = $app.findRecordsByFilter(
          'notifications',
          'user_id = {:userId} && read != true',
          '',
          100,
          0,
          { userId: auth.id },
        )
        for (let i = 0; i < list.length; i++) {
          list[i].set('read', true)
          list[i].set('read_at', nowIso)
          $app.save(list[i])
        }
        return e.json(200, { success: true, count: list.length })
      } catch (err) {
        return e.json(500, { message: err.message })
      }
    }

    if (notifId) {
      try {
        const r = $app.findRecordById('notifications', notifId)
        if (r.getString('user_id') === auth.id) {
          r.set('read', true)
          r.set('read_at', nowIso)
          $app.save(r)
          return e.json(200, { success: true })
        } else {
          return e.json(403, { message: 'Notificação não pertence a você.' })
        }
      } catch (err) {
        return e.json(404, { message: 'Notificação não encontrada.' })
      }
    }

    return e.json(400, { message: 'Parâmetro inválido' })
  },
  $apis.requireAuth(),
)
