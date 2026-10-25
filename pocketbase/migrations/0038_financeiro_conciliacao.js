// Migração 0038: Financeiro, conciliação do extrato bancário (OFX).
// - fin_bank_imports: cada arquivo importado (conta, período, saldo informado pelo banco).
// - fin_bank_lines: cada movimento do extrato. Só o hook finance_reconcile.js cria linhas e
//   liga uma linha a um lançamento; pela API dá apenas para ignorar uma linha pendente (tarifa
//   já lançada em outro lugar, por exemplo) ou voltar a deixá-la pendente.
//   O mesmo movimento (FITID) importado de novo na mesma conta é descartado pelo índice único.
// - fin_transactions.bank_line_id: marca o lançamento como conciliado (só o hook grava).

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true"
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"
const FIN_WRITE =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"

// Pendente <-> ignorada; o resto da linha é do banco e não muda.
const LINE_UPDATE =
  FIN_WRITE +
  " && status != 'CONCILIADO'" +
  " && (@request.body.status = 'PENDENTE' || @request.body.status = 'IGNORADO')" +
  ' && @request.body.church_id:isset = false && @request.body.account_id:isset = false' +
  ' && @request.body.import_id:isset = false && @request.body.fitid:isset = false' +
  ' && @request.body.date:isset = false && @request.body.amount_cents:isset = false' +
  ' && @request.body.description:isset = false && @request.body.transaction_id:isset = false'

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    const transactions = app.findCollectionByNameOrId('fin_transactions')

    let imports
    try {
      imports = app.findCollectionByNameOrId('fin_bank_imports')
    } catch (_) {
      imports = new Collection({
        name: 'fin_bank_imports',
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
          {
            name: 'account_id',
            type: 'relation',
            required: true,
            collectionId: accounts.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'file_name', type: 'text', max: 200 },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          // Saldo que o banco informa no arquivo (LEDGERBAL), quando vem
          { name: 'balance_cents', type: 'number', onlyInt: true },
          { name: 'balance_date', type: 'date' },
          { name: 'has_balance', type: 'bool' },
          { name: 'lines_created', type: 'number', onlyInt: true, min: 0 },
          { name: 'lines_skipped', type: 'number', onlyInt: true, min: 0 },
          { name: 'imported_by_name', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_fin_bank_imports_account ON fin_bank_imports (account_id)'],
      })
      app.save(imports)
    }

    try {
      app.findCollectionByNameOrId('fin_bank_lines')
    } catch (_) {
      const lines = new Collection({
        name: 'fin_bank_lines',
        type: 'base',
        listRule: FIN_READ,
        viewRule: FIN_READ,
        createRule: null,
        updateRule: LINE_UPDATE,
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
            name: 'account_id',
            type: 'relation',
            required: true,
            collectionId: accounts.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'import_id',
            type: 'relation',
            collectionId: imports.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'fitid', type: 'text', required: true, max: 255 },
          { name: 'date', type: 'date', required: true },
          // Positivo = crédito (entrou), negativo = débito (saiu)
          { name: 'amount_cents', type: 'number', required: true, onlyInt: true },
          { name: 'description', type: 'text', max: 500 },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['PENDENTE', 'CONCILIADO', 'IGNORADO'],
            maxSelect: 1,
          },
          {
            name: 'transaction_id',
            type: 'relation',
            collectionId: transactions.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'reconciled_at', type: 'date' },
          { name: 'reconciled_by_name', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_fin_bank_lines_fitid ON fin_bank_lines (account_id, fitid)',
          'CREATE INDEX idx_fin_bank_lines_status ON fin_bank_lines (church_id, status)',
        ],
      })
      app.save(lines)
    }

    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    if (!transactions.fields.getByName('bank_line_id')) {
      transactions.fields.add(
        new RelationField({
          name: 'bank_line_id',
          collectionId: lines.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    if (transactions.createRule.indexOf('bank_line_id:isset') === -1) {
      transactions.createRule += ' && @request.body.bank_line_id:isset = false'
      transactions.updateRule += ' && @request.body.bank_line_id:isset = false'
    }
    app.save(transactions)
  },
  (app) => {
    const transactions = app.findCollectionByNameOrId('fin_transactions')
    transactions.createRule = transactions.createRule.replace(
      ' && @request.body.bank_line_id:isset = false',
      '',
    )
    transactions.updateRule = transactions.updateRule.replace(
      ' && @request.body.bank_line_id:isset = false',
      '',
    )
    if (transactions.fields.getByName('bank_line_id'))
      transactions.fields.removeByName('bank_line_id')
    app.save(transactions)
    for (const name of ['fin_bank_lines', 'fin_bank_imports']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
