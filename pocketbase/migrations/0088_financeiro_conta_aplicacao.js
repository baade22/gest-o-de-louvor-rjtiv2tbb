// Migração 0088: Financeiro, conta do fundo de investimento (ex.: Fundo Max DI do Bradesco).
// Uma única conexão com a API do Bradesco alimenta duas contas do financeiro: a conta-corrente
// (o Invest Fácil continua somando nela, como saldo de conta-corrente) e, quando escolhida, a
// conta de aplicação, com o saldo das aplicações (invested_cents). As aplicações e resgates do
// fundo entram no extrato das duas contas, para conciliar como transferência entre elas.
// - fin_bank_connections.invest_account_id: conta do financeiro que recebe as aplicações.

migrate(
  (app) => {
    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    if (!conns.fields.getByName('invest_account_id')) {
      conns.fields.add(
        new RelationField({
          name: 'invest_account_id',
          collectionId: accounts.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(conns)
  },
  (app) => {
    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    if (conns.fields.getByName('invest_account_id')) conns.fields.removeByName('invest_account_id')
    app.save(conns)
  },
)
