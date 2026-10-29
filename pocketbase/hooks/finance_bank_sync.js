// Busca automática de saldo e extrato pela API do banco (Cora e Bradesco)
//
// Os bancos exigem certificado digital do cliente (mTLS) em cada chamada, e o $http.send do
// PocketBase não envia certificado. Por isso quem fala com o banco é o conector bancário
// (pasta bank-sync/ do repositório), que conversa com estas rotas usando o cabeçalho
// x-bank-sync-token: a chave do conector gerada em Configurações > Integrações (vale só para
// aquela igreja) ou a variável de ambiente BANK_SYNC_TOKEN do servidor (vale para todas).
// As credenciais dos bancos cadastradas na mesma tela (fin_bank_secrets, cifradas) seguem
// para o conector junto com cada conta; sem elas ele usa as próprias variáveis de ambiente.
//
// GET  /backend/v1/finance/bank-sync/connections     (conector) contas ativas e o período a buscar;
//      com histórico pedido, também history: { from: 'YYYY-MM-DD' ou '' (o máximo), before }
//      (o conector busca de before para trás, em partes, até from)
// POST /backend/v1/finance/bank-sync/push            (conector) entrega o resultado de uma conta:
//      { connection_id, ok: true, balance_cents?, available_cents?, balance_at?,
//        start_date, end_date, lines: [{ id, date: 'YYYY-MM-DD', amount_cents, description }] }
//      { connection_id, ok: false, error }
//      { connection_id, ok: true, history: true, start_date, end_date, history_done?, lines }
//      (uma parte do histórico: não mexe no saldo nem na situação da última busca)
//      Grava os movimentos novos como linhas do extrato (o id do banco vira o FITID) e, quando
//      a conexão permite, concilia sozinho o movimento que tem um único lançamento igual.
//      Conta "só para ver o extrato" (purpose VISUALIZAR), ou movimento anterior a
//      reconcile_from, entra como EXTRATO: aparece no extrato e fica fora da conciliação.
// POST /backend/v1/finance/bank-sync/request         (usuário do financeiro) "Atualizar agora":
//      { church_id } marca as conexões da igreja e, se houver acesso ao GitHub (variáveis
//      BANK_SYNC_GITHUB_TOKEN e BANK_SYNC_GITHUB_REPO ou o cadastrado na tela de Integrações),
//      dispara o conector no GitHub Actions.

