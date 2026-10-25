// Valores padrão de uma pessoa nova (collection people, usada pela Membresia e pelo Financeiro)
// - Cadastro rápido do Financeiro (só o nome): entra como CONGREGADO.
// - Cadastro pela Membresia (sem o campo is_active): entra ativo no Financeiro.

onRecordCreateRequest((e) => {
  const body = e.requestInfo().body || {}
  if (!e.record.getString('status')) {
    e.record.set('status', 'CONGREGADO')
  }
  if (body.is_active === undefined || body.is_active === null || body.is_active === '') {
    const status = e.record.getString('status')
    e.record.set('is_active', status !== 'FALECIDO' && status !== 'TRANSFERIDO')
  }
  e.next()
}, 'people')
