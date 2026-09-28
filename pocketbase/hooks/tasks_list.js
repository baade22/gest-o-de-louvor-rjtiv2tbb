// Hook para listar tarefas filtradas por evento e com respeito a permissões do usuário
// GET /backend/v1/tasks/list?event_id=...&church_id=...&team_area=...

routerAdd(
  'GET',
  '/backend/v1/tasks/list',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { message: 'Não autorizado' })
    }

    let churchId = ''
    let eventId = ''
    let teamArea = ''

    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        churchId = String(e.request.url.query().get('church_id') || '').trim()
        eventId = String(e.request.url.query().get('event_id') || '').trim()
        teamArea = String(e.request.url.query().get('team_area') || '').trim()
      }
    } catch (_) {}
    if (!churchId || !eventId) {
      try {
        const q = e.requestInfo ? e.requestInfo().query : null
        if (q) {
          if (!churchId) churchId = String(q.church_id || '').trim()
          if (!eventId) eventId = String(q.event_id || '').trim()
          if (!teamArea) teamArea = String(q.team_area || '').trim()
        }
      } catch (_) {}
    }

    let member = null
    try {
      if (churchId) {
        const records = $app.findRecordsByFilter(
          'church_members',
          'church_id = {:churchId} && user_id = {:userId} && is_active = true',
          '',
          1,
          0,
          { churchId: churchId, userId: auth.id },
        )
        if (records.length > 0) member = records[0]
      } else {
        const records = $app.findRecordsByFilter(
          'church_members',
          'user_id = {:userId} && is_active = true',
          '-created',
          1,
          0,
          { userId: auth.id },
        )
        if (records.length > 0) {
          member = records[0]
          churchId = member.getString('church_id')
        }
      }
    } catch (err) {
      return e.json(500, { message: 'Erro ao verificar membresia: ' + err.message })
    }

    if (!member) {
      return e.json(403, { message: 'Sem vínculo com a igreja.' })
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

    let filter = 'church_id = {:churchId} && event_id = {:eventId}'
    const params = { churchId: churchId, eventId: eventId }

    if (teamArea) {
      filter += ' && team_area = {:teamArea}'
      params.teamArea = teamArea
    }

    let records = []
    try {
      records = $app.findRecordsByFilter('event_tasks', filter, '-created', 100, 0, params)
    } catch (err) {
      return e.json(500, { message: 'Erro ao buscar tarefas: ' + err.message })
    }

    // Filtrar visibilidade para usuários não-master/admin
    // Regra: MASTER/ADMIN/LIDER vê tudo daquele evento
    // Usuário operacional vê: tarefas atribuídas a ele OU tarefas das áreas que ele tem acesso
    const visible = []
    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      if (isAdmin || isLider) {
        visible.push(r)
      } else {
        const area = r.getString('team_area')
        const assigned = r.getString('assigned_to')
        if (assigned === member.id || opRoles.includes(area)) {
          visible.push(r)
        }
      }
    }

    // Enriquecer com dados de quem criou e de quem foi atribuído
    const result = []
    for (let i = 0; i < visible.length; i++) {
      const task = visible[i]
      let assignedUser = null
      let createdByUser = null

      const assignedMemberId = task.getString('assigned_to')
      if (assignedMemberId) {
        try {
          const m = $app.findRecordById('church_members', assignedMemberId)
          const u = $app.findRecordById('users', m.getString('user_id'))
          assignedUser = {
            member_id: m.id,
            user_id: u.id,
            name: u.getString('name'),
            email: u.getString('email'),
          }
        } catch (_) {}
      }

      const createdMemberId = task.getString('created_by')
      if (createdMemberId) {
        try {
          const m = $app.findRecordById('church_members', createdMemberId)
          const u = $app.findRecordById('users', m.getString('user_id'))
          createdByUser = {
            member_id: m.id,
            user_id: u.id,
            name: u.getString('name'),
            email: u.getString('email'),
          }
        } catch (_) {}
      }

      result.push({
        id: task.id,
        church_id: task.getString('church_id'),
        event_id: task.getString('event_id'),
        title: task.getString('title'),
        description: task.getString('description'),
        team_area: task.getString('team_area'),
        assigned_to: assignedMemberId,
        assigned_user: assignedUser,
        created_by: createdMemberId,
        created_user: createdByUser,
        due_date: task.getString('due_date'),
        status: task.getString('status'),
        priority: task.getString('priority'),
        completed_at: task.getString('completed_at'),
        notes: task.getString('notes'),
        created: task.getString('created'),
        updated: task.getString('updated'),
      })
    }

    return e.json(200, { tasks: result })
  },
  $apis.requireAuth(),
)
