// Migração 0048: Financeiro, relatórios.
// - Código contábil (conta do plano do contador) nas categorias e nas contas, para a
//   exportação contábil.
// - fin_signers: quem assina os relatórios (nome e cargo, ex.: Tesoureira, Pastor presidente).

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\')'
const FIN_WRITE =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\')'

migrate(
  (app) => {
    for (const name of ['fin_categories', 'fin_accounts']) {
      const col = app.findCollectionByNameOrId(name)
      if (!col.fields.getByName('accounting_code')) {
        col.fields.add(new TextField({ name: 'accounting_code', max: 30 }))
        app.save(col)
      }
    }

    try {
      app.findCollectionByNameOrId('fin_signers')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    app.save(
      new Collection({
        name: 'fin_signers',
        type: 'base',
        listRule: FIN_READ,
        viewRule: FIN_READ,
        createRule: FIN_WRITE,
        updateRule:
          FIN_WRITE +
          ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)',
        deleteRule: FIN_WRITE,
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'name', type: 'text', required: true, max: 160 },
          { name: 'title', type: 'text', max: 120 },
          { name: 'document', type: 'text', max: 20 },
          { name: 'is_active', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_fin_signers_church ON fin_signers (church_id)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_signers'))
    } catch (_) {}
    for (const name of ['fin_categories', 'fin_accounts']) {
      const col = app.findCollectionByNameOrId(name)
      if (col.fields.getByName('accounting_code')) {
        col.fields.removeByName('accounting_code')
        app.save(col)
      }
    }
  },
)
