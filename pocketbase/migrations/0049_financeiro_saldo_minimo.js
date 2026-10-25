// Migração 0049: Financeiro, fluxo de caixa.
// Saldo mínimo por conta: o fluxo de caixa avisa quando a projeção da congregação fica abaixo
// da soma dos mínimos das contas dela.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('fin_accounts')
    if (!col.fields.getByName('min_balance_cents')) {
      col.fields.add(new NumberField({ name: 'min_balance_cents', onlyInt: true, min: 0 }))
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('fin_accounts')
    if (col.fields.getByName('min_balance_cents')) {
      col.fields.removeByName('min_balance_cents')
      app.save(col)
    }
  },
)
