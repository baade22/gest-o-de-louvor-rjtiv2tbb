// Baixa de contas a pagar e a receber (Financeiro)
// POST /backend/v1/finance/bills/settle
// Body: { bill_id, date: 'YYYY-MM-DD', account_id, amount_cents, payment_method }
// Quem dá baixa precisa ser MASTER ou ter a função FINANCEIRO na igreja do título. Numa
// transação só: cria o lançamento (saída para conta a pagar, entrada para conta a receber)
// e marca o título como PAGO, guardando a data, o valor e a conta usados.
//
// Se o lançamento de uma baixa for estornado, o título volta a ficar em aberto.

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
    let opRoles = []
    try {
      opRoles = JSON.parse(member.getString('operational_roles') || '[]') || []
    } catch (_) {}
    if (member.getString('role') !== 'MASTER' && opRoles.indexOf('FINANCEIRO') === -1) {
      return e.json(403, { message: 'Só quem cuida do financeiro pode dar baixa.' })
    }

    if (bill.getString('status') !== 'ABERTO') {
      return e.json(400, { message: 'Esta conta já foi paga ou cancelada.' })
    }
    try {
      if ($app.findRecordById('fin_accounts', accountId).getString('church_id') !== churchId) {
        throw new Error('outra igreja')
      }
    } catch (_) {
      return e.json(400, { message: 'Conta bancária inválida.' })
    }

    const isPay = bill.getString('kind') === 'PAGAR'
    const pbDate = date + ' 12:00:00.000Z'

    try {
      $app.runInTransaction((txApp) => {
        const fresh = txApp.findRecordById('fin_bills', bill.id)
        if (fresh.getString('status') !== 'ABERTO') {
          throw new Error('Esta conta já foi paga ou cancelada.')
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
        tx.set('supplier_id', isPay ? fresh.getString('supplier_id') : '')
        tx.set('person_id', isPay ? '' : fresh.getString('person_id'))
        tx.set('bill_id', fresh.id)
        tx.set('status', 'CONFIRMADO')
        tx.set('created_by', authRecord.id)
        txApp.save(tx)

        fresh.set('status', 'PAGO')
        fresh.set('paid_at', pbDate)
        fresh.set('paid_amount_cents', amount)
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

// Estorno do lançamento de uma baixa: o título volta a ficar em aberto.
onRecordAfterUpdateSuccess((e) => {
  const tx = e.record
  const billId = tx.getString('bill_id')
  if (billId && tx.getString('status') === 'ESTORNADO') {
    try {
      const bill = e.app.findRecordById('fin_bills', billId)
      if (bill.getString('status') === 'PAGO' && bill.getString('transaction_id') === tx.id) {
        bill.set('status', 'ABERTO')
        bill.set('paid_at', '')
        bill.set('paid_amount_cents', 0)
        bill.set('paid_account_id', '')
        bill.set('transaction_id', '')
        e.app.save(bill)
      }
    } catch (err) {
      console.log('finance_bills: não foi possível reabrir o título ' + billId + ': ' + err)
    }
  }
  e.next()
}, 'fin_transactions')
