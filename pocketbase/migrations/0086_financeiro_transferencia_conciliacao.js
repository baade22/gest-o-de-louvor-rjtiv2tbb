// Migração 0086: Financeiro, transferência entre contas na conciliação.
// - fin_transactions.to_bank_line_id: movimento do extrato da conta de DESTINO de uma
//   transferência. Uma transferência aparece nos dois extratos (sai de uma conta, entra na
//   outra); bank_line_id guarda o lado da saída e to_bank_line_id o da entrada, para os dois
//   ficarem conciliados com o mesmo lançamento. Só o hook grava.

migrate(
  (app) => {
    const transactions = app.findCollectionByNameOrId('fin_transactions')
    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    if (!transactions.fields.getByName('to_bank_line_id')) {
      transactions.fields.add(
        new RelationField({
          name: 'to_bank_line_id',
          collectionId: lines.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    const guard = ' && @request.body.to_bank_line_id:isset = false'
    if (
      transactions.createRule &&
      transactions.createRule.indexOf('to_bank_line_id:isset') === -1
    ) {
      transactions.createRule = '' + transactions.createRule + guard
    }
    if (
      transactions.updateRule &&
      transactions.updateRule.indexOf('to_bank_line_id:isset') === -1
    ) {
      transactions.updateRule = '' + transactions.updateRule + guard
    }
    app.save(transactions)
  },
  (app) => {
    const transactions = app.findCollectionByNameOrId('fin_transactions')
    const guard = ' && @request.body.to_bank_line_id:isset = false'
    if (transactions.createRule)
      transactions.createRule = ('' + transactions.createRule).replace(guard, '')
    if (transactions.updateRule)
      transactions.updateRule = ('' + transactions.updateRule).replace(guard, '')
    if (transactions.fields.getByName('to_bank_line_id')) {
      transactions.fields.removeByName('to_bank_line_id')
    }
    app.save(transactions)
  },
)
