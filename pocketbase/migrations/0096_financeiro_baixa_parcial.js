// Migração 0096: Financeiro, baixa no padrão do Eklesia.
// - fin_bills.settled_cents: quanto do valor do título já foi quitado (soma das baixas, contando
//   desconto e tirando juros). Título com baixa parcial continua ABERTO; fica PAGO quando quita
//   tudo. Os títulos PAGO de antes valem como quitados por inteiro (o hook de validação completa).
// - fin_transactions.discount_cents / interest_cents: desconto e juros/multa da baixa.

migrate(
  (app) => {
    const bills = app.findCollectionByNameOrId('fin_bills')
    if (!bills.fields.getByName('settled_cents')) {
      bills.fields.add(new NumberField({ name: 'settled_cents', onlyInt: true, min: 0 }))
    }
    app.save(bills)
    const txs = app.findCollectionByNameOrId('fin_transactions')
    for (const name of ['discount_cents', 'interest_cents']) {
      if (!txs.fields.getByName(name)) {
        txs.fields.add(new NumberField({ name: name, onlyInt: true, min: 0 }))
      }
    }
    app.save(txs)
  },
  (app) => {
    const bills = app.findCollectionByNameOrId('fin_bills')
    if (bills.fields.getByName('settled_cents')) bills.fields.removeByName('settled_cents')
    app.save(bills)
    const txs = app.findCollectionByNameOrId('fin_transactions')
    for (const name of ['discount_cents', 'interest_cents']) {
      if (txs.fields.getByName(name)) txs.fields.removeByName(name)
    }
    app.save(txs)
  },
)
