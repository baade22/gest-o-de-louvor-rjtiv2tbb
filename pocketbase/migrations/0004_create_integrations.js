migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')

    // Collection genérica de integrações multi-tenant
    // Regra de segurança: credentials nunca são retornadas em list/view do client
    // Apenas Superuser acessa diretamente a collection; clientes chamam os endpoints de API protegidos
    // ou regras restritas. Definindo listRule: null e viewRule: null garante isolamento total das credenciais.
    const integrations = new Collection({
      name: 'integrations',
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
          name: 'provider',
          type: 'text',
          required: true,
        },
        {
          name: 'name',
          type: 'text',
          required: true,
        },
        {
          name: 'enabled',
          type: 'bool',
        },
        {
          name: 'credentials',
          type: 'json',
        },
        {
          name: 'configuration',
          type: 'json',
        },
        {
          name: 'status',
          type: 'select',
          values: ['CONNECTED', 'DISCONNECTED', 'ERROR'],
          maxSelect: 1,
        },
        {
          name: 'last_tested_at',
          type: 'date',
        },
        {
          name: 'last_error_message',
          type: 'text',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_integrations_church ON integrations (church_id)',
        'CREATE UNIQUE INDEX idx_integrations_church_provider ON integrations (church_id, provider)',
      ],
    })
    app.save(integrations)
  },
  (app) => {
    try {
      const integrations = app.findCollectionByNameOrId('integrations')
      app.delete(integrations)
    } catch (_) {}
  },
)
