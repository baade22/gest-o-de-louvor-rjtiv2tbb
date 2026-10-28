// Hook de guarda para church_members (auditoria de segurança 2026-10-18).
//
// A regra de API de church_members permite que o próprio usuário atualize o seu
// vínculo (necessário para editar o telefone no perfil). Sem este hook, essa
// mesma permissão deixaria o usuário escalar o próprio papel (ex.: MUSICO ->
// MASTER), reativar-se (is_active) ou se mover para outra igreja (church_id).
//
// Este hook intercepta a atualização: se quem faz a requisição é um usuário comum
// (não superusuário) alterando o PRÓPRIO vínculo e NÃO é gestor (MASTER/ADMIN/
// LIDER) daquela igreja, os campos sensíveis são restaurados para o valor
// original antes de salvar. Assim a edição de telefone continua funcionando e a
// escalada de privilégio é bloqueada no servidor.
onRecordUpdateRequest((e) => {
  const auth = e.auth
  // Superusuário e hooks internos não passam por e.auth como usuário comum.
  if (!auth || auth.collection().name !== 'users') {
    e.next()
    return
  }

  const record = e.record
  const targetUserId = record.getString('user_id')

  // Só nos importa o caso em que o usuário edita o PRÓPRIO vínculo.
  if (targetUserId !== auth.id) {
    e.next()
    return
  }

  // Verifica se o próprio usuário é gestor ativo desta igreja.
  const churchId = record.getString('church_id')
  let isManager = false
  try {
    const memberships = e.app.findRecordsByFilter(
      'church_members',
      'church_id = {:churchId} && user_id = {:userId} && is_active = true',
      '',
      1,
      0,
      { churchId: churchId, userId: auth.id },
    )
    if (memberships.length > 0) {
      const role = memberships[0].getString('role')
      isManager = role === 'MASTER' || role === 'ADMIN' || role === 'LIDER'
    }
  } catch (_) {}

  if (isManager) {
    e.next()
    return
  }

  // Usuário comum editando o próprio vínculo: restaura campos sensíveis para os
  // valores atualmente persistidos, permitindo apenas campos de perfil (telefone).
  try {
    const original = e.app.findRecordById('church_members', record.id)
    record.set('role', original.getString('role'))
    record.set('church_id', original.getString('church_id'))
    record.set('is_active', original.getBool('is_active'))
    record.set('operational_roles', original.get('operational_roles'))
    record.set('access_profiles', original.get('access_profiles'))
  } catch (_) {}

  e.next()
}, 'church_members')
