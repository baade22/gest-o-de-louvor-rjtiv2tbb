// Perfis de acesso: cálculo do acesso de cada pessoa e guarda de quem pode mudá-lo.
//
// 1. Cálculo (toda gravação de church_members, inclusive as dos hooks): soma os perfis
//    da pessoa e grava permissions, cong_* e, por compatibilidade, role/operational_roles
//    derivados (ver applyAccessProfiles). Se uma rotina antiga grava só role/funções, eles
//    viram os perfis prontos equivalentes.
// 2. Guarda (pedidos pela API): só o MASTER mexe em outro MASTER e no papel; quem gere
//    pessoas (admin.pessoas.novo/alterar) só dá ou tira perfis que não liberem nada além
//    do que ele mesmo tem ("ninguém dá mais do que tem"), e ninguém muda o próprio acesso.
//    Fecha também o achado A1 (ADMIN rebaixar/desativar o MASTER por qualquer caminho).
// 3. Histórico: cada mudança de perfis vai para audit_logs (action ACESSO_ALTERADO).
//
// Os hooks rodam isolados: cada handler leva tudo o que usa dentro dele.

function churchMemberAccessCompute(e) {
  function applyAccessProfiles(app, rec, forceLegacy) {
    const SCOPED = ['membresia', 'eventos', 'financeiro']
    const OPS = [
      'MUSICO',
      'SOM',
      'PROJECAO',
      'MIDIA',
      'ILUMINACAO',
      'FINANCEIRO',
      'AUDITOR',
      'MEMBRESIA',
      'EVENTOS',
    ]
    const parseList = (s) => {
      try {
        const v = JSON.parse(s || '[]')
        return Array.isArray(v) ? v.map((x) => String(x)) : []
      } catch (_) {
        return []
      }
    }
    const same = (a, b) => a.slice().sort().join('|') === b.slice().sort().join('|')

    const role = rec.getString('role')
    if (role === 'MASTER') {
      // MASTER tem tudo; as regras conferem o papel direto, isto é só por garantia
      rec.set('permissions', ['*'])
      for (const m of SCOPED) rec.set('cong_' + m, ['*'])
      return
    }

    const profiles = app.findRecordsByFilter('access_profiles', 'church_id = {:c}', '', 0, 0, {
      c: rec.getString('church_id'),
    })
    const byId = {}
    const bySystemKey = {}
    for (const p of profiles) {
      byId[p.id] = p
      if (p.getBool('is_system') && p.getString('system_key'))
        bySystemKey[p.getString('system_key')] = p
    }

    const rawIds = parseList(rec.getString('access_profiles'))
    const ops = parseList(rec.getString('operational_roles'))
    const orig = rec.isNew() ? null : rec.original()
    let legacy = !!forceLegacy
    if (!legacy) {
      if (!orig) {
        legacy = rawIds.length === 0
      } else {
        const profilesChanged = !same(parseList(orig.getString('access_profiles')), rawIds)
        const legacyChanged =
          orig.getString('role') !== role ||
          !same(parseList(orig.getString('operational_roles')), ops)
        // Quem deixa de ser MASTER fica com os perfis que tiver (não volta às funções antigas)
        legacy = !profilesChanged && legacyChanged && orig.getString('role') !== 'MASTER'
      }
    }

    let ids = []
    if (legacy) {
      const keys = []
      if (role === 'ADMIN') keys.push('ADMIN')
      if (role === 'LIDER') keys.push('LIDER')
      for (const op of ops) if (OPS.indexOf(op) !== -1 && keys.indexOf(op) === -1) keys.push(op)
      if (keys.length === 0) keys.push('MUSICO')
      for (const k of keys) {
        if (bySystemKey[k] && ids.indexOf(bySystemKey[k].id) === -1) ids.push(bySystemKey[k].id)
      }
    } else {
      for (const id of rawIds) if (byId[id] && ids.indexOf(id) === -1) ids.push(id)
    }

    const perms = {}
    const cong = {}
    const sysKeys = {}
    for (const m of SCOPED) cong[m] = {}
    for (const id of ids) {
      const p = byId[id]
      if (!p.getBool('is_active')) continue
      const congs = parseList(p.getString('congregations'))
      const touched = {}
      for (const k of parseList(p.getString('permissions'))) {
        if (!/^[a-z_]+\.[a-z_]+\.[a-z_]+$/.test(k)) continue
        perms[k] = true
        touched[k.split('.')[0]] = true
      }
      for (const m of SCOPED) {
        if (!touched[m]) continue
        if (congs.length === 0) cong[m]['*'] = true
        else for (const c of congs) cong[m][c] = true
      }
      if (p.getBool('is_system')) sysKeys[p.getString('system_key')] = true
    }
    const has = (k) => perms[k] === true

    rec.set('access_profiles', ids)
    rec.set('permissions', Object.keys(perms).sort())
    for (const m of SCOPED) {
      const c = Object.keys(cong[m])
      rec.set('cong_' + m, c.indexOf('*') !== -1 ? ['*'] : c.sort())
    }

    // Compatibilidade: papel e funções antigos derivados das chaves
    let newRole = 'MUSICO'
    if (
      has('admin.pessoas.alterar') ||
      has('admin.configuracoes.alterar') ||
      has('admin.integracoes.alterar')
    ) {
      newRole = 'ADMIN'
    } else if (
      has('louvor.cultos.alterar') ||
      has('louvor.escalas.alterar') ||
      has('louvor.musicas.alterar')
    ) {
      newRole = 'LIDER'
    }
    rec.set('role', newRole)
    const newOps = []
    if (sysKeys.MUSICO) newOps.push('MUSICO')
    if (has('culto.som.ver')) newOps.push('SOM')
    if (has('culto.projecao.ver')) newOps.push('PROJECAO')
    if (has('culto.midias.novo')) newOps.push('MIDIA')
    if (has('culto.iluminacao.ver')) newOps.push('ILUMINACAO')
    if (has('financeiro.lancamentos.novo')) newOps.push('FINANCEIRO')
    if (has('financeiro.auditoria.auditar')) newOps.push('AUDITOR')
    if (has('membresia.pessoas.ver')) newOps.push('MEMBRESIA')
    if (has('eventos.eventos.ver')) newOps.push('EVENTOS')
    rec.set('operational_roles', newOps)
  }

  applyAccessProfiles(e.app, e.record, false)
  e.next()
}

