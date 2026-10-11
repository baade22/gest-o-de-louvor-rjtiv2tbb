// Migração 0028: Expande holyrics_sync_logs com colunas de diagnóstico detalhado
// Campos adicionais: command_id, song_title, duration_ms, http_status, stage, details
migrate(
  (app) => {
    const logsCol = app.findCollectionByNameOrId('holyrics_sync_logs')

    if (!logsCol.fields.getByName('command_id')) {
      logsCol.fields.add(new TextField({ name: 'command_id' }))
    }
    if (!logsCol.fields.getByName('song_title')) {
      logsCol.fields.add(new TextField({ name: 'song_title' }))
    }
    if (!logsCol.fields.getByName('duration_ms')) {
      logsCol.fields.add(new NumberField({ name: 'duration_ms', onlyInt: true }))
    }
    if (!logsCol.fields.getByName('http_status')) {
      logsCol.fields.add(new NumberField({ name: 'http_status', onlyInt: true }))
    }
    if (!logsCol.fields.getByName('stage')) {
      logsCol.fields.add(new TextField({ name: 'stage' }))
    }
    if (!logsCol.fields.getByName('details')) {
      logsCol.fields.add(new JSONField({ name: 'details' }))
    }

    app.save(logsCol)
  },
  (app) => {
    try {
      const logsCol = app.findCollectionByNameOrId('holyrics_sync_logs')
      const fieldsToRemove = [
        'command_id',
        'song_title',
        'duration_ms',
        'http_status',
        'stage',
        'details',
      ]
      for (let i = 0; i < fieldsToRemove.length; i++) {
        const f = logsCol.fields.getByName(fieldsToRemove[i])
        if (f) logsCol.fields.removeByName(fieldsToRemove[i])
      }
      app.save(logsCol)
    } catch (_) {}
  },
)
