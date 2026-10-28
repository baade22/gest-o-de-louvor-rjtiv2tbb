// Perfis de acesso (coleção access_profiles). Só o MASTER cria, altera e exclui (regras da
// migração 0072). Este hook:
// - limpa o que chega: chaves no formato modulo.tela.acao, sem repetição; congregações
//   como lista de nomes; perfis prontos (is_system/system_key) não são criados nem
//   renomeados de sistema pela API;
// - não deixa excluir um perfil pronto (eles são a base da conversão das funções antigas);
// - depois de alterar ou excluir um perfil, recalcula o acesso de quem o tem
//   (church_members_access.js faz a conta ao regravar cada pessoa);
// - registra no histórico (audit_logs).

function accessProfileSanitize(e) {
  const parseList = (s) => {
    try {
      const v = JSON.parse(s || '[]')
      return Array.isArray(v) ? v.map((x) => String(x)) : []
    } catch (_) {
      return []
    }
  }
  const rec = e.record
  const keys = []
  for (const k of parseList(rec.getString('permissions'))) {
    if (/^[a-z_]+\.[a-z_]+\.[a-z_]+$/.test(k) && keys.indexOf(k) === -1) keys.push(k)
  }
  keys.sort()
  rec.set('permissions', keys)
  const congs = []
  for (const c of parseList(rec.getString('congregations'))) {
    const t = c.trim()
    if (t && t !== '*' && t.indexOf('"') === -1 && congs.indexOf(t) === -1) congs.push(t)
  }
  rec.set('congregations', congs)
  rec.set('name', rec.getString('name').trim())
  if (rec.isNew()) {
    rec.set('is_system', false)
    rec.set('system_key', '')
  } else {
    const orig = rec.original()
    rec.set('is_system', orig.getBool('is_system'))
    rec.set('system_key', orig.getString('system_key'))
    rec.set('church_id', orig.getString('church_id'))
  }
  e.next()
}

onRecordCreateRequest(accessProfileSanitize, 'access_profiles')
onRecordUpdateRequest(accessProfileSanitize, 'access_profiles')

onRecordDeleteRequest((e) => {
  if (e.record.getBool('is_system')) {
    throw new BadRequestError(
      'Os perfis prontos não podem ser excluídos. Você pode desativá-los ou mudar o que liberam.',
    )
  }
  e.next()
}, 'access_profiles')

// Recalcula quem tem o perfil (e grava o histórico) depois de salvar ou excluir
function accessProfileAfterChange(e) {
  e.next()
  const rec = e.record
  const churchId = rec.getString('church_id')
  let members = []
  try {
    members = e.app.findRecordsByFilter(
      'church_members',
      'church_id = {:c} && access_profiles ~ {:id}',
      '',
      0,
      0,
      { c: churchId, id: rec.id },
    )
  } catch (_) {}
  for (const m of members) {
    try {
      e.app.save(m)
    } catch (err) {
      console.log('access_profiles: falha ao recalcular ' + m.id + ': ' + err)
    }
  }
}

onRecordAfterUpdateSuccess(accessProfileAfterChange, 'access_profiles')
onRecordAfterDeleteSuccess(accessProfileAfterChange, 'access_profiles')

onRecordCreateRequest((e) => {
  e.next()
  const auth = e.auth
  if (!auth || auth.collection().name !== 'users') return
  try {
    const log = new Record(e.app.findCollectionByNameOrId('audit_logs'))
    log.set('church_id', e.record.getString('church_id'))
    log.set('user_id', auth.id)
    log.set('action', 'PERFIL_CRIADO')
    log.set('entity_type', 'access_profiles')
    log.set('entity_id', e.record.id)
    log.set('details', {
      by_name: auth.getString('name') || auth.getString('email'),
      name: e.record.getString('name'),
    })
    e.app.save(log)
  } catch (_) {}
}, 'access_profiles')

onRecordUpdateRequest((e) => {
  e.next()
  const auth = e.auth
  if (!auth || auth.collection().name !== 'users') return
  try {
    const log = new Record(e.app.findCollectionByNameOrId('audit_logs'))
    log.set('church_id', e.record.getString('church_id'))
    log.set('user_id', auth.id)
    log.set('action', 'PERFIL_ALTERADO')
    log.set('entity_type', 'access_profiles')
    log.set('entity_id', e.record.id)
    log.set('details', {
      by_name: auth.getString('name') || auth.getString('email'),
      name: e.record.getString('name'),
    })
    e.app.save(log)
  } catch (_) {}
}, 'access_profiles')

onRecordDeleteRequest((e) => {
  const churchId = e.record.getString('church_id')
  const name = e.record.getString('name')
  const id = e.record.id
  e.next()
  const auth = e.auth
  if (!auth || auth.collection().name !== 'users') return
  try {
    const log = new Record(e.app.findCollectionByNameOrId('audit_logs'))
    log.set('church_id', churchId)
    log.set('user_id', auth.id)
    log.set('action', 'PERFIL_EXCLUIDO')
    log.set('entity_type', 'access_profiles')
    log.set('entity_id', id)
    log.set('details', { by_name: auth.getString('name') || auth.getString('email'), name: name })
    e.app.save(log)
  } catch (_) {}
}, 'access_profiles')
