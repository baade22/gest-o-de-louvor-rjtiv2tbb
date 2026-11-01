// Migração 0088: Financeiro, conta de aplicação (Invest Fácil do Bradesco) separada.
// Uma única conexão com a API do Bradesco alimenta duas contas do financeiro: a conta-corrente
// (saldo não aplicado) e, quando escolhida, a conta de aplicação (saldo do Invest Fácil).
// - fin_bank_connections.invest_account_id: conta do financeiro que recebe o Invest Fácil.
//   Sem ela, vale a regra anterior (Invest Fácil soma no saldo da conta-corrente e aplicações
//   e resgates automáticos ficam fora do extrato).
// - fin_bank_connections.invest_cash_cents: saldo do Invest Fácil na última busca (só o hook
//   finance_bank_sync.js grava).

const NO_SERVER = ' && @request.body.invest_cash_cents:isset = false'

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
    if (!conns.fields.getByName('invest_cash_cents')) {
      conns.fields.add(new NumberField({ name: 'invest_cash_cents', onlyInt: true }))
    }
    for (const rule of ['createRule', 'updateRule']) {
      // Cópia primitiva da regra: reusar o getter direto faz o save não persistir
      const s = conns[rule] ? '' + conns[rule] : ''
      if (s && s.indexOf('invest_cash_cents:isset') === -1) conns[rule] = s + NO_SERVER
    }
    app.save(conns)
  },
  (app) => {
    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    for (const rule of ['createRule', 'updateRule']) {
      if (conns[rule]) conns[rule] = ('' + conns[rule]).split(NO_SERVER).join('')
    }
    for (const f of ['invest_account_id', 'invest_cash_cents']) {
      if (conns.fields.getByName(f)) conns.fields.removeByName(f)
    }
    app.save(conns)
  },
)
