// Migração 0043: Membresia (fase 1) — cadastro de pessoas da igreja.
//
// A collection `people` guarda a ficha de cada membro, congregado ou visitante,
// independente de ter login no LouvorFlow (a maioria dos membros nunca entra no
// sistema). Quando a pessoa também tem conta (ex.: serve no louvor), `user_id`
// faz o vínculo opcional.
//
// Dados pessoais (LGPD): só MASTER/ADMIN ativos da MESMA igreja leem e alteram
// as fichas, e a foto é um arquivo protegido (exige token de arquivo).

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    const ADMIN_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true && ' +
      "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"

    try {
      app.findCollectionByNameOrId('people')
      return
    } catch (_) {}

    const people = new Collection({
      name: 'people',
      type: 'base',
      listRule: ADMIN_OF_CHURCH,
      viewRule: ADMIN_OF_CHURCH,
      createRule: ADMIN_OF_CHURCH,
      // A regra de update é avaliada sobre o registro atual; sem a segunda parte,
      // um admin poderia "mover" a ficha para outra igreja trocando o church_id.
      updateRule:
        ADMIN_OF_CHURCH +
        ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)',
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
        { name: 'name', type: 'text', required: true, max: 200 },
        {
          name: 'photo',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880, // 5MB
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          thumbs: ['200x200'],
          protected: true,
        },
        // Ficha pessoal
        { name: 'birth_date', type: 'date' },
        { name: 'gender', type: 'select', values: ['M', 'F'], maxSelect: 1 },
        {
          name: 'marital_status',
          type: 'select',
          values: ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL'],
          maxSelect: 1,
        },
        { name: 'wedding_date', type: 'date' },
        { name: 'phone', type: 'text', max: 40 },
        { name: 'email', type: 'text', max: 200 },
        { name: 'address', type: 'text', max: 300 },
        { name: 'neighborhood', type: 'text', max: 120 },
        { name: 'city', type: 'text', max: 120 },
        { name: 'state', type: 'text', max: 2 },
        { name: 'zip_code', type: 'text', max: 10 },
        // Igreja
        { name: 'congregation', type: 'text', max: 120 },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['MEMBRO', 'CONGREGADO', 'VISITANTE', 'AFASTADO', 'TRANSFERIDO', 'FALECIDO'],
          maxSelect: 1,
        },
        { name: 'conversion_date', type: 'date' },
        { name: 'baptism_date', type: 'date' },
        { name: 'admission_date', type: 'date' },
        {
          name: 'admission_type',
          type: 'select',
          values: ['BATISMO', 'TRANSFERENCIA', 'ACLAMACAO', 'RECONCILIACAO'],
          maxSelect: 1,
        },
        { name: 'church_office', type: 'text', max: 120 },
        { name: 'notes', type: 'text', max: 5000 },
        // Vínculo opcional com a conta de acesso
        {
          name: 'user_id',
          type: 'relation',
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_people_church ON people (church_id)',
        'CREATE INDEX idx_people_status ON people (church_id, status)',
        'CREATE INDEX idx_people_congregation ON people (church_id, congregation)',
      ],
    })
    app.save(people)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('people'))
    } catch (_) {}
  },
)
