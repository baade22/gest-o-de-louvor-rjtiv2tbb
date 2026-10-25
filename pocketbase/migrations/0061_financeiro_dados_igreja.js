// Migração 0061: Financeiro, dados da igreja para o informe anual de contribuições.
// fin_settings: um registro por igreja com razão social, CNPJ, endereço, cidade e o texto
// que sai no rodapé do informe. A tesouraria (MASTER ou FINANCEIRO) edita; quem vê o
// financeiro (inclusive ADMIN e conselho fiscal) lê.

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\' || ' +
  '@collection.church_members.operational_roles ?~ \'"AUDITOR"\')'
const FIN_WRITE =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\')'

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_settings')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    app.save(
      new Collection({
        name: 'fin_settings',
        type: 'base',
        listRule: FIN_READ,
        viewRule: FIN_READ,
        createRule: FIN_WRITE,
        updateRule:
          FIN_WRITE +
          ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)',
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
          { name: 'legal_name', type: 'text', max: 200 },
          { name: 'cnpj', type: 'text', max: 20 },
          { name: 'address', type: 'text', max: 300 },
          { name: 'city', type: 'text', max: 120 },
          { name: 'statement_note', type: 'text', max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_fin_settings_church ON fin_settings (church_id)'],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_settings'))
    } catch (_) {}
  },
)
