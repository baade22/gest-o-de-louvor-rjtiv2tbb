// Busca automática de saldo e extrato pela API do banco (Cora e Bradesco)
//
// Os bancos exigem certificado digital do cliente (mTLS) em cada chamada, e o $http.send do
// PocketBase não envia certificado. Por isso quem fala com o banco é o conector bancário
// (pasta bank-sync/ do repositório), que guarda as credenciais e conversa com estas rotas
// usando o cabeçalho x-bank-sync-token = variável de ambiente BANK_SYNC_TOKEN do servidor
// (no mínimo 32 caracteres aleatórios).
//
// GET  /backend/v1/finance/bank-sync/connections     (conector) contas ativas e o período a buscar
// POST /backend/v1/finance/bank-sync/push            (conector) entrega o resultado de uma conta:
//      { connection_id, ok: true, balance_cents?, available_cents?, balance_at?,
//        start_date, end_date, lines: [{ id, date: 'YYYY-MM-DD', amount_cents, description }] }
//      { connection_id, ok: false, error }
//      Grava os movimentos novos como linhas do extrato (o id do banco vira o FITID) e, quando
//      a conexão permite, concilia sozinho o movimento que tem um único lançamento igual.
// POST /backend/v1/finance/bank-sync/request         (usuário do financeiro) "Atualizar agora":
//      { church_id } marca as conexões da igreja e, se o servidor tiver BANK_SYNC_GITHUB_TOKEN
//      e BANK_SYNC_GITHUB_REPO, dispara o conector no GitHub Actions.

routerAdd('GET', '/backend/v1/finance/bank-sync/connections', (e) => {
  const expected = $os.getenv('BANK_SYNC_TOKEN') || ''
  if (expected.length < 32) {
    return e.json(503, { message: 'BANK_SYNC_TOKEN não configurado no servidor.' })
  }
  // Comparação em tempo constante, para o tempo de resposta não revelar o token
  if (!$security.equal(e.request.header.get('x-bank-sync-token') || '', expected)) {
    return e.json(401, { message: 'Token do conector inválido.' })
  }
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)
  const day = 24 * 60 * 60 * 1000
  // Dia de hoje no horário de Brasília
  const now = Date.now() - 3 * 60 * 60 * 1000
  const rows = $app.findRecordsByFilter('fin_bank_connections', 'enabled = true', 'created', 500, 0)
  const out = []
  for (const c of rows) {
    let accountName = ''
    try {
      const acc = $app.findRecordById('fin_accounts', c.getString('account_id'))
      if (!acc.getBool('is_active')) continue
      accountName = acc.getString('name')
    } catch (_) {
      continue
    }
    const last = c.getString('last_sync_at')
    const initial = c.getInt('initial_days') || 30
    // Depois da primeira busca, volta 5 dias para pegar o que o banco lançou com atraso
    const from = last
      ? ymd(new Date(last.slice(0, 10) + 'T12:00:00Z').getTime() - 5 * day)
      : ymd(now - initial * day)
    out.push({
      id: c.id,
      church_id: c.getString('church_id'),
      account_id: c.getString('account_id'),
      account_name: accountName,
      provider: c.getString('provider'),
      environment: c.getString('environment'),
      branch: c.getString('branch'),
      account_number: c.getString('account_number'),
      account_type: c.getString('account_type') || 'CC',
      credential_key: c.getString('credential_key'),
      from: from,
      to: ymd(now),
    })
  }
  return e.json(200, { connections: out })
})

