// Migração 0035: Financeiro, fase 1 (cadastros base e lançamentos).
// - Nova função operacional FINANCEIRO (guardada em church_members.operational_roles).
// - Coleções: people, fin_accounts, fin_categories, fin_cost_centers, fin_suppliers,
//   fin_transactions.
// - Quem lê: MASTER, ADMIN e quem tem a função FINANCEIRO. Quem grava: MASTER e FINANCEIRO.
// - Nada é apagado pela API: lançamentos são estornados (status ESTORNADO) e ficam travados;
//   cadastros são arquivados (is_active = false).
// - Valores sempre em centavos (inteiros), para não haver erro de arredondamento.
//
// Também fecha uma brecha em church_members: o próprio membro podia alterar o seu papel
// e as suas funções operacionais pela API (e se dar ADMIN, MASTER ou FINANCEIRO).
// Agora o membro só altera os próprios dados de contato; papel e funções passam por
// MASTER/ADMIN, e só um MASTER concede MASTER.

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true"
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"
const FIN_WRITE =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"
// Em edições a igreja do registro nunca muda.
const FIN_UPDATE =
  FIN_WRITE + ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'

// Regras antigas de church_members (migração 0019), para o down.
const OLD_MEMBERS_CREATE =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"
const OLD_MEMBERS_UPDATE =
  "@request.auth.id != '' && (user_id = @request.auth.id || (@collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')))"

const MEMBERS_ADMIN =
  "@collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || (@collection.church_members.role ?= 'ADMIN' && @request.body.role != 'MASTER'))"
const MEMBERS_SELF_CONTACT =
  'user_id = @request.auth.id && @request.body.role:isset = false && @request.body.operational_roles:isset = false && @request.body.is_active:isset = false && @request.body.church_id:isset = false && @request.body.user_id:isset = false'
const NEW_MEMBERS_CREATE = "@request.auth.id != '' && " + MEMBERS_ADMIN
const NEW_MEMBERS_UPDATE =
  "@request.auth.id != '' && (" + MEMBERS_SELF_CONTACT + ' || (' + MEMBERS_ADMIN + '))'

function churchField(churchesId) {
  return {
    name: 'church_id',
    type: 'relation',
    required: true,
    collectionId: churchesId,
    cascadeDelete: true,
    maxSelect: 1,
  }
}

function timestamps() {
  return [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
  ]
}

function rules() {
  return {
    listRule: FIN_READ,
    viewRule: FIN_READ,
    createRule: FIN_WRITE,
    updateRule: FIN_UPDATE,
    // Cadastros não são apagados (os lançamentos apontam para eles): são arquivados com is_active.
    deleteRule: null,
  }
}

