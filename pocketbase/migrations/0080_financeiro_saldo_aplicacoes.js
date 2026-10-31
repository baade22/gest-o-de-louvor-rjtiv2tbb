// Migração 0080: Financeiro, saldo das aplicações separado do saldo da conta-corrente.
// O "SALDO TOTAL" do Bradesco soma a conta-corrente e as aplicações (ex.: Invest Fácil); o
// LouvorFlow compara só a conta-corrente com os lançamentos e mostra as aplicações à parte.
// - fin_bank_connections.invested_cents: saldo das aplicações na última busca (só o hook
//   finance_bank_sync.js grava).

const NO_SERVER = ' && @request.body.invested_cents:isset = false'

migrate(
  (app) => {
    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    if (!conns.fields.getByName('invested_cents')) {
      conns.fields.add(new NumberField({ name: 'invested_cents', onlyInt: true }))
    }
    for (const rule of ['createRule', 'updateRule']) {
      // Cópia primitiva da regra: reusar o getter direto faz o save não persistir
      const s = conns[rule] ? '' + conns[rule] : ''
      if (s && s.indexOf('invested_cents:isset') === -1) conns[rule] = s + NO_SERVER
    }
    app.save(conns)
  },
  (app) => {
    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    for (const rule of ['createRule', 'updateRule']) {
      if (conns[rule]) conns[rule] = ('' + conns[rule]).split(NO_SERVER).join('')
    }
    if (conns.fields.getByName('invested_cents')) conns.fields.removeByName('invested_cents')
    app.save(conns)
  },
)
