// Fechamento do mês (Financeiro)
//
// POST /backend/v1/finance/closing
// Body: { church_id, action: 'check' | 'close' | 'reopen', month?: 'AAAA-MM', notes?, reason? }
// - check: conferência e resumo do mês (MASTER ou quem vê o financeiro).
// - close: fecha o mês (MASTER ou FINANCEIRO). Trava tudo até o fim dele. Precisa ser um mês
//   que já acabou, depois do último fechado, e sem pendências que bloqueiam (contagem sem
//   2ª conferência e movimento do extrato sem conciliar).
// - reopen: reabre o último mês fechado (só MASTER, com motivo). A trava volta para o
//   fechamento anterior.
//
// Também aqui: a trava. Lançamento, contagem ou saldo inicial de conta com data num mês
// fechado não é criado nem alterado (só dá para anexar comprovante e conciliar com o extrato).

routerAdd(
  'POST',
  '/backend/v1/finance/closing',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const action = String(body.action || 'check')
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })
    if (['check', 'close', 'reopen'].indexOf(action) === -1) {
      return e.json(400, { message: 'Ação desconhecida' })
    }

    let member = null
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: auth.id },
      )
      member = rows.length ? rows[0] : null
    } catch (_) {}
    if (!member) return e.json(403, { message: 'Sem acesso ao financeiro desta igreja.' })
    const role = member.getString('role')
    let perms = []
    let cong = []
    try {
      perms = JSON.parse(member.getString('permissions') || '[]') || []
      cong = JSON.parse(member.getString('cong_financeiro') || '[]') || []
    } catch (_) {}
    // Perfis de acesso: conferir = qualquer tela do financeiro; fechar = fechamento.fechar
    // valendo para todas as congregações (o fechamento é da igreja inteira)
    const isFin = perms.indexOf('financeiro.fechamento.fechar') !== -1 && cong.indexOf('*') !== -1
    const canSee = perms.some((k) => String(k).indexOf('financeiro.') === 0)
    if (role !== 'MASTER' && !canSee) {
      return e.json(403, { message: 'Sem acesso ao financeiro desta igreja.' })
    }

    const userName = auth.getString('name') || auth.getString('email')
    const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
    const shift = (ym, delta) => {
      const y = Number(ym.slice(0, 4))
      const m = Number(ym.slice(5, 7))
      const i = y * 12 + (m - 1) + delta
      return Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0')
    }
    // Hoje no horário de Brasília
    const todayBrt = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
    const currentMonth = todayBrt.slice(0, 7)
    const dayStart = (ymd) => ymd + ' 00:00:00.000Z'
    const ymdOf = (d) => String(d || '').slice(0, 10)
    const list = (collection, filter, params, sort) => {
      try {
        return $app.findRecordsByFilter(collection, filter, sort || '', 0, 0, params)
      } catch (_) {
        return []
      }
    }

    const closings = list('fin_closings', 'church_id = {:c}', { c: churchId }, '-month,-created')
    const active = closings.filter((r) => r.getString('status') === 'FECHADO')
    const lockedUntil = active.length ? active[0].getString('month') : ''

    if (action === 'reopen') {
      if (role !== 'MASTER') {
        return e.json(403, { message: 'Só o MASTER reabre um mês fechado.' })
      }
      const reason = String(body.reason || '').trim()
      if (reason.length < 5) {
        return e.json(400, {
          message: 'Explique por que o mês vai ser reaberto.',
        })
      }
      if (!active.length) return e.json(400, { message: 'Nenhum mês fechado.' })
      const last = active[0]
      last.set('status', 'REABERTO')
      last.set('reopened_by', auth.id)
      last.set('reopened_by_name', userName)
      last.set('reopened_at', new Date().toISOString().replace('T', ' '))
      last.set('reopen_reason', reason.slice(0, 500))
      $app.save(last)
      return e.json(200, {
        reopened: last.getString('month'),
        locked_until: active.length > 1 ? active[1].getString('month') : '',
      })
    }

    const month = String(body.month || '').trim()
    if (!isMonth(month)) return e.json(400, { message: 'Mês inválido (use AAAA-MM).' })

    // Período conferido: do mês seguinte ao último fechado até o mês escolhido
    const fromMonth = lockedUntil ? shift(lockedUntil, 1) : ''
    const rangeStart = fromMonth ? dayStart(fromMonth + '-01') : dayStart('1900-01-01')
    const monthStart = dayStart(month + '-01')
    const monthEnd = dayStart(shift(month, 1) + '-01')
    const range = { c: churchId, s: rangeStart, e: monthEnd }

    // ---- Resumo do mês (saldo de cada conta no início e no fim) ----
    const accounts = list('fin_accounts', 'church_id = {:c}', { c: churchId }, 'name')
    const txs = list(
      'fin_transactions',
      "church_id = {:c} && status = 'CONFIRMADO' && date < {:e}",
      { c: churchId, e: monthEnd },
    )
    const balanceAt = (accountId, before) => {
      const acc = accounts.find((a) => a.id === accountId)
      let total = acc ? acc.getInt('opening_balance_cents') : 0
      for (const t of txs) {
        if (t.getString('date') >= before) continue
        const amount = t.getInt('amount_cents')
        const type = t.getString('type')
        if (type === 'TRANSFERENCIA') {
          if (t.getString('account_id') === accountId) total -= amount
          if (t.getString('to_account_id') === accountId) total += amount
        } else if (t.getString('account_id') === accountId) {
          total += type === 'SAIDA' ? -amount : amount
        }
      }
      return total
    }
    const summaryAccounts = []
    const totals = { opening: 0, income: 0, expense: 0, closing: 0 }
    for (const a of accounts) {
      let income = 0
      let expense = 0
      let moved = false
      for (const t of txs) {
        const d = t.getString('date')
        if (d < monthStart) continue
        const type = t.getString('type')
        const amount = t.getInt('amount_cents')
        if (type === 'TRANSFERENCIA') {
          if (t.getString('account_id') === a.id || t.getString('to_account_id') === a.id) {
            moved = true
          }
          continue
        }
        if (t.getString('account_id') !== a.id) continue
        moved = true
        if (type === 'SAIDA') expense += amount
        else income += amount
      }
      const opening = balanceAt(a.id, monthStart)
      const closing = balanceAt(a.id, monthEnd)
      if (!a.getBool('is_active') && !moved && opening === 0 && closing === 0) continue
      summaryAccounts.push({
        id: a.id,
        name: a.getString('name'),
        kind: a.getString('kind'),
        congregation: a.getString('congregation'),
        opening_cents: opening,
        income_cents: income,
        expense_cents: expense,
        closing_cents: closing,
      })
      totals.opening += opening
      totals.income += income
      totals.expense += expense
      totals.closing += closing
    }

    // ---- Conferência ----
    const items = []
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many)
    const money = (c) => {
      const v = (Math.abs(c) / 100).toFixed(2).split('.')
      return (c < 0 ? '-' : '') + 'R$ ' + v[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + v[1]
    }
    const br = (d) => {
      const s = ymdOf(d)
      return s.slice(8, 10) + '/' + s.slice(5, 7)
    }

    const countsPending = list(
      'fin_counts',
      "church_id = {:c} && status = 'CONTADO' && date >= {:s} && date < {:e}",
      range,
      'date',
    )
    const countsApproved = list(
      'fin_counts',
      "church_id = {:c} && status = 'APROVADO' && date >= {:s} && date < {:e}",
      range,
    )
    items.push({
      key: 'counts',
      level: countsPending.length ? 'blocking' : 'ok',
      title: countsPending.length
        ? plural(countsPending.length, 'contagem do culto', 'contagens do culto') +
          ' sem 2ª conferência'
        : 'Contagens dos cultos aprovadas',
      detail: countsPending.length
        ? countsPending
            .slice(0, 5)
            .map((r) => br(r.getString('date')))
            .join(', ')
        : plural(countsApproved.length, 'contagem aprovada', 'contagens aprovadas') + ' no período',
      count: countsPending.length,
      link: '/financeiro/contagem',
    })

    const linesPending = list(
      'fin_bank_lines',
      "church_id = {:c} && status = 'PENDENTE' && date >= {:s} && date < {:e}",
      range,
      'date',
    )
    items.push({
      key: 'bank_lines',
      level: linesPending.length ? 'blocking' : 'ok',
      title: linesPending.length
        ? plural(linesPending.length, 'movimento', 'movimentos') + ' do extrato sem conciliar'
        : 'Extrato conciliado',
      detail: linesPending.length
        ? linesPending
            .slice(0, 4)
            .map(
              (l) =>
                br(l.getString('date')) +
                ' ' +
                (l.getString('description') || '').slice(0, 40) +
                ' ' +
                money(l.getInt('amount_cents')),
            )
            .join(' · ')
        : 'Nenhum movimento pendente no período',
      count: linesPending.length,
      link: '/financeiro/conciliacao',
    })

    // Saldo do extrato (OFX ou API) com data dentro do mês × saldo do LouvorFlow no mesmo dia
    const imports = list(
      'fin_bank_imports',
      'church_id = {:c} && has_balance = true && balance_date >= {:m} && balance_date < {:e}',
      { c: churchId, m: monthStart, e: monthEnd },
      '-balance_date',
    )
    const seen = {}
    const diffs = []
    const matched = []
    for (const imp of imports) {
      const accId = imp.getString('account_id')
      if (seen[accId]) continue
      seen[accId] = true
      const acc = accounts.find((a) => a.id === accId)
      if (!acc) continue
      const day = ymdOf(imp.getString('balance_date'))
      const next = new Date(day + 'T12:00:00Z')
      next.setUTCDate(next.getUTCDate() + 1)
      const ours = balanceAt(accId, dayStart(next.toISOString().slice(0, 10)))
      const theirs = imp.getInt('balance_cents')
      if (ours === theirs) matched.push(acc.getString('name') + ' em ' + br(day))
      else
        diffs.push(
          acc.getString('name') +
            ': banco ' +
            money(theirs) +
            ', LouvorFlow ' +
            money(ours) +
            ' em ' +
            br(day),
        )
    }
    items.push({
      key: 'bank_balance',
      level: diffs.length ? 'warning' : matched.length ? 'ok' : 'info',
      title: diffs.length
        ? 'Saldo diferente do banco em ' + plural(diffs.length, 'conta', 'contas')
        : matched.length
          ? 'Saldo igual ao do banco'
          : 'Sem extrato com saldo neste mês para comparar',
      detail: diffs.length
        ? diffs.join(' · ')
        : matched.length
          ? matched.join(' · ')
          : 'Importe o extrato (OFX) ou conecte o banco para conferir o saldo.',
      count: diffs.length,
      link: '/financeiro/saldos',
    })

    const billsOpen = list(
      'fin_bills',
      "church_id = {:c} && status = 'ABERTO' && due_date >= {:s} && due_date < {:e}",
      range,
      'due_date',
    )
    items.push({
      key: 'bills',
      level: billsOpen.length ? 'warning' : 'ok',
      title: billsOpen.length
        ? plural(billsOpen.length, 'conta vencida', 'contas vencidas') + ' sem baixa'
        : 'Nenhuma conta vencida sem baixa',
      detail: billsOpen.length
        ? billsOpen
            .slice(0, 4)
            .map(
              (b) =>
                (b.getString('description') || '').slice(0, 40) +
                ' ' +
                money(b.getInt('amount_cents')),
            )
            .join(' · ')
        : 'Contas a pagar e receber em dia',
      count: billsOpen.length,
      link: '/financeiro/contas',
    })

    const expenses = list(
      'fin_transactions',
      "church_id = {:c} && status = 'CONFIRMADO' && type = 'SAIDA' && attachment = '' && date >= {:s} && date < {:e}",
      range,
      'date',
    ).filter((t) => {
      const billId = t.getString('bill_id')
      if (!billId) return true
      try {
        return !$app.findRecordById('fin_bills', billId).getString('attachment')
      } catch (_) {
        return true
      }
    })
    items.push({
      key: 'receipts',
      level: expenses.length ? 'warning' : 'ok',
      title: expenses.length
        ? plural(expenses.length, 'despesa', 'despesas') + ' sem comprovante'
        : 'Todas as despesas com comprovante',
      detail: expenses.length
        ? expenses
            .slice(0, 4)
            .map(
              (t) =>
                (
                  t.getString('description') ||
                  (() => {
                    try {
                      return $app
                        .findRecordById('fin_suppliers', t.getString('supplier_id'))
                        .getString('name')
                    } catch (_) {
                      return 'Sem descrição'
                    }
                  })()
                ).slice(0, 40) +
                ' ' +
                money(t.getInt('amount_cents')),
            )
            .join(' · ')
        : 'Nada a anexar',
      count: expenses.length,
      link: '/financeiro/lancamentos',
    })

    const blocking = items.filter((i) => i.level === 'blocking').length
    const problems = []
    if (month >= currentMonth) problems.push('O mês ainda não terminou.')
    if (lockedUntil && month <= lockedUntil) problems.push('Este mês já está fechado.')
    if (blocking) problems.push('Resolva as pendências marcadas em vermelho.')
    const canWrite = role === 'MASTER' || isFin
    if (!canWrite) problems.push('Só quem cuida do financeiro fecha o mês.')

    const result = {
      month: month,
      from_month: fromMonth,
      locked_until: lockedUntil,
      can_close: problems.length === 0,
      problems: problems,
      items: items,
      summary: { accounts: summaryAccounts, totals: totals },
    }

    if (action === 'check') return e.json(200, result)

    // ---- close ----
    if (problems.length) return e.json(400, { message: problems.join(' '), ...result })
    const col = $app.findCollectionByNameOrId('fin_closings')
    const rec = new Record(col)
    rec.set('church_id', churchId)
    rec.set('month', month)
    rec.set('status', 'FECHADO')
    rec.set('notes', String(body.notes || '').slice(0, 1000))
    rec.set('summary', result.summary)
    rec.set('checklist', items)
    rec.set('closed_by', auth.id)
    rec.set('closed_by_name', userName)
    rec.set('closed_at', new Date().toISOString().replace('T', ' '))
    $app.save(rec)
    return e.json(200, {
      ...result,
      closing_id: rec.id,
      locked_until: month,
      can_close: false,
    })
  },
  $apis.requireAuth(),
)

