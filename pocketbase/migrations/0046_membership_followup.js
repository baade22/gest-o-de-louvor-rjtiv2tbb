// Migração 0046: Membresia — acompanhamento de visitantes.
//
// A ficha ganha a etapa do acompanhamento (1ª visita → contato → retorno →
// integrado, ou encerrado), quem é o responsável (outra ficha da igreja) e desde
// quando está na etapa, para o quadro avisar quem está parado.
//
// O responsável precisa ser uma ficha da mesma igreja.

migrate(
  (app) => {
    const people = app.findCollectionByNameOrId('people')

    if (!people.fields.getByName('followup_stage')) {
      people.fields.add(
        new SelectField({
          name: 'followup_stage',
          maxSelect: 1,
          values: ['PRIMEIRA_VISITA', 'CONTATO', 'RETORNO', 'INTEGRADO', 'ENCERRADO'],
        }),
      )
    }
    if (!people.fields.getByName('followup_owner')) {
      people.fields.add(
        new RelationField({ name: 'followup_owner', collectionId: people.id, maxSelect: 1 }),
      )
    }
    if (!people.fields.getByName('followup_since')) {
      people.fields.add(new DateField({ name: 'followup_since' }))
    }

    const ADMIN_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true && ' +
      "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    const OWNER_UNSET =
      "(@request.body.followup_owner:isset = false || @request.body.followup_owner = ''"

    people.createRule =
      ADMIN_OF_CHURCH +
      ' && ' +
      OWNER_UNSET +
      ' || @request.body.followup_owner.church_id = @request.body.church_id)'
    people.updateRule =
      ADMIN_OF_CHURCH +
      ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)' +
      ' && ' +
      OWNER_UNSET +
      ' || @request.body.followup_owner.church_id = church_id)'
    app.save(people)
  },
  (app) => {
    const people = app.findCollectionByNameOrId('people')
    const ADMIN_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true && ' +
      "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    people.createRule = ADMIN_OF_CHURCH
    people.updateRule =
      ADMIN_OF_CHURCH +
      ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'
    for (const name of ['followup_stage', 'followup_owner', 'followup_since']) {
      people.fields.removeByName(name)
    }
    app.save(people)
  },
)
