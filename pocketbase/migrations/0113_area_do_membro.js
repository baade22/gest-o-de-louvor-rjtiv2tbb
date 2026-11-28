// Migração 0113: área do membro no app da igreja (pedido do Pedro, 28/11/2026).
//
// O "Entrar" do app (/igreja) deixa de abrir o LouvorFlow: o membro entra com o celular que
// está na ficha dele (people.phone) e um código de 6 números mandado pelo WhatsApp da igreja
// (ou pelo e-mail da ficha). Sem senha. Rotas no hook member_area.js.
//
// - member_login_codes: os códigos pedidos. Só o servidor lê e grava (sem regras de API).
//   Guarda só o hash do código, para quem foi (celular ou e-mail normalizado), as fichas que
//   batem com esse contato, validade (10 min), tentativas (máx. 5) e IP.
// - people.card_code: código aleatório da carteirinha digital. O QR da carteirinha leva a
//   /igreja/carteirinha/<código>, que só diz se ela é válida, de quem é e a situação.
// - people_signups.relative_of / relative_kind: "adicionar familiar" pela área do membro entra
//   como cadastro pendente; ao aprovar, o hook member_area.js cria o vínculo em people_relations
//   ("relative_of tem como <relative_kind> a pessoa aprovada").
// - whatsapp_messages.kind ganha CODIGO (código de entrada; registrado, não entra na fila).
// - Limites por IP: pedir código 5 a cada 10 min; conferir código 15 a cada 10 min.
//
// A conta criada para o membro (users, e-mail técnico @membros.invalid) não tem church_members:
// não entra no LouvorFlow e não lê nenhuma coleção. Tudo o que ela vê passa pelas rotas
// /backend/v1/member/*, que só devolvem a própria ficha e a família.

const CODE_RATE = {
  label: 'POST /backend/v1/public/member/code',
  audience: '',
  duration: 600,
  maxRequests: 5,
}
const VERIFY_RATE = {
  label: 'POST /backend/v1/public/member/verify',
  audience: '',
  duration: 600,
  maxRequests: 15,
}

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    let codes = null
    try {
      codes = app.findCollectionByNameOrId('member_login_codes')
    } catch (_) {}
    if (!codes) {
      codes = new Collection({
        name: 'member_login_codes',
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
            name: 'channel',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['WHATSAPP', 'EMAIL'],
          },
          { name: 'target', type: 'text', required: true, max: 200 },
          { name: 'person_ids', type: 'json', maxSize: 20000 },
          { name: 'code_hash', type: 'text', required: true, max: 200 },
          { name: 'expires_at', type: 'date' },
          { name: 'attempts', type: 'number', onlyInt: true, min: 0 },
          { name: 'used', type: 'bool' },
          { name: 'ip', type: 'text', max: 80 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_member_login_codes_target ON member_login_codes (church_id, target, created)',
        ],
      })
      app.save(codes)
    }

    const people = app.findCollectionByNameOrId('people')
    if (!people.fields.getByName('card_code')) {
      people.fields.add(new TextField({ name: 'card_code', max: 40 }))
      app.save(people)
    }

    const signups = app.findCollectionByNameOrId('people_signups')
    if (!signups.fields.getByName('relative_of')) {
      signups.fields.add(
        new RelationField({
          name: 'relative_of',
          collectionId: people.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      signups.fields.add(
        new SelectField({
          name: 'relative_kind',
          maxSelect: 1,
          values: ['CONJUGE', 'FILHO', 'PAI_MAE', 'IRMAO', 'OUTRO'],
        }),
      )
      app.save(signups)
    }

    const messages = app.findCollectionByNameOrId('whatsapp_messages')
    const kind = messages.fields.getByName('kind')
    const values = []
    for (const v of kind.values) values.push('' + v)
    if (values.indexOf('CODIGO') === -1) {
      values.push('CODIGO')
      kind.values = values
      app.save(messages)
    }

    const s = app.settings()
    let rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    for (const r of [VERIFY_RATE, CODE_RATE]) {
      if (!rules.some((x) => x.label === r.label)) rules = [r].concat(rules)
    }
    s.rateLimits.rules = rules
    app.save(s)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('member_login_codes'))
    } catch (_) {}
    try {
      const people = app.findCollectionByNameOrId('people')
      if (people.fields.getByName('card_code')) {
        people.fields.removeByName('card_code')
        app.save(people)
      }
    } catch (_) {}
    try {
      const signups = app.findCollectionByNameOrId('people_signups')
      for (const n of ['relative_of', 'relative_kind']) {
        if (signups.fields.getByName(n)) signups.fields.removeByName(n)
      }
      app.save(signups)
    } catch (_) {}
    try {
      const messages = app.findCollectionByNameOrId('whatsapp_messages')
      const kind = messages.fields.getByName('kind')
      const values = []
      for (const v of kind.values) if ('' + v !== 'CODIGO') values.push('' + v)
      kind.values = values
      app.save(messages)
    } catch (_) {}
    const s = app.settings()
    const rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    s.rateLimits.rules = rules.filter(
      (r) => r.label !== CODE_RATE.label && r.label !== VERIFY_RATE.label,
    )
    app.save(s)
  },
)
