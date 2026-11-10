// Baixa de contas a pagar e a receber (Financeiro)
// POST /backend/v1/finance/bills/settle
// Body: { bill_id, date: 'YYYY-MM-DD', account_id, amount_cents, payment_method,
//         discount_cents?, interest_cents? }
// amount_cents é o que saiu ou entrou na conta. Quita do título: valor + desconto - juros.
// Baixa parcial: o título continua ABERTO com o que falta; quitou tudo, fica PAGO.
// Quem dá baixa precisa ser MASTER ou ter financeiro.contas_pagar.baixa na igreja do título. Numa
// transação só: cria o lançamento (saída para conta a pagar, entrada para conta a receber)
// e atualiza o título (quitado, pago, data e conta da última baixa).
//
// Se o lançamento de uma baixa for estornado, o título é recalculado com as baixas que sobraram.

routerAdd(
  'POST',
  '/backend/v1/finance/bills/settle',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const billId = String(body.bill_id || '').trim()
    const date = String(body.date || '').trim()
    const accountId = String(body.account_id || '').trim()
    const amount = Number(body.amount_cents)
    const method = String(body.payment_method || '').trim()
    const discount = body.discount_cents == null ? 0 : Number(body.discount_cents)
    const interest = body.interest_cents == null ? 0 : Number(body.interest_cents)
    if (
      !Number.isInteger(discount) ||
      discount < 0 ||
      !Number.isInteger(interest) ||
      interest < 0
    ) {
      return e.json(400, { message: 'Desconto e juros precisam ser valores positivos.' })
    }
    if (!billId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !accountId) {
      return e.json(400, { message: 'Informe a data e a conta da baixa.' })
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return e.json(400, { message: 'Informe o valor pago.' })
    }
    const methods = ['DINHEIRO', 'PIX', 'CARTAO', 'TRANSFERENCIA', 'BOLETO', 'CHEQUE', 'OUTRO']
    if (method && methods.indexOf(method) === -1) {
      return e.json(400, { message: 'Forma de pagamento inválida.' })
    }

    let bill = null
    try {
      bill = $app.findRecordById('fin_bills', billId)
    } catch (_) {
      return e.json(404, { message: 'Conta não encontrada' })
    }
    const churchId = bill.getString('church_id')

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
    if (!member) {
      return e.json(404, { message: 'Conta não encontrada' })
    }
    let perms = []
    try {
      perms = JSON.parse(member.getString('permissions') || '[]') || []
    } catch (_) {}
    if (
      member.getString('role') !== 'MASTER' &&
      perms.indexOf('financeiro.contas_pagar.baixa') === -1
    ) {
      return e.json(403, { message: 'Seu perfil de acesso não permite dar baixa em contas.' })
    }
    let cong = []
    try {
      cong = JSON.parse(member.getString('cong_financeiro') || '[]') || []
    } catch (_) {}
    // Perfil restrito a congregações: só mexe nas contas delas (conta sem congregação vale para todos)
    const congOk = (c) =>
      member.getString('role') === 'MASTER' ||
      cong.indexOf('*') !== -1 ||
      !c ||
      cong.indexOf(c) !== -1

    if (bill.getString('status') !== 'ABERTO') {
      return e.json(400, { message: 'Esta conta já foi paga ou cancelada.' })
    }
    let payAccount = null
    try {
      payAccount = $app.findRecordById('fin_accounts', accountId)
      if (payAccount.getString('church_id') !== churchId) {
        throw new Error('outra igreja')
      }
    } catch (_) {
      return e.json(400, { message: 'Conta bancária inválida.' })
    }
    if (!congOk(payAccount.getString('congregation'))) {
      return e.json(403, { message: 'Esta conta é de uma congregação fora do seu perfil.' })
    }

    const isPay = bill.getString('kind') === 'PAGAR'
    const pbDate = date + ' 12:00:00.000Z'

    try {
      $app.runInTransaction((txApp) => {
        const fresh = txApp.findRecordById('fin_bills', bill.id)
        if (fresh.getString('status') !== 'ABERTO') {
          throw new Error('Esta conta já foi paga ou cancelada.')
        }
        const total = fresh.getInt('amount_cents')
        const settledBefore = fresh.getInt('settled_cents')
        const remaining = total - settledBefore
        const principal = amount + discount - interest
        if (principal <= 0) {
          throw new Error('o valor, tirando os juros, precisa quitar alguma coisa.')
        }
        if (principal > remaining) {
          throw new Error(
            'falta quitar ' +
              (remaining / 100).toFixed(2).replace('.', ',') +
              '; o que passar disso entra como juros ou multa.',
          )
        }
        const tx = new Record(txApp.findCollectionByNameOrId('fin_transactions'))
        tx.set('church_id', churchId)
        tx.set('type', isPay ? 'SAIDA' : 'ENTRADA')
        tx.set('date', pbDate)
        tx.set('amount_cents', amount)
        tx.set('description', fresh.getString('description'))
        tx.set('account_id', accountId)
        tx.set('category_id', fresh.getString('category_id'))
        tx.set('cost_center_id', fresh.getString('cost_center_id'))
        tx.set('campaign_id', fresh.getString('campaign_id'))
        tx.set('payment_method', method)
        tx.set('supplier_id', fresh.getString('supplier_id'))
        tx.set('person_id', fresh.getString('person_id'))
        tx.set('bill_id', fresh.id)
        tx.set('discount_cents', discount)
        tx.set('interest_cents', interest)
        tx.set('status', 'CONFIRMADO')
        tx.set('created_by', authRecord.id)
        txApp.save(tx)

        fresh.set('settled_cents', settledBefore + principal)
        fresh.set('status', settledBefore + principal >= total ? 'PAGO' : 'ABERTO')
        fresh.set('paid_at', pbDate)
        fresh.set('paid_amount_cents', fresh.getInt('paid_amount_cents') + amount)
        fresh.set('paid_account_id', accountId)
        fresh.set('transaction_id', tx.id)
        txApp.save(fresh)
      })
    } catch (err) {
      return e.json(400, { message: 'Não foi possível dar baixa: ' + err.message })
    }

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)

