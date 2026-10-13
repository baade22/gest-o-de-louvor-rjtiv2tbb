// Migração 0032: Torna agent_id opcional na collection holyrics_sync_logs
// Justificativa: logs de diagnóstico de estágio inicial (ex: quando o culto ainda não está vinculado,
// ou quando nenhum agent está conectado ainda) precisam ser gravados para auditoria sem falhar
// com o erro "[HOLYRICS_SYNC_LOG_ERR] agent_id: cannot be blank".

migrate(
  (app) => {
    try {
      const logsCol = app.findCollectionByNameOrId('holyrics_sync_logs')
      const agentField = logsCol.fields.getByName('agent_id')
      if (agentField) {
        agentField.required = false
        app.save(logsCol)
      }
    } catch (err) {
      console.log('[MIGRATION_0032_ERR]', err.message)
    }
  },
  (app) => {
    try {
      const logsCol = app.findCollectionByNameOrId('holyrics_sync_logs')
      const agentField = logsCol.fields.getByName('agent_id')
      if (agentField) {
        agentField.required = true
        app.save(logsCol)
      }
    } catch (_) {}
  },
)
