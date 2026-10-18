// Conciliação do extrato bancário (Financeiro)
// POST /backend/v1/finance/bank/{action}
//
// import      { account_id, file_name, start_date, end_date, balance_cents?, balance_date?,
//               lines: [{ fitid, date: 'YYYY-MM-DD', amount_cents, description }] }
//             Grava o arquivo e as linhas novas; um FITID já importado na conta é pulado, e
//             também o movimento que já entrou pela API do banco (finance_bank_sync.js).
// reconcile   { line_id, transaction_id }   liga a linha a um lançamento que já existe
//             { line_id, bill_id, payment_method? }   dá baixa numa conta a pagar/receber
//             { line_id, create: { category_id, person_id, is_anonymous, supplier_id,
//               cost_center_id, description, payment_method, transfer_account_id } }
//             cria o lançamento a partir da linha (transferência quando vier transfer_account_id)
// unreconcile { line_id }   desfaz a ligação; o lançamento continua como está
//
// Só MASTER ou quem tem a função FINANCEIRO na igreja da conta. Tudo numa transação só.
// Se o lançamento conciliado for estornado, a linha volta a ficar pendente.

routerAdd(
  'POST',
  '/backend/v1/finance/bank/{action}',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) return e.json(401, { message: 'Não autorizado' })
    const action = e.request.pathValue('action')
    const body = e.requestInfo().body || {}

    const canManage = (churchId) => {
      let member = null
      try {
        const rows = $app.findRecordsByFilter(
          'church_members',
          'church_id = {:churchId} && user_id = {:userId} && is_active = true',
          '',
          1,
          0,
          { churchId: churchId, userId: authRecord.id },
        )
        member = rows.length > 0 ? rows[0] : null
      } catch (_) {}
      if (!member) return false
      let opRoles = []
      try {
        opRoles = JSON.parse(member.getString('operational_roles') || '[]') || []
      } catch (_) {}
      return member.getString('role') === 'MASTER' || opRoles.indexOf('FINANCEIRO') !== -1
    }
    const findOr = (collection, id) => {
      if (!id) return null
      try {
        return $app.findRecordById(collection, String(id))
      } catch (_) {
        return null
      }
    }
    const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
    const userName = authRecord.getString('name') || authRecord.getString('email')
    const nowIso = new Date().toISOString().replace('T', ' ')

    // ---- importar ----
    if (action === 'import') {
      const account = findOr('fin_accounts', body.account_id)
      if (!account) return e.json(404, { message: 'Conta não encontrada' })
      const churchId = account.getString('church_id')
      if (!canManage(churchId)) {
        return e.json(403, { message: 'Só quem cuida do financeiro pode importar extrato.' })
      }
      const lines = Array.isArray(body.lines) ? body.lines : []
      if (lines.length === 0) return e.json(400, { message: 'O arquivo não tem movimentos.' })
      if (lines.length > 3000) {
        return e.json(400, { message: 'Arquivo grande demais: importe no máximo 3000 movimentos.' })
      }
      for (const l of lines) {
        const amount = Number(l.amount_cents)
        if (!String(l.fitid || '').trim() || !isYmd(l.date) || !Number.isInteger(amount)) {
          return e.json(400, { message: 'Movimento inválido no arquivo.' })
        }
      }

      let created = 0
      let skipped = 0
      let importId = ''
      try {
        $app.runInTransaction((txApp) => {
          const imp = new Record(txApp.findCollectionByNameOrId('fin_bank_imports'))
          imp.set('church_id', churchId)
          imp.set('account_id', account.id)
          imp.set('file_name', String(body.file_name || '').slice(0, 200))
          if (isYmd(body.start_date)) imp.set('start_date', body.start_date + ' 12:00:00.000Z')
          if (isYmd(body.end_date)) imp.set('end_date', body.end_date + ' 12:00:00.000Z')
          if (Number.isInteger(Number(body.balance_cents)) && body.balance_cents !== null) {
            imp.set('balance_cents', Number(body.balance_cents))
            imp.set('has_balance', true)
            if (isYmd(body.balance_date))
              imp.set('balance_date', body.balance_date + ' 12:00:00.000Z')
          }
          imp.set('imported_by_name', userName)
          txApp.save(imp)
          importId = imp.id

          const linesCol = txApp.findCollectionByNameOrId('fin_bank_lines')
          const seen = {}
          for (const l of lines) {
            const fitid = String(l.fitid).trim().slice(0, 255)
            if (seen[fitid]) {
              skipped++
              continue
            }
            seen[fitid] = true
            let exists = false
            try {
              txApp.findFirstRecordByFilter('fin_bank_lines', 'account_id = {:a} && fitid = {:f}', {
                a: account.id,
                f: fitid,
              })
              exists = true
            } catch (_) {}
            if (exists) {
              skipped++
              continue
            }
            // Movimento que já veio pela API do banco (com outro FITID): cada linha da API no
            // mesmo dia e valor "cobre" uma linha do arquivo
            const same = txApp.findRecordsByFilter(
              'fin_bank_lines',
              'account_id = {:a} && date = {:d} && amount_cents = {:v}',
              '',
              0,
              0,
              { a: account.id, d: l.date + ' 12:00:00.000Z', v: Number(l.amount_cents) },
            )
            let fromApi = 0
            for (const s of same) if (s.getString('fitid').indexOf('api:') === 0) fromApi++
            if (fromApi > same.length - fromApi) {
              skipped++
              continue
            }
            const rec = new Record(linesCol)
            rec.set('church_id', churchId)
            rec.set('account_id', account.id)
            rec.set('import_id', imp.id)
            rec.set('fitid', fitid)
            rec.set('date', l.date + ' 12:00:00.000Z')
            rec.set('amount_cents', Number(l.amount_cents))
            rec.set('description', String(l.description || '').slice(0, 500))
            rec.set('status', 'PENDENTE')
            txApp.save(rec)
            created++
          }
          imp.set('lines_created', created)
          imp.set('lines_skipped', skipped)
          txApp.save(imp)
        })
      } catch (err) {
        return e.json(400, { message: 'Não foi possível importar: ' + err.message })
      }
      return e.json(200, { import_id: importId, created: created, skipped: skipped })
    }

    // ---- as outras ações partem de uma linha ----
    const line = findOr('fin_bank_lines', body.line_id)
    if (!line) return e.json(404, { message: 'Movimento não encontrado' })
    const churchId = line.getString('church_id')
    if (!canManage(churchId)) {
      return e.json(403, { message: 'Só quem cuida do financeiro pode conciliar.' })
    }
    const lineAmount = line.getInt('amount_cents')
    const isCredit = lineAmount > 0
    const abs = Math.abs(lineAmount)
    const accountId = line.getString('account_id')

    if (action === 'unreconcile') {
      if (line.getString('status') !== 'CONCILIADO') {
        return e.json(400, { message: 'Este movimento não está conciliado.' })
      }
      try {
        $app.runInTransaction((txApp) => {
          const fresh = txApp.findRecordById('fin_bank_lines', line.id)
          const txId = fresh.getString('transaction_id')
          if (txId) {
            try {
              const tx = txApp.findRecordById('fin_transactions', txId)
              if (tx.getString('bank_line_id') === fresh.id) {
                tx.set('bank_line_id', '')
                txApp.save(tx)
              }
            } catch (_) {}
          }
          fresh.set('status', 'PENDENTE')
          fresh.set('transaction_id', '')
          fresh.set('reconciled_at', '')
          fresh.set('reconciled_by_name', '')
          txApp.save(fresh)
        })
      } catch (err) {
        return e.json(400, { message: 'Não foi possível desfazer: ' + err.message })
      }
      return e.json(200, { success: true })
    }

    if (action !== 'reconcile') return e.json(404, { message: 'Ação desconhecida' })
    if (line.getString('status') !== 'PENDENTE') {
      return e.json(400, { message: 'Este movimento já foi conciliado ou ignorado.' })
    }
    if (lineAmount === 0) return e.json(400, { message: 'Movimento sem valor.' })
    const pbDate = line.getString('date').slice(0, 10) + ' 12:00:00.000Z'
    const methods = ['DINHEIRO', 'PIX', 'CARTAO', 'TRANSFERENCIA', 'BOLETO', 'CHEQUE', 'OUTRO']

    let mode = ''
    if (body.transaction_id) mode = 'match'
    else if (body.bill_id) mode = 'bill'
    else if (body.create && typeof body.create === 'object') mode = 'create'
    else return e.json(400, { message: 'Escolha o lançamento, a conta ou crie um lançamento.' })

    // Conferências antes da transação
    if (mode === 'match') {
      const tx = findOr('fin_transactions', body.transaction_id)
      if (!tx || tx.getString('church_id') !== churchId) {
        return e.json(400, { message: 'Lançamento não encontrado.' })
      }
      if (tx.getString('status') !== 'CONFIRMADO' || tx.getString('bank_line_id')) {
        return e.json(400, { message: 'Este lançamento está estornado ou já foi conciliado.' })
      }
      const type = tx.getString('type')
      const sameSide = isCredit
        ? (type === 'ENTRADA' && tx.getString('account_id') === accountId) ||
          (type === 'TRANSFERENCIA' && tx.getString('to_account_id') === accountId)
        : (type === 'SAIDA' || type === 'TRANSFERENCIA') && tx.getString('account_id') === accountId
      if (!sameSide) {
        return e.json(400, {
          message: 'O lançamento precisa ser da mesma conta e do mesmo sentido.',
        })
      }
      if (tx.getInt('amount_cents') !== abs) {
        return e.json(400, { message: 'O valor do lançamento é diferente do extrato.' })
      }
    }
    if (mode === 'bill') {
      const bill = findOr('fin_bills', body.bill_id)
      if (!bill || bill.getString('church_id') !== churchId) {
        return e.json(400, { message: 'Conta a pagar ou receber não encontrada.' })
      }
      if (bill.getString('status') !== 'ABERTO') {
        return e.json(400, { message: 'Esta conta já foi paga ou cancelada.' })
      }
      if ((bill.getString('kind') === 'RECEBER') !== isCredit) {
        return e.json(400, {
          message: isCredit
            ? 'Crédito no extrato só quita conta a receber.'
            : 'Débito no extrato só quita conta a pagar.',
        })
      }
    }
    let create = null
    if (mode === 'create') {
      create = body.create
      const method = String(create.payment_method || '')
      if (method && methods.indexOf(method) === -1) {
        return e.json(400, { message: 'Forma de pagamento inválida.' })
      }
      const other = String(create.transfer_account_id || '')
      if (other) {
        const acc = findOr('fin_accounts', other)
        if (!acc || acc.getString('church_id') !== churchId || other === accountId) {
          return e.json(400, { message: 'Escolha a outra conta da transferência.' })
        }
      } else if (!create.category_id) {
        return e.json(400, { message: 'Escolha a categoria.' })
      }
    }

    try {
      $app.runInTransaction((txApp) => {
        const fresh = txApp.findRecordById('fin_bank_lines', line.id)
        if (fresh.getString('status') !== 'PENDENTE') {
          throw new Error('Este movimento já foi conciliado ou ignorado.')
        }
        let tx = null
        if (mode === 'match') {
          tx = txApp.findRecordById('fin_transactions', String(body.transaction_id))
          if (tx.getString('bank_line_id')) throw new Error('Lançamento já conciliado.')
        } else if (mode === 'bill') {
          const bill = txApp.findRecordById('fin_bills', String(body.bill_id))
          if (bill.getString('status') !== 'ABERTO') throw new Error('Conta já paga.')
          const method = String(body.payment_method || '')
          tx = new Record(txApp.findCollectionByNameOrId('fin_transactions'))
          tx.set('church_id', churchId)
          tx.set('type', isCredit ? 'ENTRADA' : 'SAIDA')
          tx.set('date', pbDate)
          tx.set('amount_cents', abs)
          tx.set('description', bill.getString('description'))
          tx.set('account_id', accountId)
          tx.set('category_id', bill.getString('category_id'))
          tx.set('cost_center_id', bill.getString('cost_center_id'))
          tx.set('payment_method', methods.indexOf(method) !== -1 ? method : '')
          tx.set('supplier_id', isCredit ? '' : bill.getString('supplier_id'))
          tx.set('person_id', isCredit ? bill.getString('person_id') : '')
          tx.set('bill_id', bill.id)
          tx.set('status', 'CONFIRMADO')
          tx.set('created_by', authRecord.id)
          txApp.save(tx)
          bill.set('status', 'PAGO')
          bill.set('paid_at', pbDate)
          bill.set('paid_amount_cents', abs)
          bill.set('paid_account_id', accountId)
          bill.set('transaction_id', tx.id)
          txApp.save(bill)
        } else {
          const other = String(create.transfer_account_id || '')
          tx = new Record(txApp.findCollectionByNameOrId('fin_transactions'))
          tx.set('church_id', churchId)
          tx.set('date', pbDate)
          tx.set('amount_cents', abs)
          tx.set(
            'description',
            String(create.description || fresh.getString('description')).slice(0, 200),
          )
          tx.set('payment_method', String(create.payment_method || ''))
          tx.set('status', 'CONFIRMADO')
          tx.set('created_by', authRecord.id)
          if (other) {
            tx.set('type', 'TRANSFERENCIA')
            tx.set('account_id', isCredit ? other : accountId)
            tx.set('to_account_id', isCredit ? accountId : other)
          } else {
            tx.set('type', isCredit ? 'ENTRADA' : 'SAIDA')
            tx.set('account_id', accountId)
            tx.set('category_id', String(create.category_id || ''))
            tx.set('cost_center_id', String(create.cost_center_id || ''))
            if (isCredit) {
              const anonymous = create.is_anonymous === true
              tx.set('is_anonymous', anonymous)
              tx.set('person_id', anonymous ? '' : String(create.person_id || ''))
            } else {
              tx.set('supplier_id', String(create.supplier_id || ''))
            }
          }
          txApp.save(tx)
        }
        tx.set('bank_line_id', fresh.id)
        txApp.save(tx)
        fresh.set('status', 'CONCILIADO')
        fresh.set('transaction_id', tx.id)
        fresh.set('reconciled_at', nowIso)
        fresh.set('reconciled_by_name', userName)
        txApp.save(fresh)
      })
    } catch (err) {
      return e.json(400, { message: 'Não foi possível conciliar: ' + err.message })
    }
    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)

// Estorno de um lançamento conciliado: o movimento do extrato volta a ficar pendente.
onRecordAfterUpdateSuccess((e) => {
  const tx = e.record
  const lineId = tx.getString('bank_line_id')
  if (lineId && tx.getString('status') === 'ESTORNADO') {
    try {
      const line = e.app.findRecordById('fin_bank_lines', lineId)
      if (line.getString('transaction_id') === tx.id) {
        line.set('status', 'PENDENTE')
        line.set('transaction_id', '')
        line.set('reconciled_at', '')
        line.set('reconciled_by_name', '')
        e.app.save(line)
      }
      tx.set('bank_line_id', '')
      e.app.save(tx)
    } catch (err) {
      console.log('finance_reconcile: não foi possível reabrir o movimento ' + lineId + ': ' + err)
    }
  }
  e.next()
}, 'fin_transactions')