// Estorno do lançamento de uma baixa: o título é recalculado com as baixas que sobraram
// (sem nenhuma, volta a ficar em aberto como era).
onRecordAfterUpdateSuccess((e) => {
  const tx = e.record
  const billId = tx.getString('bill_id')
  if (billId && tx.getString('status') === 'ESTORNADO') {
    try {
      const bill = e.app.findRecordById('fin_bills', billId)
      if (bill.getString('status') !== 'CANCELADO') {
        const rest = e.app.findRecordsByFilter(
          'fin_transactions',
          "bill_id = {:b} && status = 'CONFIRMADO'",
          'date,created',
          0,
          0,
          { b: billId },
        )
        let settled = 0
        let paid = 0
        for (const r of rest) {
          paid += r.getInt('amount_cents')
          settled +=
            r.getInt('amount_cents') + r.getInt('discount_cents') - r.getInt('interest_cents')
        }
        const last = rest.length ? rest[rest.length - 1] : null
        bill.set('settled_cents', Math.max(0, settled))
        bill.set('paid_amount_cents', paid)
        bill.set('status', last && settled >= bill.getInt('amount_cents') ? 'PAGO' : 'ABERTO')
        bill.set('paid_at', last ? last.getString('date') : '')
        bill.set('paid_account_id', last ? last.getString('account_id') : '')
        bill.set('transaction_id', last ? last.id : '')
        e.app.save(bill)
      }
    } catch (err) {
      console.log('finance_bills: não foi possível recalcular o título ' + billId + ': ' + err)
    }
  }
  e.next()
}, 'fin_transactions')
