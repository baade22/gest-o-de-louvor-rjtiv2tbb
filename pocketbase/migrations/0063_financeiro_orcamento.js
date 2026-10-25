// Migração 0063: Financeiro, orçamento anual.
// fin_budgets: o previsto de cada categoria num ano, da igreja toda (congregation vazio) ou de
// uma congregação. Só leitura pela API; a rota /backend/v1/finance/budget (hook
// finance_budget.js) grava o orçamento de um ano e congregação de uma vez.

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\' || ' +
  '@collection.church_members.operational_roles ?~ \'"AUDITOR"\')'

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_budgets')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const categories = app.findCollectionByNameOrId('fin_categories')
    app.save(
      new Collection({
        name: 'fin_budgets',
        type: 'base',
        listRule: FIN_READ,
        viewRule: FIN_READ,
        createRule: null,
        updateRule: null,
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
          { name: 'year', type: 'number', required: true, onlyInt: true, min: 2000, max: 2100 },
          { name: 'congregation', type: 'text', max: 60 },
          {
            name: 'category_id',
            type: 'relation',
            required: true,
            collectionId: categories.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'amount_cents', type: 'number', onlyInt: true, min: 0 },
          { name: 'updated_by_name', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_fin_budgets_line ON fin_budgets (church_id, year, congregation, category_id)',
        ],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_budgets'))
    } catch (_) {}
  },
)
