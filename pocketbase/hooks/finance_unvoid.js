// Desfazer os estornos feitos pela lista "O que falta conciliar" do Painel (PR #78, retirada).
// POST /backend/v1/finance/unvoid-list   { church_id, dry_run? }
//
// Só o MASTER. Volta para CONFIRMADO cada lançamento estornado com o motivo que a lista usava
// e religa o que o estorno desfez:
// - o movimento do extrato que o estorno reabriu (pendente, reaberto no mesmo minuto do
//   estorno, mesmo valor, até 5 dias de diferença). Se depois disso uma regra "conciliar
//   sozinho" pegou o movimento, o lançamento que a regra criou sai e o original volta;
// - a conta a pagar/receber que o estorno reabriu volta a ficar paga.
// dry_run: só conta o que seria feito.

routerAdd(
  'POST',
  '/backend/v1/finance/unvoid-list',
  (e) => {
    const REASON = 'Sem movimento no banco (duplicado)'
    const AUTO = 'Automático (regra aprendida)'
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    let isMaster = false
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        "church_id = {:c} && user_id = {:u} && is_active = true && role = 'MASTER'",
        '',
        1,
        0,
        { c: churchId, u: auth.id },
      )
      isMaster = rows.length > 0
    } catch (_) {}
    if (!isMaster) return e.json(403, { message: 'Só o MASTER pode desfazer os estornos.' })
    const dryRun = body.dry_run === true

    const ms = (s) => new Date(String(s || '').replace(' ', 'T')).getTime()
    const DAY = 24 * 60 * 60 * 1000
    const shift = (ymd, n) =>
      new Date(new Date(ymd + 'T12:00:00Z').getTime() + n * DAY).toISOString().slice(0, 10)

    const voided = $app.findRecordsByFilter(
      'fin_transactions',
      "church_id = {:c} && status = 'ESTORNADO' && void_reason = {:r}",
      'date',
      0,
      0,
      { c: churchId, r: REASON },
    )

    const report = { restored: 0, linked: 0, bills: 0, not_linked: [], failed: [] }
    for (const v of voided) {
      try {
        $app.runInTransaction((txApp) => {
          const tx = txApp.findRecordById('fin_transactions', v.id)
          const voidAt = ms(tx.getString('updated'))
          const amount = tx.getInt('amount_cents')
          const ymd = tx.getString('date').slice(0, 10)
          const isTransfer = tx.getString('type') === 'TRANSFERENCIA'
          const sides = isTransfer
            ? [
                { acc: tx.getString('account_id'), value: -amount, field: 'bank_line_id' },
                { acc: tx.getString('to_account_id'), value: amount, field: 'to_bank_line_id' },
              ]
            : [
                {
                  acc: tx.getString('account_id'),
                  value: tx.getString('type') === 'SAIDA' ? -amount : amount,
                  field: 'bank_line_id',
                },
              ]
          tx.set('status', 'CONFIRMADO')
          tx.set('void_reason', '')
          const links = []
          for (const s of sides) {
            if (!s.acc) continue
            const lines = txApp.findRecordsByFilter(
              'fin_bank_lines',
              'account_id = {:a} && amount_cents = {:v} && date >= {:from} && date <= {:to}',
              'date',
              0,
              0,
              {
                a: s.acc,
                v: s.value,
                from: shift(ymd, -5) + ' 00:00:00.000Z',
                to: shift(ymd, 5) + ' 23:59:59.999Z',
              },
            )
            let pick = null
            let autoTx = ''
            for (const l of lines) {
              const st = l.getString('status')
              // Reaberto pelo estorno: pendente, sem lançamento, mexido no mesmo minuto
              if (
                st === 'PENDENTE' &&
                !l.getString('transaction_id') &&
                Math.abs(ms(l.getString('updated')) - voidAt) <= 120000
              ) {
                pick = l
                break
              }
              // Reaberto e depois pego por uma regra automática
              if (
                (st === 'CONCILIADO' || st === 'IGNORADO') &&
                l.getString('reconciled_by_name') === AUTO &&
                ms(l.getString('reconciled_at')) >= voidAt - 1000
              ) {
                pick = l
                autoTx = st === 'CONCILIADO' ? l.getString('transaction_id') : ''
                break
              }
            }
            if (!pick) {
              report.not_linked.push(
                ymd + ' ' + (tx.getString('description') || tx.getString('type')) + ' ' + amount,
              )
              continue
            }
            links.push({ line: pick, field: s.field, autoTx: autoTx })
          }
          if (dryRun) {
            report.restored++
            report.linked += links.length
            throw new Error('__dry__')
          }
          txApp.save(tx)
          for (const k of links) {
            if (k.autoTx) {
              // Lançamento que a regra criou para o movimento reaberto: some, o original volta
              try {
                const dup = txApp.findRecordById('fin_transactions', k.autoTx)
                if (ms(dup.getString('created')) >= voidAt - 1000) {
                  for (const f of ['bank_line_id', 'to_bank_line_id']) {
                    const other = dup.getString(f)
                    if (!other || other === k.line.id) continue
                    try {
                      const ol = txApp.findRecordById('fin_bank_lines', other)
                      if (ol.getString('transaction_id') === dup.id) {
                        ol.set('status', 'PENDENTE')
                        ol.set('transaction_id', '')
                        ol.set('reconciled_at', '')
                        ol.set('reconciled_by_name', '')
                        txApp.save(ol)
                      }
                    } catch (_) {}
                  }
                  txApp.delete(dup)
                } else {
                  report.not_linked.push(ymd + ' ' + tx.getString('description') + ' ' + amount)
                  continue
                }
              } catch (_) {}
            }
            const line = txApp.findRecordById('fin_bank_lines', k.line.id)
            line.set('status', 'CONCILIADO')
            line.set('transaction_id', tx.id)
            line.set('reconciled_at', new Date().toISOString().replace('T', ' '))
            line.set('reconciled_by_name', 'Estorno desfeito')
            txApp.save(line)
            tx.set(k.field, line.id)
            report.linked++
          }
          txApp.save(tx)
          // Conta a pagar/receber reaberta pelo estorno
          const billId = tx.getString('bill_id')
          if (billId) {
            try {
              const bill = txApp.findRecordById('fin_bills', billId)
              if (bill.getString('status') === 'ABERTO' && !bill.getString('transaction_id')) {
                bill.set('status', 'PAGO')
                bill.set('paid_at', tx.getString('date'))
                bill.set('paid_amount_cents', amount)
                bill.set('paid_account_id', tx.getString('account_id'))
                bill.set('transaction_id', tx.id)
                txApp.save(bill)
                report.bills++
              }
            } catch (_) {}
          }
          report.restored++
        })
      } catch (err) {
        if (String(err).indexOf('__dry__') === -1) {
          report.failed.push(
            (v.getString('date') || '').slice(0, 10) +
              ' ' +
              v.getString('description') +
              ': ' +
              String(err.message || err),
          )
        }
      }
    }
    return e.json(200, Object.assign({ total: voided.length, dry_run: dryRun }, report))
  },
  $apis.requireAuth(),
)