routerAdd('POST', '/backend/v1/finance/bank-sync/push', (e) => {
  const expected = $os.getenv('BANK_SYNC_TOKEN') || ''
  if (expected.length < 32) {
    return e.json(503, { message: 'BANK_SYNC_TOKEN não configurado no servidor.' })
  }
  // Comparação em tempo constante, para o tempo de resposta não revelar o token
  if (!$security.equal(e.request.header.get('x-bank-sync-token') || '', expected)) {
    return e.json(401, { message: 'Token do conector inválido.' })
  }
  const body = e.requestInfo().body || {}
  let conn = null
  try {
    conn = $app.findRecordById('fin_bank_connections', String(body.connection_id || ''))
  } catch (_) {}
  if (!conn) return e.json(404, { message: 'Conexão não encontrada' })

  const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
  const pbDate = (ymd) => ymd + ' 12:00:00.000Z'
  const nowIso = new Date().toISOString().replace('T', ' ')
  const provider = conn.getString('provider')
  const label = provider === 'CORA' ? 'Cora' : 'Bradesco'

  if (body.ok !== true) {
    conn.set('last_status', 'ERRO')
    // O conector já tira os segredos; aqui tira de novo o que tiver cara de token
    const clean = String(body.error || 'Erro desconhecido')
      .replace(/bearer\s+\S+/gi, 'Bearer ***')
      .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '***')
      .replace(/("?(access_token|client_secret|token)"?\s*[:=]\s*"?)[^"&,\s}]+/gi, '$1***')
    conn.set('last_error', clean.slice(0, 500))
    conn.set('sync_requested_at', '')
    $app.save(conn)
    return e.json(200, { success: true })
  }

  const lines = Array.isArray(body.lines) ? body.lines : []
  if (lines.length > 5000) return e.json(400, { message: 'Movimentos demais numa entrega.' })
  for (const l of lines) {
    if (!String(l.id || '').trim() || !isYmd(l.date) || !Number.isInteger(Number(l.amount_cents))) {
      return e.json(400, { message: 'Movimento inválido: ' + JSON.stringify(l).slice(0, 200) })
    }
  }
  const churchId = conn.getString('church_id')
  const accountId = conn.getString('account_id')
  const prefix = 'api:' + provider.toLowerCase() + ':'
  const hasBalance = body.balance_cents !== null && Number.isInteger(Number(body.balance_cents))

  let created = 0
  let skipped = 0
  let auto = 0
  try {
    $app.runInTransaction((txApp) => {
      const linesCol = txApp.findCollectionByNameOrId('fin_bank_lines')
      const newLines = []
      let imp = null
      for (const l of lines) {
        const fitid = (prefix + String(l.id).trim()).slice(0, 255)
        const amount = Number(l.amount_cents)
        if (amount === 0) {
          skipped++
          continue
        }
        let exists = false
        try {
          txApp.findFirstRecordByFilter('fin_bank_lines', 'account_id = {:a} && fitid = {:f}', {
            a: accountId,
            f: fitid,
          })
          exists = true
        } catch (_) {}
        if (exists) {
          skipped++
          continue
        }
        // O mesmo movimento pode já ter entrado por um arquivo OFX (com outro FITID):
        // cada linha do OFX no mesmo dia e valor "cobre" uma linha da API
        const same = txApp.findRecordsByFilter(
          'fin_bank_lines',
          'account_id = {:a} && date = {:d} && amount_cents = {:v}',
          '',
          0,
          0,
          { a: accountId, d: pbDate(l.date), v: amount },
        )
        let fromApi = 0
        for (const s of same) if (s.getString('fitid').indexOf('api:') === 0) fromApi++
        if (same.length - fromApi > fromApi) {
          skipped++
          continue
        }
        if (!imp) {
          imp = new Record(txApp.findCollectionByNameOrId('fin_bank_imports'))
          imp.set('church_id', churchId)
          imp.set('account_id', accountId)
          imp.set('file_name', 'API ' + label)
          if (isYmd(body.start_date)) imp.set('start_date', pbDate(body.start_date))
          if (isYmd(body.end_date)) imp.set('end_date', pbDate(body.end_date))
          if (hasBalance) {
            imp.set('balance_cents', Number(body.balance_cents))
            imp.set('has_balance', true)
            if (isYmd(body.end_date)) imp.set('balance_date', pbDate(body.end_date))
          }
          imp.set('imported_by_name', 'Conector bancário')
          txApp.save(imp)
        }
        const rec = new Record(linesCol)
        rec.set('church_id', churchId)
        rec.set('account_id', accountId)
        rec.set('import_id', imp.id)
        rec.set('fitid', fitid)
        rec.set('date', pbDate(l.date))
        rec.set('amount_cents', amount)
        rec.set('description', String(l.description || 'Movimento').slice(0, 500))
        rec.set('status', 'PENDENTE')
        txApp.save(rec)
        newLines.push(rec)
        created++
      }
      if (imp) {
        imp.set('lines_created', created)
        imp.set('lines_skipped', skipped)
        txApp.save(imp)
      }

      // Conciliação automática: só quando há exatamente um lançamento confirmado, sem
      // conciliação, com o mesmo valor e sentido em até 3 dias, e nenhum outro movimento
      // pendente igual disputando esse lançamento.
      if (conn.getBool('auto_reconcile')) {
        const day = 24 * 60 * 60 * 1000
        const shift = (ymd, n) =>
          new Date(new Date(ymd + 'T12:00:00Z').getTime() + n * day).toISOString().slice(0, 10)
        for (const line of newLines) {
          const amount = line.getInt('amount_cents')
          const date = line.getString('date').slice(0, 10)
          const side =
            amount > 0
              ? "((type = 'ENTRADA' && account_id = {:a}) || (type = 'TRANSFERENCIA' && to_account_id = {:a}))"
              : "((type = 'SAIDA' || type = 'TRANSFERENCIA') && account_id = {:a})"
          const cands = txApp.findRecordsByFilter(
            'fin_transactions',
            "church_id = {:c} && status = 'CONFIRMADO' && bank_line_id = '' && amount_cents = {:v}" +
              ' && date >= {:from} && date <= {:to} && ' +
              side,
            '',
            2,
            0,
            {
              c: churchId,
              a: accountId,
              v: Math.abs(amount),
              from: shift(date, -3) + ' 00:00:00.000Z',
              to: shift(date, 3) + ' 23:59:59.999Z',
            },
          )
          if (cands.length !== 1) continue
          const tx = cands[0]
          const txDate = tx.getString('date').slice(0, 10)
          const rivals = txApp.findRecordsByFilter(
            'fin_bank_lines',
            "account_id = {:a} && status = 'PENDENTE' && amount_cents = {:v} && date >= {:from} && date <= {:to}",
            '',
            2,
            0,
            {
              a: accountId,
              v: amount,
              from: shift(txDate, -3) + ' 00:00:00.000Z',
              to: shift(txDate, 3) + ' 23:59:59.999Z',
            },
          )
          if (rivals.length !== 1) continue
          tx.set('bank_line_id', line.id)
          txApp.save(tx)
          line.set('status', 'CONCILIADO')
          line.set('transaction_id', tx.id)
          line.set('reconciled_at', nowIso)
          line.set('reconciled_by_name', 'Automático (API ' + label + ')')
          txApp.save(line)
          auto++
        }
      }

      const fresh = txApp.findRecordById('fin_bank_connections', conn.id)
      fresh.set('last_sync_at', nowIso)
      fresh.set('last_status', 'OK')
      fresh.set('last_error', '')
      fresh.set('last_created', created)
      fresh.set('last_auto_reconciled', auto)
      fresh.set('sync_requested_at', '')
      if (hasBalance) {
        fresh.set('balance_cents', Number(body.balance_cents))
        fresh.set('has_balance', true)
        fresh.set(
          'available_cents',
          Number.isInteger(Number(body.available_cents)) && body.available_cents !== null
            ? Number(body.available_cents)
            : Number(body.balance_cents),
        )
        fresh.set('balance_at', String(body.balance_at || nowIso))
      }
      txApp.save(fresh)
    })
  } catch (err) {
    return e.json(400, { message: 'Não foi possível gravar o extrato: ' + err.message })
  }
  return e.json(200, { created: created, skipped: skipped, auto_reconciled: auto })
})

