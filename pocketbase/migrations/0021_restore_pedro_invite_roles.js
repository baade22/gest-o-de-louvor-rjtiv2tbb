migrate(
  (app) => {
    // 1. Localiza o convite do Pedro Henrique
    try {
      const inv = app.findRecordById('invitations', 'y5x9ts5aroncns9')
      const outroRole = app.findFirstRecordByData('roles', 'name', 'OUTRO')
      inv.set('role_ids', [outroRole.id])
      app.save(inv)
      console.log(
        '[MIGRATION 0021] Convite Pedro Henrique restaurado com role_ids: ["' + outroRole.id + '"]',
      )
    } catch (e) {
      console.log('[MIGRATION 0021] Erro ao restaurar convite Pedro Henrique: ' + e.message)
    }
  },
  () => {},
)
