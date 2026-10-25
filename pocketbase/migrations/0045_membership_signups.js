// Migração 0045: Membresia (fase 3) — autocadastro por QR code / link.
//
// - people_signup_links: links de cadastro da igreja (um por congregação, se
//   quiser). Cada link tem uma chave aleatória que vai no QR code e pode ser
//   desligado a qualquer momento.
// - people_signups: fichas enviadas pelo formulário público, aguardando a
//   secretaria aprovar (vira ficha em people), juntar com uma ficha existente
//   ou recusar.
//
// Ninguém cria people_signups pela API: o formulário público passa pelas rotas
// /backend/v1/signup/* (hooks/people_signup.pb.js), que validam a chave do link
// e os campos. Ler, aprovar e apagar é só para MASTER/ADMIN da igreja, como a
// ficha (0043). As rotas públicas ganham um limite de requisições por IP.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const people = app.findCollectionByNameOrId('people')

    const ADMIN_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true && ' +
      "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    const KEEP_CHURCH =
      '(@request.body.church_id:isset = false || @request.body.church_id = church_id)'

    let links
    try {
      links = app.findCollectionByNameOrId('people_signup_links')
    } catch (_) {
      links = new Collection({
        name: 'people_signup_links',
        type: 'base',
        listRule: ADMIN_OF_CHURCH,
        viewRule: ADMIN_OF_CHURCH,
        createRule: ADMIN_OF_CHURCH,
        // a chave não muda depois de criada (desligar o link é o caminho)
        updateRule: ADMIN_OF_CHURCH + ' && ' + KEEP_CHURCH + ' && @request.body.key:isset = false',
        deleteRule: ADMIN_OF_CHURCH,
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'title', type: 'text', required: true, max: 120 },
          { name: 'congregation', type: 'text', max: 120 },
          // Chave do QR code: só letras e números, longa o bastante para não ser adivinhada
          { name: 'key', type: 'text', required: true, min: 20, max: 40, pattern: '^[A-Za-z0-9]+$' },
          { name: 'active', type: 'bool' },
          { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_people_signup_links_key ON people_signup_links (key)'],
      })
      app.save(links)
    }

    try {
      app.findCollectionByNameOrId('people_signups')
    } catch (_) {
      app.save(
        new Collection({
          name: 'people_signups',
          type: 'base',
          listRule: ADMIN_OF_CHURCH,
          viewRule: ADMIN_OF_CHURCH,
          createRule: null,
          // a ficha ligada na aprovação precisa ser da mesma igreja
          updateRule:
            ADMIN_OF_CHURCH +
            ' && ' +
            KEEP_CHURCH +
            " && (@request.body.person_id:isset = false || @request.body.person_id = '' || @request.body.person_id.church_id = church_id)",
          deleteRule: ADMIN_OF_CHURCH,
          fields: [
            {
              name: 'church_id',
              type: 'relation',
              required: true,
              collectionId: churches.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            { name: 'link_id', type: 'relation', collectionId: links.id, maxSelect: 1 },
            { name: 'name', type: 'text', required: true, max: 200 },
            { name: 'birth_date', type: 'date' },
            { name: 'gender', type: 'select', values: ['M', 'F'], maxSelect: 1 },
            {
              name: 'marital_status',
              type: 'select',
              values: ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL'],
              maxSelect: 1,
            },
            { name: 'phone', type: 'text', max: 40 },
            { name: 'email', type: 'text', max: 200 },
            { name: 'address', type: 'text', max: 300 },
            { name: 'neighborhood', type: 'text', max: 120 },
            { name: 'city', type: 'text', max: 120 },
            { name: 'state', type: 'text', max: 2 },
            { name: 'zip_code', type: 'text', max: 10 },
            { name: 'congregation', type: 'text', max: 120 },
            // Como a pessoa se vê: primeira visita, frequenta, já é membro
            {
              name: 'relationship',
              type: 'select',
              required: true,
              values: ['VISITANTE', 'FREQUENTA', 'MEMBRO'],
              maxSelect: 1,
            },
            { name: 'baptized', type: 'bool' },
            { name: 'how_found', type: 'text', max: 200 },
            { name: 'prayer_request', type: 'text', max: 1000 },
            {
              name: 'status',
              type: 'select',
              required: true,
              values: ['PENDENTE', 'APROVADO', 'RECUSADO'],
              maxSelect: 1,
            },
            // Ficha criada ou atualizada na aprovação
            { name: 'person_id', type: 'relation', collectionId: people.id, maxSelect: 1 },
            { name: 'reviewed_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
            { name: 'reviewed_at', type: 'date' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE INDEX idx_people_signups_church_status ON people_signups (church_id, status)',
          ],
        }),
      )
    }

    // Limite por IP nas rotas públicas (antes das regras genéricas: a primeira que casa vence)
    const settings = app.settings()
    const rules = Array.isArray(settings.rateLimits.rules) ? settings.rateLimits.rules : []
    const custom = [
      { label: 'POST /backend/v1/signup', audience: '', duration: 600, maxRequests: 5 },
      { label: '/backend/v1/signup/info', audience: '', duration: 60, maxRequests: 30 },
    ]
    const labels = rules.map((r) => r.label)
    settings.rateLimits.rules = custom.filter((r) => labels.indexOf(r.label) === -1).concat(rules)
    app.save(settings)
  },
  (app) => {
    for (const name of ['people_signups', 'people_signup_links']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    const settings = app.settings()
    const rules = Array.isArray(settings.rateLimits.rules) ? settings.rateLimits.rules : []
    settings.rateLimits.rules = rules.filter(
      (r) => r.label !== 'POST /backend/v1/signup' && r.label !== '/backend/v1/signup/info',
    )
    app.save(settings)
  },
)