onRecordCreate(churchMemberAccessCompute, 'church_members')
onRecordUpdate(churchMemberAccessCompute, 'church_members')

function churchMemberAccessGuard(e) {
  const auth = e.auth
  // Superusuário e gravações internas dos hooks não passam por aqui como usuário comum
  if (!auth || auth.collection().name !== 'users') {
    e.next()
    return
  }
  const parseList = (s) => {
    try {
      const v = JSON.parse(s || '[]')
      return Array.isArray(v) ? v.map((x) => String(x)) : []
    } catch (_) {
      return []
    }
  }
  const same = (a, b) => a.slice().sort().join('|') === b.slice().sort().join('|')

  const rec = e.record
  const orig = rec.isNew() ? null : rec.original()
  const churchId = rec.getString('church_id')
  let caller = null
  try {
    caller = e.app.findFirstRecordByFilter(
      'church_members',
      'church_id = {:c} && user_id = {:u} && is_active = true',
      { c: churchId, u: auth.id },
    )
  } catch (_) {}
  const isMaster = !!caller && caller.getString('role') === 'MASTER'
  const callerPerms = caller ? parseList(caller.getString('permissions')) : []

  const before = orig ? parseList(orig.getString('access_profiles')) : []
  const after = parseList(rec.getString('access_profiles'))
  const profilesChanged = !same(before, after)
  const opsChanged = orig
    ? !same(
        parseList(orig.getString('operational_roles')),
        parseList(rec.getString('operational_roles')),
      )
    : parseList(rec.getString('operational_roles')).length > 0
  const roleChanged = orig ? orig.getString('role') !== rec.getString('role') : false

  if (!isMaster) {
    if (orig && orig.getString('role') === 'MASTER') {
      throw new ForbiddenError('Só o MASTER da igreja pode alterar outro MASTER.')
    }
    if (rec.getString('role') === 'MASTER') {
      throw new ForbiddenError('Só o MASTER da igreja pode dar o acesso MASTER.')
    }
    if (opsChanged || roleChanged) {
      throw new ForbiddenError('O acesso agora é dado pelos perfis de acesso.')
    }
    if (profilesChanged) {
      if (rec.getString('user_id') === auth.id) {
        throw new ForbiddenError('Você não pode mudar o seu próprio acesso.')
      }
      const need = rec.isNew() ? 'admin.pessoas.novo' : 'admin.pessoas.alterar'
      if (callerPerms.indexOf(need) === -1) {
        throw new ForbiddenError('Você não tem permissão para mudar o acesso das pessoas.')
      }
      const diff = after
        .filter((x) => before.indexOf(x) === -1)
        .concat(before.filter((x) => after.indexOf(x) === -1))
      for (const id of diff) {
        let p = null
        try {
          p = e.app.findRecordById('access_profiles', id)
        } catch (_) {}
        if (!p) continue
        if (p.getString('church_id') !== churchId) {
          throw new BadRequestError('Perfil de acesso de outra igreja.')
        }
        const keys = parseList(p.getString('permissions'))
        for (const k of keys) {
          if (callerPerms.indexOf(k) === -1) {
            throw new ForbiddenError(
              'Você não pode dar ou tirar o perfil "' +
                p.getString('name') +
                '": ele libera coisas que você mesmo não tem. Peça ao MASTER.',
            )
          }
        }
      }
    }
  }

  e.next()

  // Histórico
  if (profilesChanged || roleChanged) {
    try {
      const names = (ids) =>
        ids.map((id) => {
          try {
            return e.app.findRecordById('access_profiles', id).getString('name')
          } catch (_) {
            return '(perfil excluído)'
          }
        })
      const saved = e.app.findRecordById('church_members', rec.id)
      const finalIds = parseList(saved.getString('access_profiles'))
      const log = new Record(e.app.findCollectionByNameOrId('audit_logs'))
      log.set('church_id', churchId)
      log.set('user_id', auth.id)
      log.set('action', 'ACESSO_ALTERADO')
      log.set('entity_type', 'church_members')
      log.set('entity_id', rec.id)
      log.set('details', {
        by_name: auth.getString('name') || auth.getString('email'),
        added: names(finalIds.filter((x) => before.indexOf(x) === -1)),
        removed: names(before.filter((x) => finalIds.indexOf(x) === -1)),
        master_before: !!orig && orig.getString('role') === 'MASTER',
        master_after: saved.getString('role') === 'MASTER',
        new_member: !orig,
      })
      e.app.save(log)
    } catch (_) {}
  }
}

onRecordCreateRequest(churchMemberAccessGuard, 'church_members')
onRecordUpdateRequest(churchMemberAccessGuard, 'church_members')
