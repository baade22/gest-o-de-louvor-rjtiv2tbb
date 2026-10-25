// Migração 0060: Financeiro, auditoria do conselho fiscal.
// - Função operacional AUDITOR (Conselho fiscal): lê tudo do financeiro (como o ADMIN), não lança.
//   As regras de leitura (list/view) das coleções fin_* e de people passam a aceitar a função.
// - fin_audits: situação de cada lançamento auditado (aprovado, com ressalva, ressalva respondida).
// - fin_audit_comments: a conversa da ressalva (auditor registra, tesouraria responde).
// As duas só são gravadas pela rota /backend/v1/finance/audit (hook finance_audit.js).

const FIN_OP = '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\''
const AUDIT_OP = '@collection.church_members.operational_roles ?~ \'"AUDITOR"\''

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || " +
  FIN_OP +
  ' || ' +
  AUDIT_OP +
  ')'

function readCollections(app) {
  const names = ['people']
  for (const col of app.findAllCollections()) {
    if (col.name.indexOf('fin_') === 0) names.push(col.name)
  }
  return names
}

migrate(
  (app) => {
    for (const name of readCollections(app)) {
      const col = app.findCollectionByNameOrId(name)
      let changed = false
      for (const key of ['listRule', 'viewRule']) {
        const rule = col[key]
        if (rule && rule.indexOf(FIN_OP) !== -1 && rule.indexOf(AUDIT_OP) === -1) {
          col[key] = rule.split(FIN_OP).join(FIN_OP + ' || ' + AUDIT_OP)
          changed = true
        }
      }
      if (changed) app.save(col)
    }

    const churches = app.findCollectionByNameOrId('churches')
    const txs = app.findCollectionByNameOrId('fin_transactions')
    let audits
    try {
      audits = app.findCollectionByNameOrId('fin_audits')
    } catch (_) {
      audits = new Collection({
        name: 'fin_audits',
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
            name: 'transaction_id',
            type: 'relation',
            required: true,
            collectionId: txs.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'month', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}$' },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['APROVADO', 'RESSALVA', 'RESPONDIDA'],
            maxSelect: 1,
          },
          { name: 'approved_by', type: 'text', max: 30 },
          { name: 'approved_by_name', type: 'text', max: 200 },
          { name: 'approved_at', type: 'date' },
          // "updated" do lançamento na aprovação: se mudar depois, a aprovação deixa de valer
          { name: 'tx_updated', type: 'text', max: 40 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_fin_audits_tx ON fin_audits (transaction_id)',
          'CREATE INDEX idx_fin_audits_church_month ON fin_audits (church_id, month)',
        ],
      })
      app.save(audits)
    }

    try {
      app.findCollectionByNameOrId('fin_audit_comments')
    } catch (_) {
      app.save(
        new Collection({
          name: 'fin_audit_comments',
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
              name: 'audit_id',
              type: 'relation',
              required: true,
              collectionId: audits.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            { name: 'month', type: 'text', required: true, max: 7 },
            {
              name: 'kind',
              type: 'select',
              required: true,
              values: ['RESSALVA', 'RESPOSTA', 'APROVACAO'],
              maxSelect: 1,
            },
            { name: 'text', type: 'text', max: 2000 },
            { name: 'author_id', type: 'text', max: 30 },
            { name: 'author_name', type: 'text', max: 200 },
            { name: 'author_role', type: 'text', max: 40 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          ],
          indexes: [
            'CREATE INDEX idx_fin_audit_comments_church_month ON fin_audit_comments (church_id, month)',
          ],
        }),
      )
    }
  },
  (app) => {
    for (const name of ['fin_audit_comments', 'fin_audits']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    for (const name of readCollections(app)) {
      const col = app.findCollectionByNameOrId(name)
      let changed = false
      for (const key of ['listRule', 'viewRule']) {
        const rule = col[key]
        if (rule && rule.indexOf(' || ' + AUDIT_OP) !== -1) {
          col[key] = rule.split(' || ' + AUDIT_OP).join('')
          changed = true
        }
      }
      if (changed) app.save(col)
    }
  },
)
