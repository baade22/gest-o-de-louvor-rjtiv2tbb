// Migração 0078: Financeiro, registro de segurança das credenciais dos bancos.
// - fin_bank_audit: cada mudança nas credenciais (quem, quando, de qual IP), cada vez que o
//   conector recebe as credenciais e cada tentativa com chave do conector ou senha errada.
//   Tentativa com chave inválida não tem igreja (church_id vazio) e serve para bloquear o IP.
// - Sem regra de API: só os hooks finance_bank_secrets.js e finance_bank_sync.js gravam; a
//   tela de Integrações recebe as últimas linhas pela rota de credenciais.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_bank_audit')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const col = new Collection({
      name: 'fin_bank_audit',
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
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'event',
          type: 'select',
          required: true,
          values: [
            'CREDENCIAL_SALVA',
            'CREDENCIAL_APAGADA',
            'CHAVE_NOVA',
            'GITHUB',
            'CONECTOR_LEU',
            'CHAVE_INVALIDA',
            'SENHA_ERRADA',
          ],
          maxSelect: 1,
        },
        { name: 'detail', type: 'text', max: 300 },
        { name: 'ip', type: 'text', max: 64 },
        { name: 'user_name', type: 'text', max: 160 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX idx_fin_bank_audit_church ON fin_bank_audit (church_id, created)',
        'CREATE INDEX idx_fin_bank_audit_ip ON fin_bank_audit (ip, event, created)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_bank_audit'))
    } catch (_) {}
  },
)
