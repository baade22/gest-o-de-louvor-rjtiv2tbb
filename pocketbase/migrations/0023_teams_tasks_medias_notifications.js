migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const events = app.findCollectionByNameOrId('events')
    const churchMembers = app.findCollectionByNameOrId('church_members')

    // 1. Preparar campos em events para suporte futuro ao Holyrics (sem sincronização ativa nesta versão)
    if (!events.fields.getByName('holyrics_event_id')) {
      events.fields.add(new TextField({ name: 'holyrics_event_id' }))
      app.save(events)
    }

    // 2. Collection event_tasks
    // Campos: church_id, event_id, title, description, team_area, assigned_to (church_members), created_by (church_members), due_date, status, priority, completed_at, notes, created, updated
    let eventTasksCol
    try {
      eventTasksCol = app.findCollectionByNameOrId('event_tasks')
    } catch (_) {
      eventTasksCol = new Collection({
        name: 'event_tasks',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'event_id',
            type: 'relation',
            required: true,
            collectionId: events.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'title', type: 'text', required: true },
          { name: 'description', type: 'text' },
          {
            name: 'team_area',
            type: 'select',
            required: true,
            values: ['LOUVOR', 'SOM', 'PROJECAO', 'MIDIA', 'ILUMINACAO'],
            maxSelect: 1,
          },
          {
            name: 'assigned_to',
            type: 'relation',
            collectionId: churchMembers.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'created_by',
            type: 'relation',
            collectionId: churchMembers.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'due_date', type: 'date' },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
            maxSelect: 1,
          },
          {
            name: 'priority',
            type: 'select',
            required: true,
            values: ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'],
            maxSelect: 1,
          },
          { name: 'completed_at', type: 'date' },
          { name: 'notes', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_event_tasks_church ON event_tasks (church_id)',
          'CREATE INDEX idx_event_tasks_event ON event_tasks (event_id)',
          'CREATE INDEX idx_event_tasks_assigned ON event_tasks (assigned_to)',
          'CREATE INDEX idx_event_tasks_status ON event_tasks (status)',
          'CREATE INDEX idx_event_tasks_area ON event_tasks (team_area)',
        ],
      })
      app.save(eventTasksCol)
    }

    // 3. Collection media_assets
    // Campos: church_id, event_id, name, file (pb file), media_type, category, size (number), duration (number), uploaded_by (church_members), assigned_operator (church_members), status, holyrics_status, downloaded_at, downloaded_by (church_members), imported_at, imported_by (church_members), created, updated
    let mediaAssetsCol
    try {
      mediaAssetsCol = app.findCollectionByNameOrId('media_assets')
    } catch (_) {
      mediaAssetsCol = new Collection({
        name: 'media_assets',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'event_id',
            type: 'relation',
            required: true,
            collectionId: events.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'name', type: 'text', required: true },
          {
            name: 'file',
            type: 'file',
            maxSelect: 1,
            maxSize: 104857600, // 100MB
          },
          {
            name: 'media_type',
            type: 'select',
            required: true,
            values: ['VIDEO', 'IMAGEM', 'AUDIO', 'DOCUMENTO'],
            maxSelect: 1,
          },
          {
            name: 'category',
            type: 'select',
            required: true,
            values: [
              'AGENDA',
              'ANIVERSARIANTES',
              'AVISOS',
              'CULTOS',
              'EVENTOS',
              'VIDEO_ESPECIAL',
              'OUTROS',
            ],
            maxSelect: 1,
          },
          { name: 'size', type: 'number' },
          { name: 'duration', type: 'number' },
          {
            name: 'uploaded_by',
            type: 'relation',
            collectionId: churchMembers.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'assigned_operator',
            type: 'relation',
            collectionId: churchMembers.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['ENVIADA', 'RECEBIDA', 'BAIXADA', 'IMPORTADA_HOLYRICS', 'CONCLUIDA'],
            maxSelect: 1,
          },
          { name: 'holyrics_status', type: 'text' },
          { name: 'downloaded_at', type: 'date' },
          {
            name: 'downloaded_by',
            type: 'relation',
            collectionId: churchMembers.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'imported_at', type: 'date' },
          {
            name: 'imported_by',
            type: 'relation',
            collectionId: churchMembers.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_media_assets_church ON media_assets (church_id)',
          'CREATE INDEX idx_media_assets_event ON media_assets (event_id)',
          'CREATE INDEX idx_media_assets_operator ON media_assets (assigned_operator)',
          'CREATE INDEX idx_media_assets_status ON media_assets (status)',
          'CREATE INDEX idx_media_assets_category ON media_assets (category)',
        ],
      })
      app.save(mediaAssetsCol)
    }

    // 4. Collection notifications (notificações internas do LouvorFlow)
    // Campos: church_id, user_id (recipient), title, message, type, source, event_id, link, read, read_at, created, updated
    let notificationsCol
    try {
      notificationsCol = app.findCollectionByNameOrId('notifications')
    } catch (_) {
      notificationsCol = new Collection({
        name: 'notifications',
        type: 'base',
        listRule: "@request.auth.id != '' && user_id = @request.auth.id",
        viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
        deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'user_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'title', type: 'text', required: true },
          { name: 'message', type: 'text', required: true },
          { name: 'type', type: 'text' }, // e.g. MEDIA_ASSIGNED, TASK_ASSIGNED, SCALE_INVITE
          { name: 'source', type: 'text' }, // e.g. MIDIA, TAREFAS, ESCALA
          {
            name: 'event_id',
            type: 'relation',
            collectionId: events.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'link', type: 'text' },
          { name: 'read', type: 'bool' },
          { name: 'read_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_notifications_church ON notifications (church_id)',
          'CREATE INDEX idx_notifications_user_read ON notifications (user_id, read)',
        ],
      })
      app.save(notificationsCol)
    }

    // 5. Collection audit_logs (registro de quem criou, atribuiu, alterou status, baixou mídia, etc.)
    let auditLogsCol
    try {
      auditLogsCol = app.findCollectionByNameOrId('audit_logs')
    } catch (_) {
      auditLogsCol = new Collection({
        name: 'audit_logs',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'user_id',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'action', type: 'text', required: true },
          { name: 'entity_type', type: 'text', required: true }, // 'task', 'media', 'scale', 'event'
          { name: 'entity_id', type: 'text', required: true },
          {
            name: 'event_id',
            type: 'relation',
            collectionId: events.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'details', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_audit_logs_church ON audit_logs (church_id)',
          'CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id)',
          'CREATE INDEX idx_audit_logs_event ON audit_logs (event_id)',
        ],
      })
      app.save(auditLogsCol)
    }
  },
  (app) => {
    try {
      const audit = app.findCollectionByNameOrId('audit_logs')
      app.delete(audit)
    } catch (_) {}
    try {
      const notifs = app.findCollectionByNameOrId('notifications')
      app.delete(notifs)
    } catch (_) {}
    try {
      const media = app.findCollectionByNameOrId('media_assets')
      app.delete(media)
    } catch (_) {}
    try {
      const tasks = app.findCollectionByNameOrId('event_tasks')
      app.delete(tasks)
    } catch (_) {}
  },
)
