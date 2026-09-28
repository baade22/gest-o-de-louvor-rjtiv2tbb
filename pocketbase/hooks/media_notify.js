// Hook para notificar após o envio de mídia e auditar
// POST /backend/v1/media/notify
// Body: { media_id: string }

routerAdd(
  'POST',
  '/backend/v1/media/notify',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const mediaId = String(body.media_id || '').trim()

    if (!mediaId) {
      return e.json(400, { message: 'media_id é obrigatório.' })
    }

    let media = null
    try {
      media = $app.findRecordById('media_assets', mediaId)
    } catch (_) {
      return e.json(404, { message: 'Mídia não encontrada.' })
    }

    const churchId = media.getString('church_id')
    const eventId = media.getString('event_id')
    const assignedOperatorId = media.getString('assigned_operator')
    const mediaName = media.getString('name')

    // Obter dados do evento
    let eventTitle = 'Culto'
    let eventDate = ''
    try {
      const ev = $app.findRecordById('events', eventId)
      eventTitle = ev.getString('title')
      eventDate = ev.getString('date')
    } catch (_) {}

    // Notificar o operador responsável se houver
    if (assignedOperatorId) {
      try {
        const assignedMember = $app.findRecordById('church_members', assignedOperatorId)
        const recipientUserId = assignedMember.getString('user_id')
        if (recipientUserId) {
          const senderName = auth.getString('name') || 'Mídia'
          const notifsCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifsCol)
          notif.set('church_id', churchId)
          notif.set('user_id', recipientUserId)
          notif.set('title', '🎬 Nova mídia atribuída')
          notif.set(
            'message',
            senderName + ' enviou: "' + mediaName + '" — Evento: ' + eventTitle + ' — [Ver mídia]',
          )
          notif.set('type', 'MEDIA_ASSIGNED')
          notif.set('source', 'MIDIA')
          notif.set('event_id', eventId)
          notif.set('link', '/events/' + eventId + '/escala?tab=midia')
          notif.set('read', false)
          $app.save(notif)
        }
      } catch (_) {}
    }

    // Auditoria de envio da mídia
    try {
      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('church_id', churchId)
      log.set('user_id', auth.id)
      log.set('action', 'MEDIA_UPLOAD')
      log.set('entity_type', 'media')
      log.set('entity_id', media.id)
      log.set('event_id', eventId)
      log.set('details', {
        name: mediaName,
        category: media.getString('category'),
        media_type: media.getString('media_type'),
        assigned_operator: assignedOperatorId,
      })
      $app.save(log)
    } catch (_) {}

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)
