// Migração 0044: Membresia (fase 2) — perfil da pessoa.
//
// - people ganha nº do rol e habilidades (para achar voluntários).
// - people_events: linha do tempo da pessoa (mudanças de situação com motivo,
//   cargos, visitas, contatos e anotações). Datas de batismo/casamento etc. que
//   já estão na ficha aparecem na linha do tempo sem precisar de registro aqui.
// - people_relations: vínculos de família entre fichas da mesma igreja.
//
// Mesma regra da ficha (0043): só MASTER/ADMIN ativos da igreja do registro, o
// church_id não pode ser trocado e as fichas ligadas precisam ser da mesma igreja.

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

    if (!people.fields.getByName('roll_number')) {
      people.fields.add(new TextField({ name: 'roll_number', max: 20 }))
    }
    if (!people.fields.getByName('skills')) {
      people.fields.add(
        new SelectField({
          name: 'skills',
          maxSelect: 16,
          values: [
            'CANTA',
            'VIOLAO',
            'GUITARRA',
            'BAIXO',
            'TECLADO',
            'BATERIA',
            'PERCUSSAO',
            'SOPRO',
            'SOM',
            'LUZ',
            'PROJECAO',
            'VIDEO_FOTO',
            'RECEPCAO',
            'INFANTIL',
            'ENSINO',
            'COZINHA',
          ],
        }),
      )
    }
    app.save(people)

    try {
      app.findCollectionByNameOrId('people_events')
    } catch (_) {
      const SAME_CHURCH = ' && @request.body.person_id.church_id = @request.body.church_id'
      app.save(
        new Collection({
          name: 'people_events',
          type: 'base',
          listRule: ADMIN_OF_CHURCH,
          viewRule: ADMIN_OF_CHURCH,
          createRule: ADMIN_OF_CHURCH + SAME_CHURCH,
          // person_id também não pode ser trocado para uma ficha de outra igreja
          updateRule:
            ADMIN_OF_CHURCH +
            ' && ' +
            KEEP_CHURCH +
            ' && (@request.body.person_id:isset = false || @request.body.person_id.church_id = church_id)',
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
              name: 'person_id',
              type: 'relation',
              required: true,
              collectionId: people.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            {
              name: 'kind',
              type: 'select',
              required: true,
              values: ['SITUACAO', 'CARGO', 'VISITA', 'CONTATO', 'NOTA'],
              maxSelect: 1,
            },
            { name: 'date', type: 'date', required: true },
            { name: 'title', type: 'text', required: true, max: 200 },
            { name: 'description', type: 'text', max: 2000 },
            { name: 'from_status', type: 'text', max: 20 },
            { name: 'to_status', type: 'text', max: 20 },
            {
              name: 'created_by',
              type: 'relation',
              collectionId: users.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE INDEX idx_people_events_person ON people_events (person_id, date)',
            'CREATE INDEX idx_people_events_church ON people_events (church_id, kind, date)',
          ],
        }),
      )
    }

    try {
      app.findCollectionByNameOrId('people_relations')
    } catch (_) {
      const SAME_CHURCH =
        ' && @request.body.person_id.church_id = @request.body.church_id' +
        ' && @request.body.relative_id.church_id = @request.body.church_id' +
        ' && @request.body.person_id != @request.body.relative_id'
      app.save(
        new Collection({
          name: 'people_relations',
          type: 'base',
          listRule: ADMIN_OF_CHURCH,
          viewRule: ADMIN_OF_CHURCH,
          createRule: ADMIN_OF_CHURCH + SAME_CHURCH,
          // Para trocar o vínculo, apaga e cria de novo; aqui só muda tipo/mora junto.
          updateRule:
            ADMIN_OF_CHURCH +
            ' && ' +
            KEEP_CHURCH +
            ' && @request.body.person_id:isset = false && @request.body.relative_id:isset = false',
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
              name: 'person_id',
              type: 'relation',
              required: true,
              collectionId: people.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            {
              name: 'relative_id',
              type: 'relation',
              required: true,
              collectionId: people.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            // Lido como "relative_id é <kind> de person_id"
            {
              name: 'kind',
              type: 'select',
              required: true,
              values: ['CONJUGE', 'FILHO', 'PAI_MAE', 'IRMAO', 'OUTRO'],
              maxSelect: 1,
            },
            { name: 'lives_together', type: 'bool' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE UNIQUE INDEX idx_people_relations_pair ON people_relations (person_id, relative_id)',
            'CREATE INDEX idx_people_relations_relative ON people_relations (relative_id)',
            'CREATE INDEX idx_people_relations_church ON people_relations (church_id)',
          ],
        }),
      )
    }
  },
  (app) => {
    for (const name of ['people_relations', 'people_events']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      const people = app.findCollectionByNameOrId('people')
      people.fields.removeByName('skills')
      people.fields.removeByName('roll_number')
      app.save(people)
    } catch (_) {}
  },
)
