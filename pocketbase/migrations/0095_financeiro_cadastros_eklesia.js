// Migração 0095: Financeiro, cadastros de contas e categorias no padrão do Eklesia.
// - fin_accounts.kind ganha CARTAO (cartão) e PLATAFORMA (plataforma de pagamento)
// - fin_accounts: short_code (código reduzido), account_digit (dígito da conta) e pix_keys
//   (chaves PIX, uma por linha)
// - fin_categories: is_group (grupo totalizador: só soma as categorias de baixo, não recebe
//   lançamento) e short_code (código reduzido). A árvore usa o parent_id que já existia.

migrate(
  (app) => {
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    const kind = accounts.fields.getByName('kind')
    for (const v of ['CARTAO', 'PLATAFORMA']) {
      if (kind.values.indexOf(v) === -1) kind.values = kind.values.concat([v])
    }
    if (!accounts.fields.getByName('short_code')) {
      accounts.fields.add(new TextField({ name: 'short_code', max: 20 }))
    }
    if (!accounts.fields.getByName('account_digit')) {
      accounts.fields.add(new TextField({ name: 'account_digit', max: 5 }))
    }
    if (!accounts.fields.getByName('pix_keys')) {
      accounts.fields.add(new TextField({ name: 'pix_keys', max: 600 }))
    }
    app.save(accounts)

    const categories = app.findCollectionByNameOrId('fin_categories')
    if (!categories.fields.getByName('is_group')) {
      categories.fields.add(new BoolField({ name: 'is_group' }))
    }
    if (!categories.fields.getByName('short_code')) {
      categories.fields.add(new TextField({ name: 'short_code', max: 20 }))
    }
    app.save(categories)
  },
  (app) => {
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    for (const f of ['short_code', 'account_digit', 'pix_keys']) {
      if (accounts.fields.getByName(f)) accounts.fields.removeByName(f)
    }
    app.save(accounts)
    const categories = app.findCollectionByNameOrId('fin_categories')
    for (const f of ['is_group', 'short_code']) {
      if (categories.fields.getByName(f)) categories.fields.removeByName(f)
    }
    app.save(categories)
  },
)
