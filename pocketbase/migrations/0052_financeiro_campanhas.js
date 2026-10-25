// Migração 0052: Financeiro, campanhas.
// - fin_campaigns: arrecadação com meta e prazo (reforma, missões, congresso), opcionalmente
//   de uma congregação. Não se apaga: encerra (status ENCERRADA) e pode reabrir.
// - campaign_id em fin_transactions e fin_bills: a entrada (ou saída) conta para a campanha;
//   a baixa de uma conta leva a campanha para o lançamento.

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const FIN_READ =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\' || ' +
  '@collection.church_members.operational_roles ?~ \'"AUDITOR"\')'
const FIN_WRITE =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || " +
  '@collection.church_members.operational_roles ?~ \'"FINANCEIRO"\')'

migrate(
  (app) => {
    let campaigns
    try {
      campaigns = app.findCollectionByNameOrId('fin_campaigns')
    } catch (_) {
      const churches = app.findCollectionByNameOrId('churches')
      campaigns = new Collection({
        name: 'fin_campaigns',
        type: 'base',
        listRule: FIN_READ,
        viewRule: FIN_READ,
        createRule: FIN_WRITE,
        updateRule:
          FIN_WRITE +
          ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)',
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
          { name: 'name', type: 'text', required: true, max: 120 },
          { name: 'description', type: 'text', max: 500 },
          { name: 'goal_cents', type: 'number', onlyInt: true, min: 0 },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          // Vazio = a igreja toda
          { name: 'congregation', type: 'text', max: 60 },
          {
            name: 'color',
            type: 'select',
            values: ['TEAL', 'INDIGO', 'ORANGE', 'ROSE', 'SKY', 'AMBER'],
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['ATIVA', 'ENCERRADA'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_fin_campaigns_church ON fin_campaigns (church_id)'],
      })
      app.save(campaigns)
    }

    for (const name of ['fin_transactions', 'fin_bills']) {
      const col = app.findCollectionByNameOrId(name)
      if (col.fields.getByName('campaign_id')) continue
      col.fields.add(
        new RelationField({
          name: 'campaign_id',
          collectionId: campaigns.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      col.indexes = (col.indexes || []).concat([
        `CREATE INDEX idx_${name}_campaign ON ${name} (campaign_id)`,
      ])
      app.save(col)
    }
  },
  (app) => {
    for (const name of ['fin_transactions', 'fin_bills']) {
      const col = app.findCollectionByNameOrId(name)
      if (!col.fields.getByName('campaign_id')) continue
      col.indexes = (col.indexes || []).filter((i) => i.indexOf('_campaign ') === -1)
      col.fields.removeByName('campaign_id')
      app.save(col)
    }
    try {
      app.delete(app.findCollectionByNameOrId('fin_campaigns'))
    } catch (_) {}
  },
)
