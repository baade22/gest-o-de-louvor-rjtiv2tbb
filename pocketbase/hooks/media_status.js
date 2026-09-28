// Hook para status e workflow de mídias:
// - POST /backend/v1/media/status (marca como BAIXADA, IMPORTADA_HOLYRICS, CONCLUIDA) com auditoria
// - GET /backend/v1/media/download_url?media_id=... autorizada no backend e registrando auditoria

routerAdd(
  'POST',
  '/backend/v1/media/status',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const mediaId = String(body.media_id || '').trim()
    const newStatus = String(body.status || '').trim()
    const holyricsStatus = String(body.holyrics_status || '').trim()

    if (!mediaId || !newStatus) {
      return e.json(400, { message: 'media_id e status são obrigatórios.' })
    }

    const validStatuses = ['ENVIADA', 'RECEBIDA', 'BAIXADA', 'IMPORTADA_HOLYRICS', 'CONCLUIDA']
    if (!validStatuses.includes(newStatus)) {
      return e.json(400, { message: 'Status inválido: ' + newStatus })
    }

    let media = null
    try {
      media = $app.findRecordById('media_assets', mediaId)
    } catch (_) {
      return e.json(404, { message: 'Mídia não encontrada.' })
    }

    const churchId = media.getString('church_id')

    // Verificar se usuário tem permissão na igreja
    let member = null
    try {
      const records = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: auth.id },
      )
      if (records.length > 0) member = records[0]
    } catch (err) {
      return e.json(500, { message: 'Erro ao verificar membresia: ' + err.message })
    }

    if (!member) {
      return e.json(403, { message: 'Você não tem permissão nesta igreja.' })
    }

    const appRole = member.getString('role')
    const isMaster = appRole === 'MASTER'
    const isAdmin = appRole === 'ADMIN' || isMaster
    const isLider = appRole === 'LIDER' || isAdmin

    let opRoles = []
    try {
      const raw = member.get('operational_roles')
      if (typeof raw === 'string' && raw) opRoles = JSON.parse(raw)
      else if (Array.isArray(raw)) {
        if (raw.length > 0 && typeof raw[0] === 'number') {
          let str = ''
          for (let b = 0; b < raw.length; b++) str += String.fromCharCode(raw[b])
          opRoles = JSON.parse(str)
        } else opRoles = raw
      }
    } catch (_) {}
    if (!Array.isArray(opRoles)) opRoles = []

    const canOperateMedia =
      isAdmin ||
      isLider ||
      opRoles.includes('MIDIA') ||
      opRoles.includes('PROJECAO') ||
      media.getString('assigned_operator') === member.id

    if (!canOperateMedia) {
      return e.json(403, { message: 'Você não tem permissão para operar esta mídia.' })
    }

    const oldStatus = media.getString('status')
    media.set('status', newStatus)

    const nowIso = new Date().toISOString()

    if (newStatus === 'BAIXADA') {
      media.set('downloaded_at', nowIso)
      media.set('downloaded_by', member.id)
    }

    if (newStatus === 'IMPORTADA_HOLYRICS') {
      media.set('imported_at', nowIso)
      media.set('imported_by', member.id)
      media.set('holyrics_status', holyricsStatus || 'IMPORTADO_MANUALMENTE')
    }

    if (holyricsStatus) {
      media.set('holyrics_status', holyricsStatus)
    }

    $app.save(media)

    // Auditoria
    try {
      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('church_id', churchId)
      log.set('user_id', auth.id)
      log.set('action', 'MEDIA_STATUS_' + newStatus)
      log.set('entity_type', 'media')
      log.set('entity_id', media.id)
      log.set('event_id', media.getString('event_id'))
      log.set('details', {
        old_status: oldStatus,
        new_status: newStatus,
        name: media.getString('name'),
        holyrics_status: media.getString('holyrics_status'),
      })
      $app.save(log)
    } catch (_) {}

    return e.json(200, { success: true, media: media })
  },
  $apis.requireAuth(),
)
