// Tarifas bancárias conciliadas sozinhas (Financeiro)
//
// Movimento de saída do extrato (API do banco ou OFX) cuja descrição começa com tarifa
// (TARIFA, TAR., CESTA, PACOTE DE SERVIÇOS) não abre conta a pagar: vira um lançamento de
// saída na categoria "Tarifas bancárias" (criada se a igreja não tiver) e fica conciliado.
// Se já existe um lançamento dessa categoria, na mesma conta e valor, em até 3 dias e sem
// conciliação, liga a ele em vez de criar outro.
// Roda a cada 2 minutos sobre os movimentos PENDENTES; mês fechado fica para uma pessoa.

cronAdd('finance_bank_fees', '*/2 * * * *', () => {
  const FEE = /^\s*(TARIFA|TAR[\s.]|CESTA\b|PACOTE\s+(DE\s+)?SERV|MENSALIDADE\s+PACOTE)/i
  const CATEGORY = 'Tarifas bancárias'
  const nowIso = new Date().toISOString().replace('T', ' ')
  const day = 24 * 60 * 60 * 1000
  const shift = (ymd, n) =>
    new Date(new Date(ymd + 'T12:00:00Z').getTime() + n * day).toISOString().slice(0, 10)

  let lines = []
  try {
    lines = $app.findRecordsByFilter(
      'fin_bank_lines',
      "status = 'PENDENTE' && amount_cents < 0 && (description ~ 'TAR%' || description ~ 'CESTA%' || description ~ 'PACOTE%' || description ~ 'MENSALIDADE%')",
      '-date', // os mais novos primeiro: os de mês fechado não travam a fila
      200,
      0,
    )
  } catch (_) {
    return
  }

  const owners = {}
  const ownerOf = (churchId) => {
    if (owners[churchId] !== undefined) return owners[churchId]
    let id = ''
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        "church_id = {:c} && role = 'MASTER' && is_active = true",
        'created',
        1,
        0,
        { c: churchId },
      )
      id = rows.length ? rows[0].getString('user_id') : ''
    } catch (_) {}
    owners[churchId] = id
    return id
  }
  const categories = {}
  const categoryOf = (churchId) => {
    if (categories[churchId]) return categories[churchId]
    let id = ''
    try {
      const rows = $app.findRecordsByFilter(
        'fin_categories',
        "church_id = {:c} && direction = 'SAIDA' && is_active = true && name ~ 'tarifa'",
        'created',
        10,
        0,
        { c: churchId },
      )
      const exact = rows.find((r) => r.getString('name').toLowerCase() === CATEGORY.toLowerCase())
      if (exact || rows.length) id = (exact || rows[0]).id
    } catch (_) {}
    if (!id) {
      const cat = new Record($app.findCollectionByNameOrId('fin_categories'))
      cat.set('church_id', churchId)
      cat.set('name', CATEGORY)
      cat.set('direction', 'SAIDA')
      cat.set('is_active', true)
      $app.save(cat)
      id = cat.id
    }
    categories[churchId] = id
    return id
  }

  for (const line of lines) {
    const desc = line.getString('description')
    // Só a primeira parte: a segunda linha do Pix traz o nome de quem recebeu
    if (!FEE.test(desc.split(' · ')[0])) continue
    const churchId = line.getString('church_id')
    const accountId = line.getString('account_id')
    const abs = Math.abs(line.getInt('amount_cents'))
    const ymd = line.getString('date').slice(0, 10)
    try {
      const userId = ownerOf(churchId)
      if (!userId) continue
      const categoryId = categoryOf(churchId)
      $app.runInTransaction((txApp) => {
        const fresh = txApp.findRecordById('fin_bank_lines', line.id)
        if (fresh.getString('status') !== 'PENDENTE') return
        const same = txApp.findRecordsByFilter(
          'fin_transactions',
          "church_id = {:c} && type = 'SAIDA' && status = 'CONFIRMADO' && bank_line_id = '' && account_id = {:a} && category_id = {:k} && amount_cents = {:v} && date >= {:from} && date <= {:to}",
          'date',
          1,
          0,
          {
            c: churchId,
            a: accountId,
            k: categoryId,
            v: abs,
            from: shift(ymd, -3) + ' 00:00:00.000Z',
            to: shift(ymd, 3) + ' 23:59:59.999Z',
          },
        )
        let tx = same.length ? same[0] : null
        if (!tx) {
          tx = new Record(txApp.findCollectionByNameOrId('fin_transactions'))
          tx.set('church_id', churchId)
          tx.set('type', 'SAIDA')
          tx.set('date', ymd + ' 12:00:00.000Z')
          tx.set('amount_cents', abs)
          tx.set('description', desc.slice(0, 200))
          tx.set('account_id', accountId)
          tx.set('category_id', categoryId)
          tx.set('status', 'CONFIRMADO')
          tx.set('created_by', userId)
          txApp.save(tx)
        }
        tx.set('bank_line_id', fresh.id)
        txApp.save(tx)
        fresh.set('status', 'CONCILIADO')
        fresh.set('transaction_id', tx.id)
        fresh.set('reconciled_at', nowIso)
        fresh.set('reconciled_by_name', 'Automático (tarifa bancária)')
        txApp.save(fresh)
      })
    } catch (err) {
      // Ex.: mês já fechado. Fica pendente para uma pessoa conciliar.
      console.log('tarifas: movimento ' + line.id + ' ficou pendente: ' + err)
    }
  }
})
