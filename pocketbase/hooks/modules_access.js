// Hook para verificar acesso a módulos protegidos
// GET /backend/v1/modules/access?module=...&church_id=...
// Bloqueia com 403 caso o usuário não tenha permissão no backend

routerAdd(
  'GET',
  '/backend/v1/modules/access',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    let moduleName = ''
    let churchId = ''

    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        moduleName = String(e.request.url.query().get('module') || '').trim()
        churchId = String(e.request.url.query().get('church_id') || '').trim()
      }
    } catch (_) {}

    if (!moduleName) {
      try {
        const q = e.requestInfo ? e.requestInfo().query : null
        if (q) {
          moduleName = String(q.module || '').trim()
          churchId = String(q.church_id || '').trim()
        }
      } catch (_) {}
    }

    if (!moduleName) {
      return e.json(400, { message: 'Parâmetro module é obrigatório' })
    }

    // Identificar a membresia
    let memberRecord = null
    try {
      if (churchId) {
        const records = $app.findRecordsByFilter(
          'church_members',
          'church_id = {:churchId} && user_id = {:userId} && is_active = true',
          '',
          1,
          0,
          { churchId: churchId, userId: authRecord.id },
        )
        if (records.length > 0) memberRecord = records[0]
      } else {
        const records = $app.findRecordsByFilter(
          'church_members',
          'user_id = {:userId} && is_active = true',
          '-created',
          1,
          0,
          { userId: authRecord.id },
        )
        if (records.length > 0) memberRecord = records[0]
      }
    } catch (err) {
      return e.json(500, { message: 'Erro ao verificar congregação: ' + err.message })
    }

    if (!memberRecord) {
      return e.json(403, { allowed: false, message: 'Sem vínculo ativo com a igreja.' })
    }

    const appRole = memberRecord.getString('role')
    if (appRole === 'MASTER') {
      return e.json(200, { allowed: true, module: moduleName, is_master: true })
    }

    let opRoles = []
    try {
      const raw = memberRecord.get('operational_roles')
      if (typeof raw === 'string' && raw) {
        opRoles = JSON.parse(raw)
      } else if (Array.isArray(raw)) {
        if (raw.length > 0 && typeof raw[0] === 'number') {
          let str = ''
          for (let b = 0; b < raw.length; b++) str += String.fromCharCode(raw[b])
          opRoles = JSON.parse(str)
        } else {
          opRoles = raw
        }
      }
    } catch (_) {}
    if (!Array.isArray(opRoles)) opRoles = []
    if (opRoles.length === 0) {
      opRoles = ['MUSICO']
    }

    const isAdmin = appRole === 'ADMIN'
    const isLider = appRole === 'LIDER'

    let allowed = false

    switch (moduleName) {
      case 'sound':
        allowed = opRoles.includes('SOM') || isAdmin
        break
      case 'projection':
        allowed = opRoles.includes('PROJECAO') || isAdmin
        break
      case 'media':
        allowed = opRoles.includes('MIDIA') || opRoles.includes('PROJECAO') || isAdmin
        break
      case 'lighting':
        allowed = opRoles.includes('ILUMINACAO') || isAdmin
        break
      case 'tasks':
        allowed = opRoles.includes('MIDIA') || isAdmin || isLider
        break
      case 'songs':
        allowed = opRoles.includes('MUSICO') || isAdmin || isLider
        break
      case 'events':
        allowed =
          opRoles.includes('SOM') ||
          opRoles.includes('PROJECAO') ||
          opRoles.includes('MIDIA') ||
          opRoles.includes('ILUMINACAO') ||
          isAdmin ||
          isLider
        break
      case 'musicians':
      case 'roles':
        allowed = isAdmin || isLider
        break
      case 'integrations':
      case 'settings':
        allowed = isAdmin
        break
      default:
        allowed = true
    }

    if (!allowed) {
      return e.json(403, {
        allowed: false,
        module: moduleName,
        message: 'Acesso negado: seu perfil não tem permissão para acessar o módulo ' + moduleName,
      })
    }

    return e.json(200, { allowed: true, module: moduleName })
  },
  $apis.requireAuth(),
)
