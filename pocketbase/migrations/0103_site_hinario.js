// Migração 0103: Hinário do site/app da igreja (pedido do Pedro, 2026-11-17).
//
// A igreja cadastra os hinos que canta (Cantor Cristão, Harpa Cristã ou outro hinário): nome do
// hinário, número, título e letra. O app mostra o índice e a letra. Quem cadastra é quem tem
// admin.site.alterar; ler no painel pede admin.site.ver. O público lê pela rota
// /backend/v1/public/site/hymns (hook site_public.js), só de site publicado e só hino ativo.
// A Bíblia não usa banco: o texto (Bíblia Livre, CC BY 4.0) vai como arquivo estático do app.

const MEMBER =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const M = "@collection.church_members.role ?= 'MASTER'"
const P = (k) => '@collection.church_members.permissions ?~ \'"' + k + '"\''
const allow = (k) => MEMBER + ' && (' + M + ' || ' + P(k) + ')'
const LOCK = ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('site_hymns')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const col = new Collection({
      name: 'site_hymns',
      type: 'base',
      listRule: allow('admin.site.ver'),
      viewRule: allow('admin.site.ver'),
      createRule: allow('admin.site.alterar'),
      updateRule: allow('admin.site.alterar') + LOCK,
      deleteRule: allow('admin.site.alterar'),
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'hymnal', type: 'text', required: true, max: 60 },
        { name: 'number', type: 'number', onlyInt: true, min: 0, max: 9999 },
        { name: 'title', type: 'text', required: true, max: 160 },
        { name: 'lyrics', type: 'text', max: 12000 },
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_site_hymns_church ON site_hymns (church_id, hymnal, number)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('site_hymns'))
    } catch (_) {}
  },
)
