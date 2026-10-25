// Migração 0052: Financeiro, fase 2.
// - fin_accounts.congregation: congregação dona da conta (ex.: Aldeia, Diamante). Um financeiro
//   só por igreja, com o painel filtrando por congregação.
// - fin_transactions: novo tipo TRANSFERENCIA (sai de account_id e entra em to_account_id, sem
//   contar como entrada nem saída) e count_id, que liga o lançamento à contagem que o gerou.
// - fin_counts: contagem do culto. Uma pessoa conta e registra o valor total em dinheiro e os
//   envelopes; outra pessoa confere e aprova. A aprovação (hook finance_counts.js) cria os
//   lançamentos e trava a contagem. Pela API não dá para aprovar nem mudar quem contou.

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true"
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"
const FIN_WRITE =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"
const FIN_UPDATE =
  FIN_WRITE + ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'

const SAME_CHURCH =
  ' && account_id.church_id = church_id' +
  " && (category_id = '' || category_id.church_id = church_id)" +
  " && (cost_center_id = '' || cost_center_id.church_id = church_id)" +
  " && (person_id = '' || person_id.church_id = church_id)" +
  " && (supplier_id = '' || supplier_id.church_id = church_id)" +
  " && (event_id = '' || event_id.church_id = church_id)"

// Regras da 0051, para o down.
const OLD_TX_CREATE =
  FIN_WRITE +
  SAME_CHURCH +
  " && @request.body.created_by = @request.auth.id && @request.body.status != 'ESTORNADO'"
const OLD_TX_UPDATE =
  FIN_UPDATE + SAME_CHURCH + " && status != 'ESTORNADO' && @request.body.created_by:isset = false"

// Transferência: conta de destino da mesma igreja e diferente da origem.
const TRANSFER_OK =
  " && (type != 'TRANSFERENCIA' || (to_account_id != '' && to_account_id != account_id && to_account_id.church_id = church_id))"
// Lançamentos de contagem só nascem pela aprovação (hook); pela API ninguém mexe em count_id.
const NEW_TX_CREATE = OLD_TX_CREATE + TRANSFER_OK + ' && @request.body.count_id:isset = false'
const NEW_TX_UPDATE = OLD_TX_UPDATE + TRANSFER_OK + ' && @request.body.count_id:isset = false'

// Contagem: quem cria é quem contou; status, aprovação e quem contou não são mexidos pela API.
const COUNT_SAME_CHURCH =
  ' && account_id.church_id = church_id' +
  ' && offering_category_id.church_id = church_id' +
  " && (event_id = '' || event_id.church_id = church_id)"
const COUNT_CREATE =
  FIN_WRITE +
  COUNT_SAME_CHURCH +
  " && @request.body.counted_by = @request.auth.id && @request.body.status = 'CONTADO'" +
  ' && @request.body.approved_by:isset = false && @request.body.approved_at:isset = false' +
  ' && @request.body.approved_by_name:isset = false'
const COUNT_UPDATE =
  FIN_UPDATE +
  COUNT_SAME_CHURCH +
  " && status = 'CONTADO'" +
  " && (@request.body.status:isset = false || @request.body.status = 'CONTADO' || @request.body.status = 'CANCELADO')" +
  ' && @request.body.counted_by:isset = false && @request.body.counted_by_name:isset = false' +
  ' && @request.body.approved_by:isset = false && @request.body.approved_at:isset = false' +
  ' && @request.body.approved_by_name:isset = false'

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const events = app.findCollectionByNameOrId('events')
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    const categories = app.findCollectionByNameOrId('fin_categories')
    const transactions = app.findCollectionByNameOrId('fin_transactions')

    // 1. Congregação da conta
    if (!accounts.fields.getByName('congregation')) {
      accounts.fields.add(new TextField({ name: 'congregation', max: 80 }))
      app.save(accounts)
    }

    // 2. Contagem do culto
    let counts
    try {
      counts = app.findCollectionByNameOrId('fin_counts')
    } catch (_) {
      counts = new Collection({
        name: 'fin_counts',
        type: 'base',
        listRule: FIN_READ,
        viewRule: FIN_READ,
        createRule: COUNT_CREATE,
        updateRule: COUNT_UPDATE,
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
          { name: 'date', type: 'date', required: true },
          {
            name: 'event_id',
            type: 'relation',
            collectionId: events.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Conta que recebe o dinheiro (normalmente o caixa da congregação)
          {
            name: 'account_id',
            type: 'relation',
            required: true,
            collectionId: accounts.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Dinheiro solto da salva: valor total, sem separar notas
          { name: 'cash_cents', type: 'number', onlyInt: true, min: 0 },
          {
            name: 'offering_category_id',
            type: 'relation',
            required: true,
            collectionId: categories.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Envelopes: [{ person_id?: string, category_id: string, amount_cents: number }]
          { name: 'envelopes', type: 'json', maxSize: 200000 },
          { name: 'notes', type: 'text', max: 1000 },
          // Diferença apontada por quem conferiu; quem contou corrige e a contagem volta para conferência
          { name: 'difference_note', type: 'text', max: 500 },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['CONTADO', 'APROVADO', 'CANCELADO'],
            maxSelect: 1,
          },
          {
            name: 'counted_by',
            type: 'relation',
            required: true,
            collectionId: users.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'approved_by',
            type: 'relation',
            collectionId: users.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'approved_at', type: 'date' },
          // Nomes de quem contou e de quem aprovou, preenchidos pelo servidor (a coleção de
          // usuários não é visível entre membros)
          { name: 'counted_by_name', type: 'text', max: 160 },
          { name: 'approved_by_name', type: 'text', max: 160 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_fin_counts_church_date ON fin_counts (church_id, date)'],
      })
      app.save(counts)
    }

    // 3. Lançamentos: transferência e ligação com a contagem
    const type = transactions.fields.getByName('type')
    if (!type.values.includes('TRANSFERENCIA')) {
      type.values = ['ENTRADA', 'SAIDA', 'TRANSFERENCIA']
    }
    if (!transactions.fields.getByName('to_account_id')) {
      transactions.fields.add(
        new RelationField({
          name: 'to_account_id',
          collectionId: accounts.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    if (!transactions.fields.getByName('count_id')) {
      transactions.fields.add(
        new RelationField({
          name: 'count_id',
          collectionId: counts.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    transactions.createRule = NEW_TX_CREATE
    transactions.updateRule = NEW_TX_UPDATE
    app.save(transactions)
  },
  (app) => {
    const transactions = app.findCollectionByNameOrId('fin_transactions')
    transactions.createRule = OLD_TX_CREATE
    transactions.updateRule = OLD_TX_UPDATE
    for (const name of ['count_id', 'to_account_id']) {
      if (transactions.fields.getByName(name)) transactions.fields.removeByName(name)
    }
    transactions.fields.getByName('type').values = ['ENTRADA', 'SAIDA']
    app.save(transactions)

    try {
      app.delete(app.findCollectionByNameOrId('fin_counts'))
    } catch (_) {}

    const accounts = app.findCollectionByNameOrId('fin_accounts')
    if (accounts.fields.getByName('congregation')) {
      accounts.fields.removeByName('congregation')
      app.save(accounts)
    }
  },
)
