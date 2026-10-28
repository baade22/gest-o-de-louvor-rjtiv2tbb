// Migração 0076: Financeiro, credenciais das APIs da Cora e do Bradesco cadastradas pelo app.
// - fin_bank_secrets: um registro por banco, ambiente e conjunto de credenciais (client ID,
//   segredo, certificado e chave privada), cifrado com LOUVORFLOW_CREDENTIALS_KEY. Mais um
//   registro CONECTOR por igreja com a chave do conector (só o hash) e, opcional, o acesso ao
//   GitHub para o botão "Atualizar agora".
// - Sem regra de API: ninguém lê nem grava pela API comum. Tudo passa pelas rotas de
//   hooks/finance_bank_secrets.js (só o MASTER grava; a tela recebe só o resumo, nunca o
//   segredo) e o conector bancário recebe as credenciais decifradas em
//   /backend/v1/finance/bank-sync/connections.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_bank_secrets')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const col = new Collection({
      name: 'fin_bank_secrets',
      type: 'base',
      listRule: null,
      viewRule: null,
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
          name: 'kind',
          type: 'select',
          required: true,
          values: ['CORA', 'BRADESCO', 'CONECTOR'],
          maxSelect: 1,
        },
        { name: 'environment', type: 'select', values: ['PRODUCAO', 'TESTE'], maxSelect: 1 },
        { name: 'credential_key', type: 'text', max: 30, pattern: '^[A-Z0-9_]*$' },
        // { enc: 'v1', data } com o JSON das credenciais cifrado
        { name: 'data', type: 'json', maxSize: 200000 },
        // Hash SHA-256 da chave do conector (registro CONECTOR)
        { name: 'token_hash', type: 'text', max: 64 },
        // O que a tela pode mostrar: client ID mascarado, impressão digital do certificado...
        { name: 'summary', type: 'json', maxSize: 5000 },
        { name: 'updated_by_name', type: 'text', max: 160 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_fin_bank_secrets_set ON fin_bank_secrets (church_id, kind, environment, credential_key)',
        'CREATE INDEX idx_fin_bank_secrets_token ON fin_bank_secrets (token_hash)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_bank_secrets'))
    } catch (_) {}
  },
)
