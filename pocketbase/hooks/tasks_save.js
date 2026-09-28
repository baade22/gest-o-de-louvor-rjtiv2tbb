// Hook para registrar e gerenciar tarefas operacionais com regras rigorosas de autorização
// POST /backend/v1/tasks/save
// Body: { id?: string, church_id: string, event_id: string, title: string, description?: string, team_area: string, assigned_to?: string, due_date?: string, status?: string, priority?: string, notes?: string, completed_at?: string }

routerAdd(
  'POST',
  '/backend/v1/tasks/save',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    let churchId = String(body.church_id || '').trim()
    const taskId = String(body.id || '').trim()

    // 1. Identificar membresia ativa do usuário
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
      return e.json(403, { message: 'Você não tem membresia ativa nesta igreja.' })
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

    const eventId = String(body.event_id || '').trim()
    if (!eventId && !taskId) {
      return e.json(400, { message: 'event_id é obrigatório.' })
    }

    // Se estiver editando uma tarefa existente
    if (taskId) {
      let existing = null
      try {
        existing = $app.findRecordById('event_tasks', taskId)
      } catch (_) {
        return e.json(404, { message: 'Tarefa não encontrada.' })
      }

      // Validação multi-tenant
      if (existing.getString('church_id') !== churchId) {
        return e.json(403, { message: 'Acesso negado: tarefa pertence a outra igreja.' })
      }

      const taskArea = existing.getString('team_area')
      const assignedTo = existing.getString('assigned_to')
      const isAssignedToUser = assignedTo === member.id
      const hasAreaRole = opRoles.includes(taskArea)

      // MASTER/ADMIN tem permissão total
      // Usuário operacional pode: atualizar status, observações e concluir se for dele ou da sua área
      if (!isAdmin && !isLider) {
        if (!isAssignedToUser && !hasAreaRole) {
          return e.json(403, {
            message: 'Você não tem permissão para editar tarefas da área ' + taskArea,
          })
        }

        // Usuário comum não pode mudar responsável (assigned_to) nem church_id nem team_area
        if (body.assigned_to !== undefined && body.assigned_to !== assignedTo) {
          return e.json(403, { message: 'Apenas MASTER ou líderes podem reatribuir tarefas.' })
        }
        if (body.team_area !== undefined && body.team_area !== taskArea) {
          return e.json(403, { message: 'Você não pode alterar a área desta tarefa.' })
        }
      }

      // Aplica alterações permitidas
      if (body.title && (isAdmin || isLider)) existing.set('title', body.title)
      if (body.description !== undefined && (isAdmin || isLider))
        existing.set('description', body.description)
      if (body.due_date !== undefined && (isAdmin || isLider))
        existing.set('due_date', body.due_date || null)
      if (body.priority && (isAdmin || isLider)) existing.set('priority', body.priority)
      if (body.assigned_to !== undefined && (isAdmin || isLider))
        existing.set('assigned_to', body.assigned_to || null)
      if (body.team_area && (isAdmin || isLider)) existing.set('team_area', body.team_area)

      // Status e observações podem ser atualizados pelo responsável ou operador da área
      const oldStatus = existing.getString('status')
      if (body.status) {
        existing.set('status', body.status)
        if (body.status === 'CONCLUIDA' && !existing.getString('completed_at')) {
          existing.set('completed_at', new Date().toISOString())
        } else if (body.status !== 'CONCLUIDA') {
          existing.set('completed_at', null)
        }
      }
      if (body.notes !== undefined) {
        existing.set('notes', body.notes)
      }

      $app.save(existing)

      // Registrar auditoria
      try {
        const auditCol = $app.findCollectionByNameOrId('audit_logs')
        const log = new Record(auditCol)
        log.set('church_id', churchId)
        log.set('user_id', auth.id)
        log.set('action', 'TASK_UPDATE')
        log.set('entity_type', 'task')
        log.set('entity_id', existing.id)
        log.set('event_id', existing.getString('event_id'))
        log.set('details', {
          old_status: oldStatus,
          new_status: existing.getString('status'),
          title: existing.getString('title'),
        })
        $app.save(log)
      } catch (_) {}

      return e.json(200, { success: true, task: existing })
    }

    // Criando nova tarefa: MASTER, ADMIN, LIDER ou MIDIA (para tarefas de mídia)
    const teamArea = String(body.team_area || 'LOUVOR').toUpperCase()
    if (!isAdmin && !isLider && !(opRoles.includes('MIDIA') && teamArea === 'MIDIA')) {
      return e.json(403, { message: 'Você não tem permissão para criar tarefas.' })
    }

    const title = String(body.title || '').trim()
    if (!title) {
      return e.json(400, { message: 'Título da tarefa é obrigatório.' })
    }

    const tasksCol = $app.findCollectionByNameOrId('event_tasks')
    const newTask = new Record(tasksCol)
    newTask.set('church_id', churchId)
    newTask.set('event_id', eventId)
    newTask.set('title', title)
    newTask.set('description', body.description || '')
    newTask.set('team_area', teamArea)
    newTask.set('assigned_to', body.assigned_to || null)
    newTask.set('created_by', member.id)
    newTask.set('due_date', body.due_date || null)
    newTask.set('status', body.status || 'PENDENTE')
    newTask.set('priority', body.priority || 'NORMAL')
    newTask.set('notes', body.notes || '')
    if (body.status === 'CONCLUIDA') {
      newTask.set('completed_at', new Date().toISOString())
    }

    $app.save(newTask)

    // Se foi atribuído a um membro, disparar notificação interna
    if (body.assigned_to) {
      try {
        const assignedMember = $app.findRecordById('church_members', body.assigned_to)
        const recipientUserId = assignedMember.getString('user_id')
        if (recipientUserId) {
          let eventTitle = 'Culto'
          try {
            const ev = $app.findRecordById('events', eventId)
            eventTitle = ev.getString('title')
          } catch (_) {}

          const notifsCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifsCol)
          notif.set('church_id', churchId)
          notif.set('user_id', recipientUserId)
          notif.set('title', '🔊 Nova tarefa atribuída')
          notif.set(
            'message',
            'Você foi escalado para: ' + title + ' — Evento: ' + eventTitle + ' (' + teamArea + ')',
          )
          notif.set('type', 'TASK_ASSIGNED')
          notif.set('source', 'TAREFAS')
          notif.set('event_id', eventId)
          notif.set('link', '/events/' + eventId + '/escala?tab=tarefas')
          notif.set('read', false)
          $app.save(notif)
        }
      } catch (_) {}
    }

    // Auditoria de criação
    try {
      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('church_id', churchId)
      log.set('user_id', auth.id)
      log.set('action', 'TASK_CREATE')
      log.set('entity_type', 'task')
      log.set('entity_id', newTask.id)
      log.set('event_id', eventId)
      log.set('details', {
        title: title,
        team_area: teamArea,
        assigned_to: body.assigned_to || null,
      })
      $app.save(log)
    } catch (_) {}

    return e.json(200, { success: true, task: newTask })
  },
  $apis.requireAuth(),
)
