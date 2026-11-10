// Migração 0097: Financeiro, CPF/CNPJ de quem pagou.
// - fin_bank_lines.counterparty_doc / counterparty_name: CPF (11 dígitos) ou CNPJ (14) e nome de
//   quem pagou ou recebeu, quando o banco manda (Cora manda em todo Pix).
// - fin_transactions.payer_doc / payer_name: o mesmo, levado para a entrada conciliada com o
//   movimento (hook finance_payers.js). Serve para o relatório "Créditos por pagador" e para
//   vincular sozinho a entrada à pessoa quando ela for cadastrada com esse CPF. Não cria
//   ninguém em Membros: quem não tem cadastro só aparece nos relatórios do Financeiro.

migrate(
  (app) => {
    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    if (!lines.fields.getByName('counterparty_doc')) {
      lines.fields.add(new TextField({ name: 'counterparty_doc', max: 14 }))
    }
    if (!lines.fields.getByName('counterparty_name')) {
      lines.fields.add(new TextField({ name: 'counterparty_name', max: 120 }))
    }
    app.save(lines)
    const txs = app.findCollectionByNameOrId('fin_transactions')
    if (!txs.fields.getByName('payer_doc')) {
      txs.fields.add(new TextField({ name: 'payer_doc', max: 14 }))
    }
    if (!txs.fields.getByName('payer_name')) {
      txs.fields.add(new TextField({ name: 'payer_name', max: 120 }))
    }
    const idx = 'CREATE INDEX idx_fin_transactions_payer ON fin_transactions (church_id, payer_doc)'
    const current = txs.indexes || []
    if (!current.some((i) => i.indexOf('idx_fin_transactions_payer') !== -1)) {
      txs.indexes = current.concat([idx])
    }
    app.save(txs)
  },
  (app) => {
    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    for (const name of ['counterparty_doc', 'counterparty_name']) {
      if (lines.fields.getByName(name)) lines.fields.removeByName(name)
    }
    app.save(lines)
    const txs = app.findCollectionByNameOrId('fin_transactions')
    txs.indexes = (txs.indexes || []).filter((i) => i.indexOf('idx_fin_transactions_payer') === -1)
    for (const name of ['payer_doc', 'payer_name']) {
      if (txs.fields.getByName(name)) txs.fields.removeByName(name)
    }
    app.save(txs)
  },
)