routerAdd('GET', '/backend/v1/finance/bank-sync/connections', (e) => {
  // Quem é o conector: o BANK_SYNC_TOKEN do servidor vale para todas as igrejas; a chave
  // gerada na tela de Integrações vale só para a igreja que a gerou (o banco guarda o hash)
  const given = e.request.header.get('x-bank-sync-token') || ''
  const expected = $os.getenv('BANK_SYNC_TOKEN') || ''
  // Chave errada fica registrada pelo IP; 10 erros em 15 minutos bloqueiam o IP
  const ip = e.realIP()
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ')
  const fails = $app.findRecordsByFilter(
    'fin_bank_audit',
    "event = 'CHAVE_INVALIDA' && ip = {:ip} && created >= {:s}",
    '',
    10,
    0,
    { ip: ip, s: since },
  )
  if (fails.length >= 10) {
    return e.json(429, { message: 'Muitas tentativas com chave inválida. Espere 15 minutos.' })
  }
  let scope = null
  // Comparação em tempo constante, para o tempo de resposta não revelar o token
  if (expected.length >= 32 && $security.equal(given, expected)) scope = '*'
  else if (given.length >= 32) {
    try {
      scope = $app
        .findFirstRecordByFilter('fin_bank_secrets', "kind = 'CONECTOR' && token_hash = {:h}", {
          h: $security.sha256(given),
        })
        .getString('church_id')
    } catch (_) {}
  }
  if (!scope) {
    try {
      const bad = new Record($app.findCollectionByNameOrId('fin_bank_audit'))
      bad.set('event', 'CHAVE_INVALIDA')
      bad.set('ip', ip)
      bad.set('detail', e.request.url.path)
      $app.save(bad)
    } catch (_) {}
    return e.json(401, { message: 'Chave do conector inválida.' })
  }
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)
  const day = 24 * 60 * 60 * 1000
  // Dia de hoje no horário de Brasília
  const now = Date.now() - 3 * 60 * 60 * 1000
  const rows =
    scope === '*'
      ? $app.findRecordsByFilter('fin_bank_connections', 'enabled = true', 'created', 500, 0)
      : $app.findRecordsByFilter(
          'fin_bank_connections',
          'enabled = true && church_id = {:c}',
          'created',
          500,
          0,
          { c: scope },
        )
  // Credenciais cadastradas na tela de Integrações (cifradas); sem elas o conector usa as
  // variáveis de ambiente / segredos do GitHub, como antes
  let encKey = ''
  try {
    encKey = $os.getenv('LOUVORFLOW_CREDENTIALS_KEY') || ''
  } catch (_) {}
  // Devolve { credentials, problem }: o problema explica por que não há credencial, para o
  // conector mostrar na conta (ambiente ou nome do conjunto que não bate, chave de cifragem)
  const credentialsFor = (c) => {
    const provider = c.getString('provider')
    const env = c.getString('environment')
    const ck = (c.getString('credential_key') || '').toUpperCase()
    const bank = provider === 'CORA' ? 'Cora' : 'Bradesco'
    const label = (e, k) => (e === 'TESTE' ? 'Teste' : 'Produção') + (k ? ' · ' + k : '')
    if (encKey.length !== 32) {
      return {
        credentials: null,
        problem: 'O servidor está sem a chave de cifragem (LOUVORFLOW_CREDENTIALS_KEY).',
      }
    }
    const sets = $app.findRecordsByFilter(
      'fin_bank_secrets',
      'church_id = {:c} && kind = {:k}',
      '',
      50,
      0,
      { c: c.getString('church_id'), k: provider },
    )
    let rec = null
    for (const r of sets) {
      if (r.getString('environment') === env && r.getString('credential_key') === ck) rec = r
    }
    if (!rec) {
      const have = sets.map((r) => label(r.getString('environment'), r.getString('credential_key')))
      return {
        credentials: null,
        problem:
          'Não há credencial da ' +
          bank +
          ' cadastrada em Integrações para ' +
          label(env, ck) +
          (ck ? '' : ' (sem nome)') +
          '. ' +
          (have.length
            ? 'Cadastradas: ' +
              have.join(', ') +
              '. Ajuste o ambiente ou o campo Credencial da conexão.'
            : 'Nenhuma cadastrada para este banco.'),
      }
    }
    try {
      const d = JSON.parse(rec.getString('data') || 'null')
      const v = JSON.parse($security.decrypt(d.data, encKey)) || {}
      if (!v.client_id || !v.cert || !v.key) throw new Error('incompleta')
      return {
        credentials: {
          client_id: v.client_id || '',
          client_secret: v.client_secret || '',
          cert: v.cert || '',
          key: v.key || '',
        },
        problem: '',
      }
    } catch (_) {
      return {
        credentials: null,
        problem:
          'A credencial da ' +
          bank +
          ' (' +
          label(env, ck) +
          ') não pôde ser aberta. Cadastre de novo em Integrações.',
      }
    }
  }
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
    // Histórico pedido (desde uma data ou o máximo) e ainda não terminado
    const target = c.getBool('history_max') ? 'MAX' : c.getString('history_from').slice(0, 10)
    let history = null
    if (target && c.getString('history_done_for') !== target) {
      const before = c.getString('history_loaded_from').slice(0, 10) || from
      if (target === 'MAX' || before > target) {
        history = { from: target === 'MAX' ? '' : target, before: before }
      }
    }
    const cred = credentialsFor(c)
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
      credentials: cred.credentials,
      credentials_problem: cred.problem,
      from: from,
      to: ymd(now),
      history: history,
    })
  }
  // Cada entrega de credenciais ao conector fica no registro de segurança da igreja
  const delivered = {}
  for (const c of out) {
    if (c.credentials) delivered[c.church_id] = (delivered[c.church_id] || 0) + 1
  }
  for (const church in delivered) {
    try {
      const log = new Record($app.findCollectionByNameOrId('fin_bank_audit'))
      log.set('church_id', church)
      log.set('event', 'CONECTOR_LEU')
      log.set('ip', ip)
      log.set('user_name', 'Conector bancário')
      log.set('detail', 'Credenciais de ' + delivered[church] + ' conta(s)')
      $app.save(log)
    } catch (_) {}
  }
  return e.json(200, { connections: out })
})

