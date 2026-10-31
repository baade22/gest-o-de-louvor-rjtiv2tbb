// Migração 0081: Financeiro, Invest Fácil do Bradesco é caixa, não investimento.
// A aplicação e o resgate automáticos (APLIC.INVEST FACIL e RESG.AUTOM.INVEST FACIL) só mudam
// o dinheiro de lugar e deixam de entrar no extrato (hooks finance_bank_sync.js e
// finance_reconcile.js). Aqui saem os que já tinham entrado e ainda não foram conciliados;
// o rendimento (RENTAB.INVEST FACILCRED) continua no extrato.

migrate(
  (app) => {
    const investMove = (d) => /^\s*(APLIC|RESG)\b/i.test(d) && /INVEST\s*FACIL/i.test(d)
    const found = app.findRecordsByFilter(
      'fin_bank_lines',
      "status != 'CONCILIADO' && (description ~ 'APLIC%INVEST%FACIL%' || description ~ 'RESG%INVEST%FACIL%')",
      '',
      0,
      0,
    )
    for (const line of found) {
      if (investMove(line.getString('description'))) app.delete(line)
    }
  },
  () => {
    // Os movimentos voltam na próxima busca só se o filtro dos hooks for desfeito
  },
)
