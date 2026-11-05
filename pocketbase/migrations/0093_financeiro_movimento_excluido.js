// Migração 0093: Financeiro, movimento do extrato excluído.
// - fin_bank_removed: o movimento ignorado que a pessoa excluiu da conciliação. Guarda a
//   identificação (fitid) para o conector do banco e o arquivo OFX não trazerem o mesmo
//   movimento de volta. Sem acesso pela API: só os hooks finance_reconcile.js (excluir) e
//   finance_bank_sync.js (não recriar) usam.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_bank_removed')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    const col = new Collection({
      name: 'fin_bank_removed',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'account_id',
          type: 'relation',
          required: true,
          collectionId: accounts.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'fitid', type: 'text', required: true, max: 255 },
        { name: 'date', type: 'text', max: 10 },
        { name: 'amount_cents', type: 'number', onlyInt: true },
        { name: 'description', type: 'text', max: 500 },
        { name: 'removed_by_name', type: 'text', max: 200 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX idx_fin_bank_removed_acc ON fin_bank_removed (account_id, fitid)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_bank_removed'))
    } catch (_) {}
  },
)
