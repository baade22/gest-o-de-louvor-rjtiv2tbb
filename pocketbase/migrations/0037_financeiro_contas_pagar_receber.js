// Migração 0037: Financeiro, contas a pagar e a receber.
// - fin_bills: título com vencimento (a pagar para fornecedor, a receber de pessoa).
//   Fica ABERTO até a baixa, que é feita pelo hook finance_bills.js: ele cria o lançamento
//   (saída ou entrada) e marca o título como PAGO. Se o lançamento for estornado, o título
//   volta a ficar em aberto. Pela API ninguém marca como pago nem mexe nos dados da baixa.
// - Repetição mensal: os títulos gerados juntos dividem recurrence_group e são numerados
//   (installment de installments).
// - fin_transactions.bill_id: liga o lançamento ao título que ele quitou (só o hook grava).

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

const SETTLEMENT_UNTOUCHED =
  ' && @request.body.paid_at:isset = false && @request.body.paid_amount_cents:isset = false' +
  ' && @request.body.paid_account_id:isset = false && @request.body.transaction_id:isset = false'

const BILL_CREATE = FIN_WRITE + " && @request.body.status = 'ABERTO'" + SETTLEMENT_UNTOUCHED
// Só título em aberto é editado; dá para cancelar, mas não para marcar como pago.
const BILL_UPDATE =
  FIN_UPDATE +
  " && status = 'ABERTO'" +
  " && (@request.body.status:isset = false || @request.body.status = 'ABERTO' || @request.body.status = 'CANCELADO')" +
  SETTLEMENT_UNTOUCHED

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    const categories = app.findCollectionByNameOrId('fin_categories')
    const costCenters = app.findCollectionByNameOrId('fin_cost_centers')
    const suppliers = app.findCollectionByNameOrId('fin_suppliers')
    const people = app.findCollectionByNameOrId('people')
    const transactions = app.findCollectionByNameOrId('fin_transactions')

    let bills
    try {
      bills = app.findCollectionByNameOrId('fin_bills')
    } catch (_) {
      bills = new Collection({
        name: 'fin_bills',
        type: 'base',
        listRule: FIN_READ,
        viewRule: FIN_READ,
        createRule: BILL_CREATE,
        updateRule: BILL_UPDATE,
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
          {
            name: 'kind',
            type: 'select',
            required: true,
            values: ['PAGAR', 'RECEBER'],
            maxSelect: 1,
          },
          { name: 'description', type: 'text', required: true, max: 200 },
          { name: 'amount_cents', type: 'number', required: true, onlyInt: true, min: 1 },
          { name: 'due_date', type: 'date', required: true },
          { name: 'issue_date', type: 'date' },
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
            name: 'supplier_id',
            type: 'relation',
            collectionId: suppliers.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'person_id',
            type: 'relation',
            collectionId: people.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          // Conta prevista para pagar ou receber (a baixa pode usar outra)
          {
            name: 'account_id',
            type: 'relation',
            collectionId: accounts.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'document_type',
            type: 'select',
            values: ['BOLETO', 'NOTA_FISCAL', 'RECIBO', 'FATURA', 'CONTRATO', 'OUTRO'],
            maxSelect: 1,
          },
          { name: 'document_number', type: 'text', max: 60 },
          {
            name: 'attachment',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
            protected: true,
          },
          { name: 'notes', type: 'text', max: 1000 },
          { name: 'recurrence_group', type: 'text', max: 40 },
          { name: 'installment', type: 'number', onlyInt: true, min: 0 },
          { name: 'installments', type: 'number', onlyInt: true, min: 0 },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['ABERTO', 'PAGO', 'CANCELADO'],
            maxSelect: 1,
          },
          // Baixa (preenchida pelo hook)
          { name: 'paid_at', type: 'date' },
          { name: 'paid_amount_cents', type: 'number', onlyInt: true, min: 0 },
          {
            name: 'paid_account_id',
            type: 'relation',
            collectionId: accounts.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'transaction_id',
            type: 'relation',
            collectionId: transactions.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_fin_bills_church_due ON fin_bills (church_id, due_date)',
          'CREATE INDEX idx_fin_bills_status ON fin_bills (church_id, status)',
        ],
      })
      app.save(bills)
    }

    if (!transactions.fields.getByName('bill_id')) {
      transactions.fields.add(
        new RelationField({
          name: 'bill_id',
          collectionId: bills.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    // Lançamento de baixa só nasce pelo hook
    if (transactions.createRule.indexOf('bill_id:isset') === -1) {
      transactions.createRule += ' && @request.body.bill_id:isset = false'
      transactions.updateRule += ' && @request.body.bill_id:isset = false'
    }
    app.save(transactions)
  },
  (app) => {
    const transactions = app.findCollectionByNameOrId('fin_transactions')
    transactions.createRule = transactions.createRule.replace(
      ' && @request.body.bill_id:isset = false',
      '',
    )
    transactions.updateRule = transactions.updateRule.replace(
      ' && @request.body.bill_id:isset = false',
      '',
    )
    if (transactions.fields.getByName('bill_id')) transactions.fields.removeByName('bill_id')
    app.save(transactions)
    try {
      app.delete(app.findCollectionByNameOrId('fin_bills'))
    } catch (_) {}
  },
)
