// Migração 0049: Membresia — grupos e ministérios além do louvor.
//
// - church_groups: ministério (infantil, recepção, mídia), departamento
//   (jovens, mulheres, homens) ou grupo pequeno, com líder, dia de encontro e as
//   habilidades que ajudam a sugerir voluntários (as mesmas de people.skills).
// - church_group_members: quem participa de cada grupo e com que papel.
//
// Só MASTER/ADMIN da igreja mexem; grupo, líder e participantes precisam ser da
// mesma igreja, e um participante não pode ser movido para outro grupo.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const people = app.findCollectionByNameOrId('people')
    const skills = people.fields.getByName('skills')

    const ADMIN_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true && ' +
      "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    const KEEP_CHURCH =
      '(@request.body.church_id:isset = false || @request.body.church_id = church_id)'
    const LEADER_UNSET = "(@request.body.leader_id:isset = false || @request.body.leader_id = ''"

    let groups
    try {
      groups = app.findCollectionByNameOrId('church_groups')
    } catch (_) {
      groups = new Collection({
        name: 'church_groups',
        type: 'base',
        listRule: ADMIN_OF_CHURCH,
        viewRule: ADMIN_OF_CHURCH,
        createRule:
          ADMIN_OF_CHURCH +
          ' && ' +
          LEADER_UNSET +
          ' || @request.body.leader_id.church_id = @request.body.church_id)',
        updateRule:
          ADMIN_OF_CHURCH +
          ' && ' +
          KEEP_CHURCH +
          ' && ' +
          LEADER_UNSET +
          ' || @request.body.leader_id.church_id = church_id)',
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
          { name: 'name', type: 'text', required: true, max: 120 },
          {
            name: 'kind',
            type: 'select',
            required: true,
            values: ['MINISTERIO', 'DEPARTAMENTO', 'GRUPO'],
            maxSelect: 1,
          },
          { name: 'description', type: 'text', max: 1000 },
          { name: 'congregation', type: 'text', max: 120 },
          { name: 'meeting_info', type: 'text', max: 160 },
          { name: 'leader_id', type: 'relation', collectionId: people.id, maxSelect: 1 },
          { name: 'skills', type: 'select', values: skills ? skills.values : [], maxSelect: 16 },
          { name: 'active', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_church_groups_church ON church_groups (church_id)'],
      })
      app.save(groups)
    }

    try {
      app.findCollectionByNameOrId('church_group_members')
    } catch (_) {
      app.save(
        new Collection({
          name: 'church_group_members',
          type: 'base',
          listRule: ADMIN_OF_CHURCH,
          viewRule: ADMIN_OF_CHURCH,
          createRule:
            ADMIN_OF_CHURCH +
            ' && @request.body.group_id.church_id = @request.body.church_id' +
            ' && @request.body.person_id.church_id = @request.body.church_id',
          updateRule:
            ADMIN_OF_CHURCH +
            ' && ' +
            KEEP_CHURCH +
            ' && @request.body.group_id:isset = false && @request.body.person_id:isset = false',
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
              name: 'group_id',
              type: 'relation',
              required: true,
              collectionId: groups.id,
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
              name: 'role',
              type: 'select',
              values: ['LIDER', 'AUXILIAR', 'PARTICIPANTE'],
              maxSelect: 1,
            },
            { name: 'since', type: 'date' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE UNIQUE INDEX idx_church_group_members_unique ON church_group_members (group_id, person_id)',
            'CREATE INDEX idx_church_group_members_church ON church_group_members (church_id)',
          ],
        }),
      )
    }
  },
  (app) => {
    for (const name of ['church_group_members', 'church_groups']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
