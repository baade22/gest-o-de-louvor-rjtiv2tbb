// Migração 0091: Financeiro, resposta do banco guardada a cada busca do conector.
// - fin_bank_raw: o pedido (sem token) e a resposta crua do extrato de cada busca, para
//   conferir de onde vem um movimento. Sem acesso pela API: só o MASTER lê, pela rota
//   GET /backend/v1/finance/bank-sync/raw. Fica só no LouvorFlow (o log do GitHub é público).
//   O hook guarda as 40 buscas mais recentes de cada conexão.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_bank_raw')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    const col = new Collection({
      name: 'fin_bank_raw',
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
          name: 'connection_id',
          type: 'relation',
          collectionId: conns.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'account_id',
          type: 'relation',
          collectionId: accounts.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'provider', type: 'text', max: 20 },
        { name: 'start_date', type: 'text', max: 10 },
        { name: 'end_date', type: 'text', max: 10 },
        { name: 'lines_count', type: 'number', onlyInt: true },
        { name: 'request', type: 'json', maxSize: 20000 },
        { name: 'response', type: 'json', maxSize: 5000000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX idx_fin_bank_raw_conn ON fin_bank_raw (connection_id, created)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_bank_raw'))
    } catch (_) {}
  },
)
