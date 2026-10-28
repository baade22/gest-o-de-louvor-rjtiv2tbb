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

    let perms = []
    try {
      perms = JSON.parse(memberRecord.getString('permissions') || '[]') || []
    } catch (_) {}
    if (!Array.isArray(perms)) perms = []
    const has = (k) => perms.indexOf(k) !== -1
    const hasAny = (prefix) => {
      for (let i = 0; i < perms.length; i++)
        if (String(perms[i]).indexOf(prefix + '.') === 0) return true
      return false
    }

    // Módulo -> chave dos perfis de acesso (src/lib/accessCatalog.ts)
    let allowed = false
    switch (moduleName) {
      case 'sound':
        allowed = has('culto.som.ver')
        break
      case 'projection':
        allowed = has('culto.projecao.ver')
        break
      case 'media':
        allowed = has('culto.midias.ver')
        break
      case 'lighting':
        allowed = has('culto.iluminacao.ver')
        break
      case 'tasks':
        allowed = has('louvor.tarefas.ver')
        break
      case 'songs':
        allowed = has('louvor.musicas.ver')
        break
      case 'events':
        allowed = has('louvor.cultos.ver')
        break
      case 'musicians':
        allowed = has('admin.pessoas.ver')
        break
      case 'roles':
        allowed = has('admin.funcoes.ver')
        break
      case 'finance':
        allowed = hasAny('financeiro')
        break
      case 'membership':
        allowed = hasAny('membresia')
        break
      case 'church_events':
        allowed = hasAny('eventos')
        break
      case 'integrations':
        allowed = has('admin.integracoes.ver')
        break
      case 'settings':
        allowed = has('admin.configuracoes.ver')
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
