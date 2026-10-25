// Migração 0055: Financeiro, conexão da conta com a API do banco (Cora e Bradesco).
// - fin_bank_connections: qual banco, ambiente, agência e conta de cada conta do financeiro.
//   As credenciais (client id, segredo, certificado e chave privada) NÃO ficam aqui: ficam só
//   no conector bancário (bank-sync/), que busca saldo e extrato e entrega ao hook
//   finance_bank_sync.js. Os campos de situação (último saldo, última busca, erro) só o hook
//   grava; pela API dá para cadastrar, editar, pausar e excluir a conexão.

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true"
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"
const FIN_WRITE =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')"

const STATUS_FIELDS = [
  'last_sync_at',
  'last_status',
  'last_error',
  'balance_cents',
  'available_cents',
  'balance_at',
  'has_balance',
  'last_created',
  'last_auto_reconciled',
  'sync_requested_at',
]
const NO_STATUS = STATUS_FIELDS.map((f) => ' && @request.body.' + f + ':isset = false').join('')

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_bank_connections')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const accounts = app.findCollectionByNameOrId('fin_accounts')
    const col = new Collection({
      name: 'fin_bank_connections',
      type: 'base',
      listRule: FIN_READ,
      viewRule: FIN_READ,
      createRule: FIN_WRITE + NO_STATUS,
      updateRule: FIN_WRITE + NO_STATUS + ' && @request.body.church_id:isset = false',
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
        {
          name: 'account_id',
          type: 'relation',
          required: true,
          collectionId: accounts.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'provider',
          type: 'select',
          required: true,
          values: ['CORA', 'BRADESCO'],
          maxSelect: 1,
        },
        {
          name: 'environment',
          type: 'select',
          required: true,
          values: ['PRODUCAO', 'TESTE'],
          maxSelect: 1,
        },
        // Bradesco: agência e conta sem o dígito; a Cora identifica a conta pelo certificado
        { name: 'branch', type: 'text', max: 10, pattern: '^[0-9]*$' },
        { name: 'account_number', type: 'text', max: 15, pattern: '^[0-9]*$' },
        { name: 'account_type', type: 'select', values: ['CC', 'CP'], maxSelect: 1 },
        // Nome do conjunto de credenciais no conector, quando há mais de uma conta no mesmo
        // banco com credenciais diferentes (ex.: DIAMANTE → CORA_DIAMANTE_CLIENT_ID)
        { name: 'credential_key', type: 'text', max: 30, pattern: '^[A-Za-z0-9_]*$' },
        { name: 'enabled', type: 'bool' },
        // Concilia sozinho quando há um único lançamento com o mesmo valor e sentido
        { name: 'auto_reconcile', type: 'bool' },
        // Na primeira busca, quantos dias para trás
        { name: 'initial_days', type: 'number', onlyInt: true, min: 1, max: 365 },
        { name: 'last_sync_at', type: 'date' },
        { name: 'last_status', type: 'select', values: ['OK', 'ERRO'], maxSelect: 1 },
        { name: 'last_error', type: 'text', max: 500 },
        { name: 'balance_cents', type: 'number', onlyInt: true },
        { name: 'available_cents', type: 'number', onlyInt: true },
        { name: 'balance_at', type: 'date' },
        { name: 'has_balance', type: 'bool' },
        { name: 'last_created', type: 'number', onlyInt: true, min: 0 },
        { name: 'last_auto_reconciled', type: 'number', onlyInt: true, min: 0 },
        { name: 'sync_requested_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_fin_bank_connections_account ON fin_bank_connections (account_id)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_bank_connections'))
    } catch (_) {}
  },
)
