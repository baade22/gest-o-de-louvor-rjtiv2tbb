// Hook para obter as permissões consolidadas do usuário autenticado na congregação ativa
// GET /backend/v1/permissions/me?church_id=... (requer autenticação)
// Retorna: { church_id, role, operational_roles, is_master, access_keys, congregations,
//            profiles, permissions, modules }
//
// access_keys são as chaves dos perfis de acesso (modulo.tela.acao, ver
// src/lib/accessCatalog.ts), já somadas pelo hook church_members_access.js. permissions
// traz também as chaves antigas (music.view, finance.edit...) derivadas delas, para as
// telas que ainda usam esses nomes. MASTER tem tudo (is_master).

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
        access_keys: [],
        modules: [],
        is_master: false,
      })
    }

    const parseList = (s) => {
      try {
        const v = JSON.parse(s || '[]')
        return Array.isArray(v) ? v.map((x) => String(x)) : []
      } catch (_) {
        return []
      }
    }

    const appRole = memberRecord.getString('role') || 'MUSICO'
    const isMaster = appRole === 'MASTER'
    const keys = isMaster ? ['*'] : parseList(memberRecord.getString('permissions'))
    const has = (k) => isMaster || keys.indexOf(k) !== -1
    const hasAny = (prefix) => {
      if (isMaster) return true
      for (let i = 0; i < keys.length; i++) if (keys[i].indexOf(prefix + '.') === 0) return true
      return false
    }

    const congregations = {
      membresia: isMaster ? ['*'] : parseList(memberRecord.getString('cong_membresia')),
      eventos: isMaster ? ['*'] : parseList(memberRecord.getString('cong_eventos')),
      financeiro: isMaster ? ['*'] : parseList(memberRecord.getString('cong_financeiro')),
    }

    const profiles = []
    for (const id of parseList(memberRecord.getString('access_profiles'))) {
      try {
        const p = $app.findRecordById('access_profiles', id)
        profiles.push({ id: p.id, name: p.getString('name') })
      } catch (_) {}
    }

    // Chaves antigas derivadas das novas (compatibilidade com telas antigas)
    const legacy = {
      'profile.view': true,
      'profile.edit': true,
      'scales.view': true,
      'music.view': has('louvor.musicas.ver'),
      'music.edit': has('louvor.musicas.alterar'),
      'events.view': has('louvor.cultos.ver'),
      'events.edit': has('louvor.cultos.alterar'),
      'scales.edit': has('louvor.escalas.alterar'),
      'sound.view': has('culto.som.ver'),
      'sound.edit': has('culto.som.alterar'),
      'projection.view': has('culto.projecao.ver'),
      'projection.edit': has('culto.projecao.alterar'),
      'media.view': has('culto.midias.ver'),
      'media.upload': has('culto.midias.novo'),
      'lighting.view': has('culto.iluminacao.ver'),
      'lighting.edit': has('culto.iluminacao.alterar'),
      'tasks.view': has('louvor.tarefas.ver'),
      'tasks.edit': has('louvor.tarefas.alterar'),
      'users.view': has('admin.pessoas.ver'),
      'users.create': has('admin.pessoas.novo'),
      'users.edit': has('admin.pessoas.alterar'),
      'roles.view': has('admin.funcoes.ver'),
      'roles.edit': has('admin.funcoes.alterar'),
      'integrations.view': has('admin.integracoes.ver'),
      'integrations.edit': has('admin.integracoes.alterar'),
      'holyrics.view': has('culto.computadores.ver'),
      'holyrics.sync': has('culto.computadores.enviar'),
      'church.settings': has('admin.configuracoes.alterar'),
      'finance.view': hasAny('financeiro'),
      'finance.edit': has('financeiro.lancamentos.novo'),
      'finance.audit': has('financeiro.auditoria.auditar'),
    }
    const permissionsList = Object.keys(legacy).filter((k) => legacy[k])
    if (!isMaster) for (const k of keys) permissionsList.push(k)

    // Módulos (nomes antigos usados no menu e em /modules/access)
    const modules = ['dashboard', 'profile']
    if (has('louvor.minhas_escalas.ver')) modules.push('my_scales')
    if (has('louvor.musicas.ver')) modules.push('songs')
    if (has('louvor.cultos.ver')) modules.push('events')
    if (has('culto.som.ver')) modules.push('sound')
    if (has('culto.projecao.ver')) modules.push('projection')
    if (has('culto.midias.ver')) modules.push('media')
    if (has('louvor.tarefas.ver')) modules.push('tasks')
    if (has('culto.iluminacao.ver')) modules.push('lighting')
    if (has('admin.pessoas.ver')) modules.push('musicians')
    if (has('admin.funcoes.ver')) modules.push('roles')
    if (has('admin.integracoes.ver')) modules.push('integrations')
    if (has('admin.configuracoes.ver')) modules.push('settings')
    if (hasAny('financeiro')) modules.push('finance')
    if (hasAny('membresia')) modules.push('membership')
    if (hasAny('eventos')) modules.push('church_events')

    let opRoles = parseList(memberRecord.getString('operational_roles'))
    if (isMaster) opRoles = ['MUSICO', 'SOM', 'PROJECAO', 'MIDIA', 'ILUMINACAO']

    return e.json(200, {
      church_id: churchId,
      role: appRole,
      operational_roles: opRoles,
      is_master: isMaster,
      is_admin: isMaster || appRole === 'ADMIN',
      is_leader: isMaster || appRole === 'ADMIN' || appRole === 'LIDER',
      access_keys: keys,
      congregations: congregations,
      profiles: profiles,
      permissions: permissionsList,
      modules: modules,
    })
  },
  $apis.requireAuth(),
)