routerAdd(
  'POST',
  '/backend/v1/finance/bank-sync/request',
  (e) => {
    const authRecord = e.auth
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    let member = null
    try {
      member = $app.findFirstRecordByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        { c: churchId, u: authRecord.id },
      )
    } catch (_) {}
    let perms = []
    try {
      perms = JSON.parse((member && member.getString('permissions')) || '[]') || []
    } catch (_) {}
    if (
      !member ||
      (member.getString('role') !== 'MASTER' &&
        perms.indexOf('financeiro.conciliacao.alterar') === -1)
    ) {
      return e.json(403, { message: 'Só quem cuida do financeiro pode atualizar os saldos.' })
    }
    const conns = $app.findRecordsByFilter(
      'fin_bank_connections',
      'church_id = {:c} && enabled = true',
      '',
      100,
      0,
      { c: churchId },
    )
    if (conns.length === 0) {
      return e.json(400, { message: 'Nenhuma conta está conectada à API do banco.' })
    }
    const nowIso = new Date().toISOString().replace('T', ' ')
    for (const c of conns) {
      c.set('sync_requested_at', nowIso)
      $app.save(c)
    }
    const token = $os.getenv('BANK_SYNC_GITHUB_TOKEN') || ''
    const repo = $os.getenv('BANK_SYNC_GITHUB_REPO') || ''
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      // Sem disparo remoto: o conector pega o pedido na próxima rodada agendada
      return e.json(200, { dispatched: false })
    }
    try {
      const res = $http.send({
        method: 'POST',
        url: 'https://api.github.com/repos/' + repo + '/actions/workflows/bank-sync.yml/dispatches',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'louvorflow',
        },
        body: JSON.stringify({ ref: $os.getenv('BANK_SYNC_GITHUB_REF') || 'main' }),
        timeout: 15,
      })
      if (res.statusCode !== 204) {
        console.log('bank-sync: GitHub respondeu ' + res.statusCode)
        return e.json(200, { dispatched: false })
      }
    } catch (err) {
      console.log('bank-sync: não foi possível disparar o conector: ' + err)
      return e.json(200, { dispatched: false })
    }
    return e.json(200, { dispatched: true })
  },
  $apis.requireAuth(),
)
