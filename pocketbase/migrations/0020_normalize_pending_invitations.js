migrate(
  (app) => {
    // 1. Localiza convites pendentes e valida/normaliza seus role_ids
    try {
      const pendingInvites = app.findRecordsByFilter(
        'invitations',
        'status = "PENDING"',
        '-created',
        100,
        0,
      )

      for (let i = 0; i < pendingInvites.length; i++) {
        const inv = pendingInvites[i]
        const churchId = inv.getString('church_id')
        let rawRoleIds = []
        try {
          const raw = inv.get('role_ids')
          if (Array.isArray(raw)) rawRoleIds = raw
          else if (typeof raw === 'string' && raw) rawRoleIds = JSON.parse(raw)
        } catch (_) {}

        const cleanRoleIds = []
        for (let j = 0; j < rawRoleIds.length; j++) {
          const rId = String(rawRoleIds[j] || '').trim()
          if (!rId) continue
          try {
            const roleRecord = app.findRecordById('roles', rId)
            if (roleRecord && roleRecord.getString('church_id') === churchId) {
              cleanRoleIds.push(roleRecord.id)
            }
          } catch (_) {
            console.log(
              '[MIGRATION 0020] Removendo role_id invalido do convite ' + inv.id + ': ' + rId,
            )
          }
        }

        inv.set('role_ids', cleanRoleIds)
        app.save(inv)
        console.log(
          '[MIGRATION 0020] Convite ' +
            inv.id +
            ' normalizado com ' +
            cleanRoleIds.length +
            ' role_ids válidos.',
        )
      }
    } catch (e) {
      console.log('[MIGRATION 0020] Aviso ao normalizar convites pendentes: ' + e.message)
    }
  },
  () => {
    // Rollback não necessita alteração estrutural
  },
)
