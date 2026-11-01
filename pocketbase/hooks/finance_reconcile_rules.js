// Conciliação que aprende (Financeiro)
//
// Cada movimento do extrato ganha match_code (o que é: código do lançamento do Bradesco, ou o
// começo da descrição sem números) e counterparty (quem pagou ou recebeu, quando o extrato diz).
// Quando uma pessoa concilia ou ignora um movimento, a regra daquele padrão (conta + sentido +
// match_code + counterparty) guarda o que foi feito: lançar na categoria tal (com pessoa,
// fornecedor, centro de custo), transferir para a conta tal, ou ignorar. Se da próxima vez a
// pessoa fizer diferente, a regra muda e perde o "conciliar sozinho".
//
// A tela usa as regras para sugerir (um clique). Só as regras em que alguém ligou "conciliar
// sozinho" (auto) são aplicadas pelo cron, a cada 2 minutos, nos movimentos pendentes.
// Lançamento de conta a pagar/receber e de contagem não vira regra (são de uma vez só).
//
// POST /backend/v1/finance/rules/{action}
//   list   { church_id }                 MASTER ou financeiro.conciliacao.ver
//   auto   { rule_id, auto: true|false } MASTER ou financeiro.conciliacao.alterar
//   delete { rule_id }                   idem

// Chaves do movimento, ao ser gravado (API do banco ou arquivo OFX)
onRecordCreate((e) => {
  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
  const WHO = /\b(REM|DES|DEST|FAV|ORIG)\s*[:.]\s*([^·]+)/
  const keysOf = (fitid, description) => {
    const d = norm(description)
    const segs = d.split('·').map((x) => x.trim())
    let cp = ''
    const m = WHO.exec(d)
    if (m) cp = m[2]
    else if (segs.length > 1) cp = segs.slice(1).join(' ')
    cp = cp
      .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ')
      .replace(/[^A-Z ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
    if (cp.length < 3) cp = ''
    let code = ''
    const f = String(fitid || '')
    if (f.indexOf('api:bradesco:') === 0) {
      const p = f.slice(13).split('|')
      const c = String(p[2] || '').replace(/^0+/, '')
      if (c) code = 'BRADESCO:' + c
    }
    if (!code) {
      const first = segs[0]
        .replace(/\b(REM|DES|DEST|FAV|ORIG)\s*[:.].*$/, '')
        .replace(/[^A-Z ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
      code = 'TEXTO:' + (first || 'MOVIMENTO')
    }
    return { code: code, cp: cp }
  }
  const k = keysOf(e.record.getString('fitid'), e.record.getString('description'))
  e.record.set('match_code', k.code)
  e.record.set('counterparty', k.cp)
  e.next()
}, 'fin_bank_lines')

// Aprende quando uma pessoa concilia ou ignora (não quando foi automático)
onRecordUpdate((e) => {
  const line = e.record
  const before = line.original() ? line.original().getString('status') : ''
  // Voltou a pendente: apaga quem conciliou, para aprender de novo da próxima vez
  if (line.getString('status') === 'PENDENTE' && before !== 'PENDENTE') {
    line.set('reconciled_by_name', '')
  }
  e.next()
  const status = line.getString('status')
  if (status === before || (status !== 'CONCILIADO' && status !== 'IGNORADO')) return
  if (line.getString('reconciled_by_name').indexOf('Automático') === 0) return
  const code = line.getString('match_code')
  if (!code) return
  const app = e.app
  const amount = line.getInt('amount_cents')
  const accountId = line.getString('account_id')
  const direction = amount > 0 ? 'ENTRADA' : 'SAIDA'

  const target = {
    action: 'IGNORAR',
    category_id: '',
    cost_center_id: '',
    campaign_id: '',
    person_id: '',
    is_anonymous: false,
    supplier_id: '',
    transfer_account_id: '',
    payment_method: '',
  }
  if (status === 'CONCILIADO') {
    let tx = null
    try {
      tx = app.findRecordById('fin_transactions', line.getString('transaction_id'))
    } catch (_) {}
    if (!tx || tx.getString('bill_id') || tx.getString('count_id')) return
    if (tx.getString('type') === 'TRANSFERENCIA') {
      target.action = 'TRANSFERENCIA'
      target.transfer_account_id =
        tx.getString('account_id') === accountId
          ? tx.getString('to_account_id')
          : tx.getString('account_id')
      if (!target.transfer_account_id) return
    } else {
      if (!tx.getString('category_id')) return
      target.action = 'LANCAR'
      target.category_id = tx.getString('category_id')
      target.cost_center_id = tx.getString('cost_center_id')
      target.campaign_id = tx.getString('campaign_id')
      target.person_id = tx.getString('person_id')
      target.is_anonymous = tx.getBool('is_anonymous')
      target.supplier_id = tx.getString('supplier_id')
    }
    target.payment_method = tx.getString('payment_method')
  }

  try {
    const found = app.findRecordsByFilter(
      'fin_reconcile_rules',
      // (um {:p} vazio não acha o campo vazio no PocketBase: aí vai escrito)
      'account_id = {:a} && direction = {:d} && match_code = {:m} && ' +
        (line.getString('counterparty') ? 'counterparty = {:p}' : "counterparty = ''"),
      '',
      1,
      0,
      { a: accountId, d: direction, m: code, p: line.getString('counterparty') },
    )
    let rule = found.length ? found[0] : null
    if (rule && rule.getString('last_line_id') === line.id) return
    const same =
      rule &&
      Object.keys(target).every((k) =>
        k === 'payment_method'
          ? true
          : k === 'is_anonymous'
            ? rule.getBool(k) === target[k]
            : rule.getString(k) === target[k],
      )
    if (!rule) {
      rule = new Record(app.findCollectionByNameOrId('fin_reconcile_rules'))
      rule.set('church_id', line.getString('church_id'))
      rule.set('account_id', accountId)
      rule.set('direction', direction)
      rule.set('match_code', code)
      rule.set('counterparty', line.getString('counterparty'))
    }
    if (same) {
      rule.set('hits', rule.getInt('hits') + 1)
    } else {
      // Primeira vez, ou a pessoa fez diferente: guarda o novo e desliga o automático
      for (const k of Object.keys(target)) rule.set(k, target[k])
      rule.set('hits', 1)
      rule.set('auto', false)
    }
    rule.set('example', (line.getString('description') || '').slice(0, 300))
    rule.set('last_line_id', line.id)
    rule.set('last_used_at', new Date().toISOString())
    app.save(rule)
  } catch (err) {
    console.log('regras de conciliação: não aprendeu do movimento ' + line.id + ': ' + err)
  }
}, 'fin_bank_lines')

// Aplica as regras com "conciliar sozinho"
cronAdd('finance_reconcile_rules', '*/2 * * * *', () => {
  const nowIso = new Date().toISOString().replace('T', ' ')
  const day = 24 * 60 * 60 * 1000
  const shift = (ymd, n) =>
    new Date(new Date(ymd + 'T12:00:00Z').getTime() + n * day).toISOString().slice(0, 10)

  let autoRules = []
  try {
    autoRules = $app.findRecordsByFilter('fin_reconcile_rules', 'auto = true', '', 0, 0)
  } catch (_) {
    return
  }
  if (!autoRules.length) return
  const byKey = {}
  for (const r of autoRules) {
    byKey[
      [
        r.getString('account_id'),
        r.getString('direction'),
        r.getString('match_code'),
        r.getString('counterparty'),
      ].join('|')
    ] = r
  }

  let lines = []
  try {
    lines = $app.findRecordsByFilter(
      'fin_bank_lines',
      "status = 'PENDENTE' && match_code != ''",
      '-date', // os mais novos primeiro: os de mês fechado não travam a fila
      300,
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

  for (const line of lines) {
    const amount = line.getInt('amount_cents')
    if (!amount) continue
    const accountId = line.getString('account_id')
    const rule =
      byKey[
        [
          accountId,
          amount > 0 ? 'ENTRADA' : 'SAIDA',
          line.getString('match_code'),
          line.getString('counterparty'),
        ].join('|')
      ]
    if (!rule) continue
    const churchId = line.getString('church_id')
    const isCredit = amount > 0
    const abs = Math.abs(amount)
    const ymd = line.getString('date').slice(0, 10)
    const action = rule.getString('action')
    try {
      const userId = ownerOf(churchId)
      if (!userId && action !== 'IGNORAR') continue
      $app.runInTransaction((txApp) => {
        const fresh = txApp.findRecordById('fin_bank_lines', line.id)
        if (fresh.getString('status') !== 'PENDENTE') return
        fresh.set('reconciled_at', nowIso)
        fresh.set('reconciled_by_name', 'Automático (regra aprendida)')
        if (action === 'IGNORAR') {
          fresh.set('status', 'IGNORADO')
          txApp.save(fresh)
        } else {
          const tx = new Record(txApp.findCollectionByNameOrId('fin_transactions'))
          tx.set('church_id', churchId)
          tx.set('date', ymd + ' 12:00:00.000Z')
          tx.set('amount_cents', abs)
          tx.set('description', (fresh.getString('description') || '').slice(0, 200))
          tx.set('payment_method', rule.getString('payment_method'))
          tx.set('status', 'CONFIRMADO')
          tx.set('created_by', userId)
          let twinField = ''
          let otherAccount = ''
          if (action === 'TRANSFERENCIA') {
            otherAccount = rule.getString('transfer_account_id')
            const other = txApp.findRecordById('fin_accounts', otherAccount)
            if (other.getString('church_id') !== churchId || !other.getBool('is_active')) {
              throw new Error('conta da transferência não serve mais')
            }
            tx.set('type', 'TRANSFERENCIA')
            tx.set('account_id', isCredit ? otherAccount : accountId)
            tx.set('to_account_id', isCredit ? accountId : otherAccount)
            twinField = isCredit ? 'bank_line_id' : 'to_bank_line_id'
          } else {
            tx.set('type', isCredit ? 'ENTRADA' : 'SAIDA')
            tx.set('account_id', accountId)
            tx.set('category_id', rule.getString('category_id'))
            tx.set('cost_center_id', rule.getString('cost_center_id'))
            tx.set('campaign_id', rule.getString('campaign_id'))
            if (isCredit) {
              tx.set('is_anonymous', rule.getBool('is_anonymous'))
              tx.set('person_id', rule.getBool('is_anonymous') ? '' : rule.getString('person_id'))
            } else {
              tx.set('supplier_id', rule.getString('supplier_id'))
            }
          }
          txApp.save(tx)
          tx.set(twinField === 'bank_line_id' ? 'to_bank_line_id' : 'bank_line_id', fresh.id)
          fresh.set('status', 'CONCILIADO')
          fresh.set('transaction_id', tx.id)
          txApp.save(fresh)
          // Transferência: concilia junto o movimento da outra conta, se for um só
          if (twinField) {
            const twins = txApp.findRecordsByFilter(
              'fin_bank_lines',
              "church_id = {:c} && account_id = {:a} && status = 'PENDENTE' && amount_cents = {:v}" +
                ' && date >= {:from} && date <= {:to}',
              '',
              2,
              0,
              {
                c: churchId,
                a: otherAccount,
                v: -amount,
                from: shift(ymd, -3) + ' 00:00:00.000Z',
                to: shift(ymd, 3) + ' 23:59:59.999Z',
              },
            )
            if (twins.length === 1) {
              const twin = twins[0]
              tx.set(twinField, twin.id)
              twin.set('status', 'CONCILIADO')
              twin.set('transaction_id', tx.id)
              twin.set('reconciled_at', nowIso)
              twin.set('reconciled_by_name', 'Automático (regra aprendida)')
              txApp.save(twin)
            }
          }
          txApp.save(tx)
        }
        const r = txApp.findRecordById('fin_reconcile_rules', rule.id)
        r.set('auto_count', r.getInt('auto_count') + 1)
        r.set('last_used_at', new Date().toISOString())
        txApp.save(r)
      })
    } catch (err) {
      // Ex.: mês já fechado, categoria apagada. Fica pendente para uma pessoa.
      console.log('regras de conciliação: movimento ' + line.id + ' ficou pendente: ' + err)
    }
  }
})

routerAdd(
  'POST',
  '/backend/v1/finance/rules/{action}',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    const action = e.request.pathValue('action')
    const body = e.requestInfo().body || {}

    let rule = null
    let churchId = String(body.church_id || '')
    if (action !== 'list') {
      try {
        rule = $app.findRecordById('fin_reconcile_rules', String(body.rule_id || ''))
      } catch (_) {}
      if (!rule) return e.json(404, { message: 'Regra não encontrada.' })
      churchId = rule.getString('church_id')
    }

    let member = null
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        '',
        1,
        0,
        { c: churchId, u: auth.id },
      )
      member = rows.length ? rows[0] : null
    } catch (_) {}
    if (!member) return e.json(403, { message: 'Só quem cuida do financeiro vê as regras.' })
    const isMaster = member.getString('role') === 'MASTER'
    let perms = []
    let cong = []
    try {
      perms = JSON.parse(member.getString('permissions') || '[]') || []
      cong = JSON.parse(member.getString('cong_financeiro') || '[]') || []
    } catch (_) {}
    const canEdit = isMaster || perms.indexOf('financeiro.conciliacao.alterar') !== -1
    const canView = canEdit || perms.indexOf('financeiro.conciliacao.ver') !== -1
    if (!canView) return e.json(403, { message: 'Só quem cuida do financeiro vê as regras.' })
    const congOf = (accountId) => {
      try {
        return $app.findRecordById('fin_accounts', accountId).getString('congregation')
      } catch (_) {
        return ''
      }
    }
    const inCong = (accountId) => {
      if (isMaster || cong.indexOf('*') !== -1) return true
      const c = congOf(accountId)
      return !c || cong.indexOf(c) !== -1
    }

    if (action === 'list') {
      const rows = $app.findRecordsByFilter(
        'fin_reconcile_rules',
        'church_id = {:c}',
        '-auto,-hits,-last_used_at',
        500,
        0,
        { c: churchId },
      )
      const out = []
      for (const r of rows) {
        if (!inCong(r.getString('account_id'))) continue
        out.push({
          id: r.id,
          account_id: r.getString('account_id'),
          direction: r.getString('direction'),
          match_code: r.getString('match_code'),
          counterparty: r.getString('counterparty'),
          action: r.getString('action'),
          category_id: r.getString('category_id'),
          cost_center_id: r.getString('cost_center_id'),
          campaign_id: r.getString('campaign_id'),
          person_id: r.getString('person_id'),
          is_anonymous: r.getBool('is_anonymous'),
          supplier_id: r.getString('supplier_id'),
          transfer_account_id: r.getString('transfer_account_id'),
          payment_method: r.getString('payment_method'),
          example: r.getString('example'),
          hits: r.getInt('hits'),
          auto: r.getBool('auto'),
          auto_count: r.getInt('auto_count'),
          auto_by_name: r.getString('auto_by_name'),
          last_used_at: r.getString('last_used_at'),
        })
      }
      return e.json(200, { items: out })
    }

    if (!canEdit || !inCong(rule.getString('account_id'))) {
      return e.json(403, { message: 'Você só pode ver as regras.' })
    }
    if (action === 'auto') {
      const on = body.auto === true
      rule.set('auto', on)
      rule.set('auto_by_name', on ? auth.getString('name') || auth.getString('email') : '')
      $app.save(rule)
      return e.json(200, { success: true })
    }
    if (action === 'delete') {
      $app.delete(rule)
      return e.json(200, { success: true })
    }
    return e.json(404, { message: 'Ação desconhecida' })
  },
  $apis.requireAuth(),
)