// Trava dos meses fechados
onRecordValidate(
  (e) => {
    const rec = e.record
    const name = rec.collection().name
    const churchId = rec.getString('church_id')
    let lockedUntil = ''
    try {
      const rows = e.app.findRecordsByFilter(
        'fin_closings',
        "church_id = {:c} && status = 'FECHADO'",
        '-month',
        1,
        0,
        { c: churchId },
      )
      lockedUntil = rows.length ? rows[0].getString('month') : ''
    } catch (_) {}
    if (!lockedUntil) return e.next()

    const label = lockedUntil.slice(5, 7) + '/' + lockedUntil.slice(0, 4)
    const locked = (date) => {
      const m = String(date || '').slice(0, 7)
      return m !== '' && m <= lockedUntil
    }
    const old = rec.isNew() ? null : rec.original()
    const changed = (allowed) => {
      if (!old) return true
      for (const f of rec.collection().fields) {
        const n = f.name
        if (allowed.indexOf(n) !== -1 || n === 'updated') continue
        if (String(rec.get(n)) !== String(old.get(n))) return true
      }
      return false
    }

    if (name === 'fin_transactions' || name === 'fin_counts') {
      const touchesLocked = locked(rec.getString('date')) || (old && locked(old.getString('date')))
      // Lançamento de mês fechado: só dá para anexar comprovante e conciliar com o extrato
      const allowed = name === 'fin_transactions' ? ['attachment', 'bank_line_id'] : []
      if (touchesLocked && changed(allowed)) {
        throw new BadRequestError(
          'O mês está fechado (até ' +
            label +
            '). Lance com data de um mês aberto ou peça ao MASTER para reabrir.',
        )
      }
    }

    if (name === 'fin_accounts') {
      const balanceChanged =
        !old ||
        old.getInt('opening_balance_cents') !== rec.getInt('opening_balance_cents') ||
        String(old.get('opening_date')) !== String(rec.get('opening_date'))
      const hasBalance =
        rec.getInt('opening_balance_cents') !== 0 ||
        (old && old.getInt('opening_balance_cents') !== 0)
      const date = rec.getString('opening_date')
      if (
        balanceChanged &&
        hasBalance &&
        (!date || locked(date) || (old && locked(old.getString('opening_date'))))
      ) {
        throw new BadRequestError(
          'O saldo inicial mexe em meses fechados (até ' +
            label +
            '). Use uma data de saldo inicial depois disso ou peça ao MASTER para reabrir.',
        )
      }
    }

    e.next()
  },
  'fin_transactions',
  'fin_counts',
  'fin_accounts',
)
