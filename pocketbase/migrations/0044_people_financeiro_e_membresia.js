// Migração 0044: uma só collection `people` para a Membresia e o Financeiro.
//
// As duas frentes criam `people` (0035 do Financeiro e 0043 da Membresia), e cada migração
// pula a criação se a outra já criou. Aqui juntamos os campos das duas, seja qual for a
// ordem em que rodaram:
// - campos da ficha de membro (Membresia), se a collection veio do Financeiro;
// - `document` (CPF para o informe de contribuições) e `is_active` (arquivar no Financeiro),
//   se a collection veio da Membresia.
// Regras: MASTER, ADMIN e quem tem a função FINANCEIRO (na mesma igreja) leem, cadastram e
// editam (o Financeiro precisa escolher e cadastrar contribuintes); apagar continua só
// MASTER e ADMIN. A pessoa nunca muda de igreja numa edição.

migrate(
  (app) => {
    const people = app.findCollectionByNameOrId('people')
    const has = (name) => !!people.fields.getByName(name)
    const added = []
    const add = (field) => {
      if (!has(field.name)) {
        people.fields.add(field)
        added.push(field.name)
      }
    }

    // Ficha da Membresia (0043)
    add(
      new FileField({
        name: 'photo',
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        thumbs: ['200x200'],
        protected: true,
      }),
    )
    add(new DateField({ name: 'birth_date' }))
    add(new SelectField({ name: 'gender', values: ['M', 'F'], maxSelect: 1 }))
    add(
      new SelectField({
        name: 'marital_status',
        values: ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL'],
        maxSelect: 1,
      }),
    )
    add(new DateField({ name: 'wedding_date' }))
    add(new TextField({ name: 'address', max: 300 }))
    add(new TextField({ name: 'neighborhood', max: 120 }))
    add(new TextField({ name: 'city', max: 120 }))
    add(new TextField({ name: 'state', max: 2 }))
    add(new TextField({ name: 'zip_code', max: 10 }))
    add(new TextField({ name: 'congregation', max: 120 }))
    add(
      new SelectField({
        name: 'status',
        required: true,
        values: ['MEMBRO', 'CONGREGADO', 'VISITANTE', 'AFASTADO', 'TRANSFERIDO', 'FALECIDO'],
        maxSelect: 1,
      }),
    )
    add(new DateField({ name: 'conversion_date' }))
    add(new DateField({ name: 'baptism_date' }))
    add(new DateField({ name: 'admission_date' }))
    add(
      new SelectField({
        name: 'admission_type',
        values: ['BATISMO', 'TRANSFERENCIA', 'ACLAMACAO', 'RECONCILIACAO'],
        maxSelect: 1,
      }),
    )
    add(new TextField({ name: 'church_office', max: 120 }))
    // Campos do Financeiro (0035)
    add(new TextField({ name: 'document', max: 20 }))
    add(new BoolField({ name: 'is_active' }))

    // Observações: a ficha da Membresia aceita textos maiores
    const notes = people.fields.getByName('notes')
    if (notes && notes.max < 5000) notes.max = 5000
    const name = people.fields.getByName('name')
    if (name && name.max < 200) name.max = 200

    const MEMBER =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true'
    const ADMIN_OR_FIN =
      MEMBER +
      " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN'" +
      ' || @collection.church_members.operational_roles ?~ \'"FINANCEIRO"\')'
    const ADMIN =
      MEMBER +
      " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    people.listRule = ADMIN_OR_FIN
    people.viewRule = ADMIN_OR_FIN
    people.createRule = ADMIN_OR_FIN
    people.updateRule =
      ADMIN_OR_FIN +
      ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'
    people.deleteRule = ADMIN
    app.save(people)

    // Quem foi cadastrado pela Membresia passa a valer no Financeiro (menos falecidos e
    // transferidos); quem veio do Financeiro sem situação vira congregado.
    if (added.indexOf('is_active') !== -1) {
      app
        .db()
        .newQuery("UPDATE people SET is_active = 1 WHERE status NOT IN ('FALECIDO', 'TRANSFERIDO')")
        .execute()
    }
    app
      .db()
      .newQuery("UPDATE people SET status = 'CONGREGADO' WHERE status = '' OR status IS NULL")
      .execute()
  },
  (app) => {
    // Os campos ficam (podem ter dados); só volta a regra de leitura da Membresia.
    const people = app.findCollectionByNameOrId('people')
    const ADMIN =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true && ' +
      "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    people.listRule = ADMIN
    people.viewRule = ADMIN
    people.createRule = ADMIN
    people.updateRule =
      ADMIN + ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'
    people.deleteRule = ADMIN
    app.save(people)
  },
)
