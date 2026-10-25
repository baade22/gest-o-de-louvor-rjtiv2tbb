// Migração 0047: Membresia — eventos da igreja com inscrição, pagamento e presença.
//
// Não confundir com `events` (cultos e escalas do louvor). Aqui ficam retiro,
// batismo, curso, congresso:
// - church_events: o evento, com valor, vagas, instruções de pagamento e uma
//   chave para o link público de inscrição.
// - church_event_registrations: cada inscrito, com pagamento e presença. Pode
//   estar ligado a uma ficha (people) ou ser só nome e telefone (visitante,
//   inscrição pelo link).
//
// Só MASTER/ADMIN da igreja mexem. A inscrição pelo link público passa pelas
// rotas /backend/v1/event-signup/* (hooks/church_event_signup.js), com limite
// por IP, e confere se o evento está aberto e tem vaga.

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

    let events
    try {
      events = app.findCollectionByNameOrId('church_events')
    } catch (_) {
      events = new Collection({
        name: 'church_events',
        type: 'base',
        listRule: ADMIN_OF_CHURCH,
        viewRule: ADMIN_OF_CHURCH,
        createRule: ADMIN_OF_CHURCH,
        updateRule:
          ADMIN_OF_CHURCH + ' && ' + KEEP_CHURCH + ' && @request.body.public_key:isset = false',
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
          { name: 'title', type: 'text', required: true, max: 160 },
          { name: 'description', type: 'text', max: 3000 },
          { name: 'starts_on', type: 'date', required: true },
          { name: 'ends_on', type: 'date' },
          { name: 'start_time', type: 'text', max: 5 },
          { name: 'location', type: 'text', max: 200 },
          { name: 'congregation', type: 'text', max: 120 },
          // Valor por inscrição em reais (0 = gratuito)
          { name: 'price', type: 'number', min: 0 },
          // Vagas (0 = sem limite)
          { name: 'capacity', type: 'number', min: 0, onlyInt: true },
          { name: 'payment_info', type: 'text', max: 500 },
          { name: 'registration_open', type: 'bool' },
          {
            name: 'public_key',
            type: 'text',
            required: true,
            min: 20,
            max: 40,
            pattern: '^[A-Za-z0-9]+$',
          },
          { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_church_events_key ON church_events (public_key)',
          'CREATE INDEX idx_church_events_church_date ON church_events (church_id, starts_on)',
        ],
      })
      app.save(events)
    }

    try {
      app.findCollectionByNameOrId('church_event_registrations')
    } catch (_) {
      const SAME_CHURCH =
        ' && @request.body.event_id.church_id = @request.body.church_id' +
        " && (@request.body.person_id:isset = false || @request.body.person_id = '' || @request.body.person_id.church_id = @request.body.church_id)"
      app.save(
        new Collection({
          name: 'church_event_registrations',
          type: 'base',
          listRule: ADMIN_OF_CHURCH,
          viewRule: ADMIN_OF_CHURCH,
          createRule: ADMIN_OF_CHURCH + SAME_CHURCH,
          updateRule:
            ADMIN_OF_CHURCH +
            ' && ' +
            KEEP_CHURCH +
            ' && @request.body.event_id:isset = false' +
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
            {
              name: 'event_id',
              type: 'relation',
              required: true,
              collectionId: events.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            { name: 'person_id', type: 'relation', collectionId: people.id, maxSelect: 1 },
            { name: 'name', type: 'text', required: true, max: 200 },
            { name: 'phone', type: 'text', max: 40 },
            { name: 'email', type: 'text', max: 200 },
            { name: 'notes', type: 'text', max: 500 },
            { name: 'source', type: 'select', values: ['SECRETARIA', 'LINK'], maxSelect: 1 },
            { name: 'paid', type: 'bool' },
            { name: 'paid_amount', type: 'number', min: 0 },
            {
              name: 'payment_method',
              type: 'select',
              values: ['PIX', 'DINHEIRO', 'CARTAO', 'ISENTO', 'OUTRO'],
              maxSelect: 1,
            },
            { name: 'attended', type: 'bool' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE INDEX idx_church_event_regs_event ON church_event_registrations (event_id)',
          ],
        }),
      )
    }

    const settings = app.settings()
    const rules = Array.isArray(settings.rateLimits.rules) ? settings.rateLimits.rules : []
    const custom = [
      { label: 'POST /backend/v1/event-signup', audience: '', duration: 600, maxRequests: 5 },
      { label: '/backend/v1/event-signup/info', audience: '', duration: 60, maxRequests: 30 },
    ]
    const labels = rules.map((r) => r.label)
    settings.rateLimits.rules = custom.filter((r) => labels.indexOf(r.label) === -1).concat(rules)
    app.save(settings)
  },
  (app) => {
    for (const name of ['church_event_registrations', 'church_events']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    const settings = app.settings()
    const rules = Array.isArray(settings.rateLimits.rules) ? settings.rateLimits.rules : []
    settings.rateLimits.rules = rules.filter(
      (r) =>
        r.label !== 'POST /backend/v1/event-signup' && r.label !== '/backend/v1/event-signup/info',
    )
    app.save(settings)
  },
)