routerAdd('POST', '/backend/v1/finance/bank-sync/push', (e) => {
  // Quem é o conector: o BANK_SYNC_TOKEN do servidor vale para todas as igrejas; a chave
  // gerada na tela de Integrações vale só para a igreja que a gerou (o banco guarda o hash)
  const given = e.request.header.get('x-bank-sync-token') || ''
  const expected = $os.getenv('BANK_SYNC_TOKEN') || ''
  // Chave errada fica registrada pelo IP; 10 erros em 15 minutos bloqueiam o IP
  const ip = e.realIP()
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ')
  const fails = $app.findRecordsByFilter(
    'fin_bank_audit',
    "event = 'CHAVE_INVALIDA' && ip = {:ip} && created >= {:s}",
    '',
    10,
    0,
    { ip: ip, s: since },
  )
  if (fails.length >= 10) {
    return e.json(429, { message: 'Muitas tentativas com chave inválida. Espere 15 minutos.' })
  }
  let scope = null
  // Comparação em tempo constante, para o tempo de resposta não revelar o token
  if (expected.length >= 32 && $security.equal(given, expected)) scope = '*'
  else if (given.length >= 32) {
    try {
      scope = $app
        .findFirstRecordByFilter('fin_bank_secrets', "kind = 'CONECTOR' && token_hash = {:h}", {
          h: $security.sha256(given),
        })
        .getString('church_id')
    } catch (_) {}
  }
  if (!scope) {
    try {
      const bad = new Record($app.findCollectionByNameOrId('fin_bank_audit'))
      bad.set('event', 'CHAVE_INVALIDA')
      bad.set('ip', ip)
      bad.set('detail', e.request.url.path)
      $app.save(bad)
    } catch (_) {}
    return e.json(401, { message: 'Chave do conector inválida.' })
  }
  const body = e.requestInfo().body || {}
  let conn = null
  try {
    conn = $app.findRecordById('fin_bank_connections', String(body.connection_id || ''))
  } catch (_) {}
  if (!conn || (scope !== '*' && conn.getString('church_id') !== scope)) {
    return e.json(404, { message: 'Conexão não encontrada' })
  }

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
  const isHistory = body.history === true
  const hasBalance =
    !isHistory && body.balance_cents !== null && Number.isInteger(Number(body.balance_cents))
  // Só no extrato: conta para ver o extrato ou movimento antes do início da conciliação
  const viewOnly = conn.getString('purpose') === 'VISUALIZAR'
  const reconcileFrom = conn.getString('reconcile_from').slice(0, 10)
  const statusFor = (ymd) =>
    viewOnly || (reconcileFrom && ymd < reconcileFrom) ? 'EXTRATO' : 'PENDENTE'

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
          imp.set('file_name', 'API ' + label + (isHistory ? ' (histórico)' : ''))
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
        rec.set('status', statusFor(l.date))
        txApp.save(rec)
        if (rec.getString('status') === 'PENDENTE') newLines.push(rec)
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
      // Até onde o extrato já foi buscado; o histórico termina quando chega na data pedida
      // ou quando o conector avisa que o banco não tem nada mais antigo
      const target = fresh.getBool('history_max')
        ? 'MAX'
        : fresh.getString('history_from').slice(0, 10)
      const loaded = fresh.getString('history_loaded_from').slice(0, 10)
      if (isYmd(body.start_date) && (!loaded || body.start_date < loaded)) {
        fresh.set('history_loaded_from', pbDate(body.start_date))
      }
      const reached = fresh.getString('history_loaded_from').slice(0, 10)
      if (
        target &&
        ((isHistory && body.history_done === true) ||
          (target !== 'MAX' && reached && reached <= target))
      ) {
        fresh.set('history_done_for', target)
      }
      if (target === 'MAX' && isHistory && body.history_done === true) {
        // Mostra na tela a data do movimento mais antigo, não a da última parte vazia
        const oldest = txApp.findRecordsByFilter(
          'fin_bank_lines',
          'account_id = {:a}',
          'date',
          1,
          0,
          { a: accountId },
        )
        if (oldest.length) fresh.set('history_loaded_from', oldest[0].getString('date'))
      }
      if (isHistory) {
        txApp.save(fresh)
        return
      }
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
    let token = $os.getenv('BANK_SYNC_GITHUB_TOKEN') || ''
    let repo = $os.getenv('BANK_SYNC_GITHUB_REPO') || ''
    if (!token || !repo) {
      // Acesso ao GitHub cadastrado na tela de Integrações (cifrado)
      try {
        const k = $os.getenv('LOUVORFLOW_CREDENTIALS_KEY') || ''
        const rec = $app.findFirstRecordByFilter(
          'fin_bank_secrets',
          "church_id = {:c} && kind = 'CONECTOR'",
          { c: churchId },
        )
        const d = JSON.parse(rec.getString('data') || 'null')
        if (k.length === 32 && d && d.enc === 'v1') {
          const v = JSON.parse($security.decrypt(d.data, k)) || {}
          token = v.github_token || ''
          repo = v.github_repo || ''
        }
      } catch (_) {}
    }
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

// A conexão passou a conciliar (ou mudou a data de início da conciliação): os movimentos que
// vieram da API passam de "só no extrato" para "a conciliar" e vice-versa. Conciliados,
// ignorados e os que vieram de arquivo OFX não mudam.
onRecordUpdateRequest((e) => {
  const old = e.record.original()
  const changed =
    old.getString('purpose') !== e.record.getString('purpose') ||
    old.getString('reconcile_from') !== e.record.getString('reconcile_from')
  e.next()
  if (!changed) return
  const conn = e.record
  const viewOnly = conn.getString('purpose') === 'VISUALIZAR'
  const reconcileFrom = conn.getString('reconcile_from').slice(0, 10)
  const statusFor = (ymd) =>
    viewOnly || (reconcileFrom && ymd < reconcileFrom) ? 'EXTRATO' : 'PENDENTE'
  e.app.runInTransaction((txApp) => {
    const lines = txApp.findRecordsByFilter(
      'fin_bank_lines',
      "account_id = {:a} && (status = 'PENDENTE' || status = 'EXTRATO') && fitid ~ 'api:%'",
      '',
      0,
      0,
      { a: conn.getString('account_id') },
    )
    for (const l of lines) {
      const next = statusFor(l.getString('date').slice(0, 10))
      if (l.getString('status') === next) continue
      l.set('status', next)
      txApp.save(l)
    }
  })
}, 'fin_bank_connections')

// O agendamento do GitHub Actions atrasa ou pula rodadas quando o GitHub está cheio. Com o
// acesso ao GitHub cadastrado (Integrações ou variáveis BANK_SYNC_GITHUB_*), o próprio servidor
// dispara o conector de hora em hora, das 7h às 22h no horário de Brasília (10h às 1h UTC).
// O agendamento do GitHub continua valendo como reserva.
cronAdd('bank_sync_dispatch', '40 0,1,10-23 * * *', () => {
  const targets = {}
  const envToken = $os.getenv('BANK_SYNC_GITHUB_TOKEN') || ''
  const envRepo = $os.getenv('BANK_SYNC_GITHUB_REPO') || ''
  if (envToken && envRepo) targets[envRepo] = envToken
  const k = $os.getenv('LOUVORFLOW_CREDENTIALS_KEY') || ''
  if (k.length === 32) {
    const recs = $app.findRecordsByFilter('fin_bank_secrets', "kind = 'CONECTOR'", '', 100, 0)
    for (const rec of recs) {
      // Só igrejas com alguma conta ligada ao banco
      const conns = $app.findRecordsByFilter(
        'fin_bank_connections',
        'church_id = {:c} && enabled = true',
        '',
        1,
        0,
        { c: rec.getString('church_id') },
      )
      if (!conns.length) continue
      try {
        const d = JSON.parse(rec.getString('data') || 'null')
        if (!d || d.enc !== 'v1') continue
        const v = JSON.parse($security.decrypt(d.data, k)) || {}
        if (v.github_token && v.github_repo && !targets[v.github_repo]) {
          targets[v.github_repo] = v.github_token
        }
      } catch (_) {}
    }
  }
  // Um disparo por repositório: uma rodada do conector busca todas as contas
  for (const repo in targets) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) continue
    try {
      const res = $http.send({
        method: 'POST',
        url: 'https://api.github.com/repos/' + repo + '/actions/workflows/bank-sync.yml/dispatches',
        headers: {
          Authorization: 'Bearer ' + targets[repo],
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'louvorflow',
        },
        body: JSON.stringify({ ref: $os.getenv('BANK_SYNC_GITHUB_REF') || 'main' }),
        timeout: 15,
      })
      if (res.statusCode !== 204) console.log('bank-sync cron: GitHub respondeu ' + res.statusCode)
    } catch (err) {
      console.log('bank-sync cron: não foi possível disparar o conector: ' + err)
    }
  }
})
