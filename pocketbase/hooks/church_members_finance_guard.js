// Função Financeiro só é dada ou retirada pelo MASTER da igreja.
// A regra de church_members deixa o ADMIN editar membros pela API; sem esta guarda, um ADMIN
// (que no financeiro só lê) poderia se dar a função Financeiro e passar a lançar, conciliar e
// conectar bancos. Os hooks musicians_save.js e invitations_create.js fazem a mesma conferência.

// Os hooks rodam isolados (não enxergam nada fora da função), por isso o corpo se repete.
onRecordCreateRequest((e) => {
  const auth = e.auth
  // Superusuário e gravações internas dos hooks não passam por aqui como usuário comum
  if (!auth || auth.collection().name !== 'users') {
    e.next()
    return
  }
  const hasFinance = (raw) => {
    let ops = raw
    if (typeof raw === 'string') {
      try {
        ops = JSON.parse(raw || '[]')
      } catch (_) {
        ops = []
      }
    }
    return Array.isArray(ops) && ops.indexOf('FINANCEIRO') !== -1
  }
  const rec = e.record
  const after = hasFinance(rec.getString('operational_roles'))
  const before = rec.isNew() ? false : hasFinance(rec.original().getString('operational_roles'))
  if (after !== before) {
    let isMaster = false
    try {
      const m = e.app.findFirstRecordByFilter(
        'church_members',
        "church_id = {:c} && user_id = {:u} && is_active = true && role = 'MASTER'",
        { c: rec.getString('church_id'), u: auth.id },
      )
      isMaster = !!m
    } catch (_) {}
    if (!isMaster) {
      throw new ForbiddenError('Só o MASTER da igreja pode dar ou tirar a função Financeiro.')
    }
  }
  e.next()
}, 'church_members')

onRecordUpdateRequest((e) => {
  const auth = e.auth
  // Superusuário e gravações internas dos hooks não passam por aqui como usuário comum
  if (!auth || auth.collection().name !== 'users') {
    e.next()
    return
  }
  const hasFinance = (raw) => {
    let ops = raw
    if (typeof raw === 'string') {
      try {
        ops = JSON.parse(raw || '[]')
      } catch (_) {
        ops = []
      }
    }
    return Array.isArray(ops) && ops.indexOf('FINANCEIRO') !== -1
  }
  const rec = e.record
  const after = hasFinance(rec.getString('operational_roles'))
  const before = rec.isNew() ? false : hasFinance(rec.original().getString('operational_roles'))
  if (after !== before) {
    let isMaster = false
    try {
      const m = e.app.findFirstRecordByFilter(
        'church_members',
        "church_id = {:c} && user_id = {:u} && is_active = true && role = 'MASTER'",
        { c: rec.getString('church_id'), u: auth.id },
      )
      isMaster = !!m
    } catch (_) {}
    if (!isMaster) {
      throw new ForbiddenError('Só o MASTER da igreja pode dar ou tirar a função Financeiro.')
    }
  }
  e.next()
}, 'church_members')