function ensure(app, name, build) {
  try {
    return app.findCollectionByNameOrId(name)
  } catch (_) {
    const col = new Collection(build())
    app.save(col)
    return col
  }
}

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const events = app.findCollectionByNameOrId('events')

    // 1. Pessoas (membros e congregados que contribuem; não precisam ter login)
    const people = ensure(app, 'people', () => ({
      name: 'people',
      type: 'base',
      ...rules(),
      fields: [
        churchField(churches.id),
        { name: 'name', type: 'text', required: true, max: 160 },
        { name: 'phone', type: 'text', max: 40 },
        { name: 'email', type: 'text', max: 160 },
        { name: 'document', type: 'text', max: 20 },
        {
          name: 'user_id',
          type: 'relation',
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'notes', type: 'text', max: 1000 },
        { name: 'is_active', type: 'bool' },
        ...timestamps(),
      ],
      indexes: ['CREATE INDEX idx_people_church_name ON people (church_id, name)'],
    }))

    // 2. Contas (caixa, bancos, aplicações)
    const accounts = ensure(app, 'fin_accounts', () => ({
      name: 'fin_accounts',
      type: 'base',
      ...rules(),
      fields: [
        churchField(churches.id),
        { name: 'name', type: 'text', required: true, max: 120 },
        {
          name: 'kind',
          type: 'select',
          required: true,
          values: ['CAIXA', 'BANCO', 'APLICACAO', 'OUTRA'],
          maxSelect: 1,
        },
        { name: 'bank_name', type: 'text', max: 80 },
        { name: 'agency', type: 'text', max: 20 },
        { name: 'account_number', type: 'text', max: 30 },
        { name: 'opening_balance_cents', type: 'number', onlyInt: true },
        { name: 'opening_date', type: 'date' },
        { name: 'is_active', type: 'bool' },
        ...timestamps(),
      ],
      indexes: ['CREATE INDEX idx_fin_accounts_church ON fin_accounts (church_id)'],
    }))

    // 3. Plano de contas (categorias de entrada e saída, em dois níveis)
    const categories = ensure(app, 'fin_categories', () => ({
      name: 'fin_categories',
      type: 'base',
      ...rules(),
      fields: [
        churchField(churches.id),
        { name: 'name', type: 'text', required: true, max: 120 },
        {
          name: 'direction',
          type: 'select',
          required: true,
          values: ['ENTRADA', 'SAIDA'],
          maxSelect: 1,
        },
        // Contribuição (dízimo, oferta, missões...): o lançamento pede pessoa ou anônimo.
        { name: 'is_contribution', type: 'bool' },
        { name: 'is_active', type: 'bool' },
        ...timestamps(),
      ],
      indexes: ['CREATE INDEX idx_fin_categories_church ON fin_categories (church_id)'],
    }))
    if (!categories.fields.getByName('parent_id')) {
      categories.fields.add(
        new RelationField({
          name: 'parent_id',
          collectionId: categories.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(categories)
    }

    // 4. Centros de custo
    const costCenters = ensure(app, 'fin_cost_centers', () => ({
      name: 'fin_cost_centers',
      type: 'base',
      ...rules(),
      fields: [
        churchField(churches.id),
        { name: 'name', type: 'text', required: true, max: 120 },
        { name: 'is_active', type: 'bool' },
        ...timestamps(),
      ],
      indexes: ['CREATE INDEX idx_fin_cost_centers_church ON fin_cost_centers (church_id)'],
    }))

    // 5. Fornecedores
    const suppliers = ensure(app, 'fin_suppliers', () => ({
      name: 'fin_suppliers',
      type: 'base',
      ...rules(),
      fields: [
        churchField(churches.id),
        { name: 'name', type: 'text', required: true, max: 160 },
        { name: 'document', type: 'text', max: 20 },
        { name: 'pix_key', type: 'text', max: 120 },
        { name: 'phone', type: 'text', max: 40 },
        { name: 'notes', type: 'text', max: 1000 },
        { name: 'is_active', type: 'bool' },
        ...timestamps(),
      ],
      indexes: ['CREATE INDEX idx_fin_suppliers_church ON fin_suppliers (church_id)'],
    }))

    // 6. Lançamentos. Cadastros relacionados precisam ser da mesma igreja.
    const sameChurch =
      ' && account_id.church_id = church_id' +
      " && (category_id = '' || category_id.church_id = church_id)" +
      " && (cost_center_id = '' || cost_center_id.church_id = church_id)" +
      " && (person_id = '' || person_id.church_id = church_id)" +
      " && (supplier_id = '' || supplier_id.church_id = church_id)" +
      " && (event_id = '' || event_id.church_id = church_id)"
    ensure(app, 'fin_transactions', () => ({
      name: 'fin_transactions',
      type: 'base',
      listRule: FIN_READ,
      viewRule: FIN_READ,
      createRule:
        FIN_WRITE +
        sameChurch +
        " && @request.body.created_by = @request.auth.id && @request.body.status != 'ESTORNADO'",
      // Estornado fica travado; created_by não muda.
      updateRule:
        FIN_UPDATE +
        sameChurch +
        " && status != 'ESTORNADO' && @request.body.created_by:isset = false",
      deleteRule: null,
      fields: [
        churchField(churches.id),
        {
          name: 'type',
          type: 'select',
          required: true,
          values: ['ENTRADA', 'SAIDA'],
          maxSelect: 1,
        },
        { name: 'date', type: 'date', required: true },
        { name: 'amount_cents', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'description', type: 'text', max: 200 },
        {
          name: 'account_id',
          type: 'relation',
          required: true,
          collectionId: accounts.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'category_id',
          type: 'relation',
          collectionId: categories.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'cost_center_id',
          type: 'relation',
          collectionId: costCenters.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'payment_method',
          type: 'select',
          values: ['DINHEIRO', 'PIX', 'CARTAO', 'TRANSFERENCIA', 'BOLETO', 'CHEQUE', 'OUTRO'],
          maxSelect: 1,
        },
        {
          name: 'person_id',
          type: 'relation',
          collectionId: people.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'is_anonymous', type: 'bool' },
        {
          name: 'supplier_id',
          type: 'relation',
          collectionId: suppliers.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'event_id',
          type: 'relation',
          collectionId: events.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'attachment',
          type: 'file',
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
          protected: true,
        },
        { name: 'notes', type: 'text', max: 1000 },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['CONFIRMADO', 'ESTORNADO'],
          maxSelect: 1,
        },
        { name: 'void_reason', type: 'text', max: 300 },
        {
          name: 'created_by',
          type: 'relation',
          required: true,
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        ...timestamps(),
      ],
      indexes: [
        'CREATE INDEX idx_fin_transactions_church_date ON fin_transactions (church_id, date)',
        'CREATE INDEX idx_fin_transactions_account ON fin_transactions (account_id)',
        'CREATE INDEX idx_fin_transactions_person ON fin_transactions (person_id)',
      ],
    }))

    // 7. church_members: membro não altera o próprio papel nem as próprias funções
    const members = app.findCollectionByNameOrId('church_members')
    members.createRule = NEW_MEMBERS_CREATE
    members.updateRule = NEW_MEMBERS_UPDATE
    app.save(members)
  },
  (app) => {
    const members = app.findCollectionByNameOrId('church_members')
    members.createRule = OLD_MEMBERS_CREATE
    members.updateRule = OLD_MEMBERS_UPDATE
    app.save(members)

    for (const name of [
      'fin_transactions',
      'fin_suppliers',
      'fin_cost_centers',
      'fin_categories',
      'fin_accounts',
      'people',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
