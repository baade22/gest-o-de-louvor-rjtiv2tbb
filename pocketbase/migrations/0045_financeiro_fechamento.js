// Migração 0045: Financeiro, fechamento do mês.
// - fin_closings: um registro por fechamento. O mês fechado mais recente (status FECHADO)
//   trava tudo o que tem data até o fim dele: lançamentos, contagens e saldo inicial das contas
//   (hook finance_closing.js). Guarda o resumo do mês e a conferência no momento do fechamento.
// - Só o hook grava (fechar: MASTER ou FINANCEIRO; reabrir: só MASTER, com motivo).
//   Pela API só se lê.

const FIN_READ =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true && ' +
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\')'

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fin_closings')
      return
    } catch (_) {}
    const churches = app.findCollectionByNameOrId('churches')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const col = new Collection({
      name: 'fin_closings',
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
        // "2026-09"
        {
          name: 'month',
          type: 'text',
          required: true,
          pattern: '^\\d{4}-\\d{2}$',
          max: 7,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['FECHADO', 'REABERTO'],
          maxSelect: 1,
        },
        { name: 'notes', type: 'text', max: 1000 },
        { name: 'summary', type: 'json', maxSize: 200000 },
        { name: 'checklist', type: 'json', maxSize: 200000 },
        {
          name: 'closed_by',
          type: 'relation',
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'closed_by_name', type: 'text', max: 200 },
        { name: 'closed_at', type: 'date' },
        {
          name: 'reopened_by',
          type: 'relation',
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'reopened_by_name', type: 'text', max: 200 },
        { name: 'reopened_at', type: 'date' },
        { name: 'reopen_reason', type: 'text', max: 500 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_fin_closings_church_month ON fin_closings (church_id, month)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_closings'))
    } catch (_) {}
  },
)
