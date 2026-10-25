// Migração 0054: Financeiro, PIX da igreja e página pública de doação das campanhas.
// fin_settings ganha a chave PIX (tipo, chave, nome e cidade de quem recebe), usada para montar
// o QR "copia e cola" no navegador. fin_campaigns ganha is_public: só campanha ativa e marcada
// aparece na rota pública /backend/v1/public/campaign/{id} (hook finance_public.js), que tem
// limite de requisições próprio.

const PUBLIC_RULE = { label: '/backend/v1/public/', audience: '', duration: 60, maxRequests: 60 }

migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId('fin_settings')
    if (!settings.fields.getByName('pix_key')) {
      settings.fields.add(
        new SelectField({
          name: 'pix_key_type',
          maxSelect: 1,
          values: ['CPF_CNPJ', 'TELEFONE', 'EMAIL', 'ALEATORIA'],
        }),
      )
      settings.fields.add(new TextField({ name: 'pix_key', max: 77 }))
      settings.fields.add(new TextField({ name: 'pix_name', max: 25 }))
      settings.fields.add(new TextField({ name: 'pix_city', max: 15 }))
      app.save(settings)
    }

    const campaigns = app.findCollectionByNameOrId('fin_campaigns')
    if (!campaigns.fields.getByName('is_public')) {
      campaigns.fields.add(new BoolField({ name: 'is_public' }))
      app.save(campaigns)
    }

    const s = app.settings()
    const rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    if (!rules.some((r) => r.label === PUBLIC_RULE.label)) {
      s.rateLimits.rules = [PUBLIC_RULE].concat(rules)
      app.save(s)
    }
  },
  (app) => {
    const settings = app.findCollectionByNameOrId('fin_settings')
    for (const name of ['pix_key_type', 'pix_key', 'pix_name', 'pix_city'])
      if (settings.fields.getByName(name)) settings.fields.removeByName(name)
    app.save(settings)

    const campaigns = app.findCollectionByNameOrId('fin_campaigns')
    if (campaigns.fields.getByName('is_public')) {
      campaigns.fields.removeByName('is_public')
      app.save(campaigns)
    }

    const s = app.settings()
    const rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    s.rateLimits.rules = rules.filter((r) => r.label !== PUBLIC_RULE.label)
    app.save(s)
  },
)
