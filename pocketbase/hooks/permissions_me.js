// Hook para obter as permissões consolidadas do usuário autenticado na congregação ativa
// GET /backend/v1/permissions/me?church_id=... (requer autenticação)
// Retorna: { church_id, role, operational_roles, is_master, permissions: string[], modules: string[] }

routerAdd(
  'GET',
  '/backend/v1/permissions/me',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
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
        if (q && q.church_id) {
          churchId = String(q.church_id).trim()
        }
      } catch (_) {}
    }

    // Se não fornecido church_id, busca o primeiro vínculo ativo do usuário
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
        if (records.length > 0) {
          memberRecord = records[0]
        }
      } else {
        const records = $app.findRecordsByFilter(
          'church_members',
          'user_id = {:userId} && is_active = true',
          '-created',
          1,
          0,
          { userId: authRecord.id },
        )
        if (records.length > 0) {
          memberRecord = records[0]
          churchId = memberRecord.getString('church_id')
        }
      }
    } catch (err) {
      return e.json(500, { message: 'Erro ao consultar membresia: ' + err.message })
    }

    if (!memberRecord) {
      return e.json(403, {
        message: 'Você não possui vínculo ativo nesta congregação.',
        church_id: churchId,
        permissions: [],
        modules: [],
        is_master: false,
      })
    }

    const appRole = memberRecord.getString('role') || 'MUSICO'
    let opRoles = []
    try {
      const raw = memberRecord.get('operational_roles')
      if (Array.isArray(raw)) {
        opRoles = raw
      } else if (typeof raw === 'string' && raw) {
        opRoles = JSON.parse(raw)
      }
    } catch (_) {}

    // Se não tiver operational_roles configurado ainda, o papel de app dá um default sensato
    if (opRoles.length === 0) {
      if (appRole === 'MASTER') {
        opRoles = ['MUSICO', 'SOM', 'PROJECAO', 'MIDIA', 'ILUMINACAO']
      } else if (appRole === 'ADMIN' || appRole === 'LIDER') {
        opRoles = ['MUSICO']
      } else {
        opRoles = ['MUSICO']
      }
    }

    const isMaster = appRole === 'MASTER'
    const isAdmin = appRole === 'ADMIN' || isMaster
    const isLider = appRole === 'LIDER' || isAdmin

    // Monta matriz de permissões
    // MASTER tem 100% das permissões
    const allPermissions = [
      'music.view',
      'music.edit',
      'events.view',
      'events.edit',
      'scales.view',
      'scales.edit',
      'profile.view',
      'profile.edit',
      'sound.view',
      'sound.edit',
      'projection.view',
      'projection.edit',
      'media.view',
      'media.upload',
      'lighting.view',
      'lighting.edit',
      'tasks.view',
      'tasks.edit',
      'users.view',
      'users.create',
      'users.edit',
      'roles.view',
      'roles.edit',
      'integrations.view',
      'integrations.edit',
      'holyrics.view',
      'holyrics.sync',
      'church.settings',
    ]

    let permissionsSet = {}
    // Sempre básico para todo membro autenticado ativo
    permissionsSet['profile.view'] = true
    permissionsSet['profile.edit'] = true
    permissionsSet['scales.view'] = true

    if (isMaster) {
      for (let i = 0; i < allPermissions.length; i++) {
        permissionsSet[allPermissions[i]] = true
      }
    } else {
      // Regras para ADMIN e LIDER
      if (isAdmin) {
        permissionsSet['music.view'] = true
        permissionsSet['music.edit'] = true
        permissionsSet['events.view'] = true
        permissionsSet['events.edit'] = true
        permissionsSet['scales.edit'] = true
        permissionsSet['users.view'] = true
        permissionsSet['users.create'] = true
        permissionsSet['users.edit'] = true
        permissionsSet['roles.view'] = true
        permissionsSet['roles.edit'] = true
        permissionsSet['integrations.view'] = true
        permissionsSet['integrations.edit'] = true
        permissionsSet['holyrics.view'] = true
        permissionsSet['holyrics.sync'] = true
        permissionsSet['church.settings'] = true
      } else if (isLider) {
        permissionsSet['music.view'] = true
        permissionsSet['music.edit'] = true
        permissionsSet['events.view'] = true
        permissionsSet['events.edit'] = true
        permissionsSet['scales.edit'] = true
        permissionsSet['users.view'] = true
        permissionsSet['roles.view'] = true
        permissionsSet['holyrics.view'] = true
        permissionsSet['holyrics.sync'] = true
      }

      // União das funções operacionais
      for (let i = 0; i < opRoles.length; i++) {
        const op = opRoles[i]
        if (op === 'MUSICO') {
          permissionsSet['music.view'] = true
        }
        if (op === 'SOM') {
          permissionsSet['sound.view'] = true
          permissionsSet['sound.edit'] = true
          permissionsSet['events.view'] = true
        }
        if (op === 'PROJECAO') {
          permissionsSet['projection.view'] = true
          permissionsSet['projection.edit'] = true
          permissionsSet['media.view'] = true
          permissionsSet['events.view'] = true
        }
        if (op === 'MIDIA') {
          permissionsSet['media.view'] = true
          permissionsSet['media.upload'] = true
          permissionsSet['tasks.view'] = true
          permissionsSet['tasks.edit'] = true
          permissionsSet['events.view'] = true
        }
        if (op === 'ILUMINACAO') {
          permissionsSet['lighting.view'] = true
          permissionsSet['lighting.edit'] = true
          permissionsSet['events.view'] = true
        }
      }
    }

    const permissionsList = Object.keys(permissionsSet)

    // Determina lista de módulos permitidos
    // Módulos: dashboard, songs, events, my_scales, sound, projection, media, tasks, lighting, musicians, roles, profile, integrations, settings
    const modules = ['dashboard', 'profile']
    if (permissionsSet['scales.view']) modules.push('my_scales')
    if (permissionsSet['music.view']) modules.push('songs')
    if (permissionsSet['events.view']) modules.push('events')
    if (permissionsSet['sound.view']) modules.push('sound')
    if (permissionsSet['projection.view']) modules.push('projection')
    if (permissionsSet['media.view']) modules.push('media')
    if (permissionsSet['tasks.view']) modules.push('tasks')
    if (permissionsSet['lighting.view']) modules.push('lighting')
    if (permissionsSet['users.view']) modules.push('musicians')
    if (permissionsSet['roles.view']) modules.push('roles')
    if (permissionsSet['integrations.view']) modules.push('integrations')
    if (permissionsSet['church.settings']) modules.push('settings')

    return e.json(200, {
      church_id: churchId,
      role: appRole,
      operational_roles: opRoles,
      is_master: isMaster,
      is_admin: isAdmin,
      is_leader: isLider,
      permissions: permissionsList,
      modules: modules,
    })
  },
  $apis.requireAuth(),
)
