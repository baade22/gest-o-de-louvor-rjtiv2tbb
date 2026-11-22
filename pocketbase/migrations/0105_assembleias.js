// Migração 0105: Assembleias e votação (pedido do Pedro, 2026-11-22).
//
// Reeleição de pastores, diretoria, conselho e equipes, com os papéis que o cartório de
// Registro Civil de Pessoas Jurídicas pede (Código de Normas do TJPE, arts. 892 a 907):
// edital, lista de presença, ata com a qualificação completa dos eleitos e o mandato,
// termo de posse e requerimento.
//
// - people ganha nationality, profession, rg e rg_issuer (qualificação dos eleitos; CPF já
//   existe em people.document). Só campos novos, as regras de people ficam iguais.
// - assemblies: a assembleia (convocação, quórum do estatuto, mesa, ocorrências e, ao
//   finalizar, a cópia congelada da ata em `minutes`).
// - assembly_items: cada ponto da pauta. ELEICAO (cargo com candidatos), REFERENDO
//   (recondução: sim/não sobre uma pessoa, ex.: reeleição do pastor) ou DELIBERACAO
//   (assunto votado). Guarda o mandato e o resultado em números.
// - assembly_candidates: candidatos de uma eleição (ou a pessoa do referendo) e seus votos.
// - assembly_attendees: lista de presença (quem veio e se vota).
//
// Acesso (perfis, PR #27): chaves membresia.assembleias.* (ver, novo, alterar, excluir,
// apurar = presença e resultado, ata = finalizar e reabrir). As fichas dos presentes e
// eleitos vêm de `people`, que quem tem a Membresia já lê.
// Assembleia FINALIZADA fica travada: só MASTER ou quem tem membresia.assembleias.ata mexe
// nela, e os itens, candidatos e presenças não mudam mais (regra confere o status).

const MEMBER =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const M = "@collection.church_members.role ?= 'MASTER'"
const P = (k) => '@collection.church_members.permissions ?~ \'"' + k + '"\''
const KEY = (a) => 'membresia.assembleias.' + a
const allow = (...keys) => MEMBER + ' && (' + [M].concat(keys.map((k) => P(KEY(k)))).join(' || ') + ')'
const LOCK = ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'

const READ = allow('ver')
// Assembleia: quem altera não finaliza nem mexe numa finalizada; quem tem "ata" pode tudo
const ASSEMBLY_UPDATE =
  MEMBER +
  ' && (' +
  M +
  ' || ' +
  P(KEY('ata')) +
  ' || ((' +
  P(KEY('alterar')) +
  ' || ' +
  P(KEY('apurar')) +
  ") && status != 'FINALIZADA' && (@request.body.status:isset = false || @request.body.status != 'FINALIZADA') && @request.body.minutes:isset = false))" +
  LOCK
const ASSEMBLY_CREATE =
  allow('novo') + " && (@request.body.status:isset = false || @request.body.status != 'FINALIZADA')"

// Itens, candidatos e presença: só enquanto a assembleia não foi finalizada, e da mesma igreja
const OPEN = " && assembly_id.status != 'FINALIZADA'"
const SAME =
  ' && @request.body.assembly_id.church_id = @request.body.church_id' +
  " && @request.body.assembly_id.status != 'FINALIZADA'"
const SAME_UPD =
  ' && (@request.body.assembly_id:isset = false || @request.body.assembly_id = assembly_id)'
const childRules = (writers, extraCreate, extraUpdate) => ({
  listRule: READ,
  viewRule: READ,
  createRule: allow(...writers) + SAME + extraCreate,
  updateRule: allow(...writers) + OPEN + LOCK + SAME_UPD + extraUpdate,
  deleteRule: allow(...writers) + OPEN,
})
const PERSON_SAME =
  ' && (@request.body.person_id:isset = false || @request.body.person_id = "" || @request.body.person_id.church_id = @request.body.church_id)'
const PERSON_SAME_UPD =
  ' && (@request.body.person_id:isset = false || @request.body.person_id = "" || @request.body.person_id.church_id = church_id)'

migrate(
  (app) => {
    // 1) Qualificação na ficha da pessoa
    const people = app.findCollectionByNameOrId('people')
    let changed = false
    for (const [name, max] of [
      ['nationality', 60],
      ['profession', 80],
      ['rg', 30],
      ['rg_issuer', 30],
    ]) {
      if (!people.fields.getByName(name)) {
        people.fields.add(new TextField({ name, max }))
        changed = true
      }
    }
    if (changed) app.save(people)

    const churches = app.findCollectionByNameOrId('churches')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const churchField = {
      name: 'church_id',
      type: 'relation',
      required: true,
      collectionId: churches.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
    const personField = (name, required) => ({
      name,
      type: 'relation',
      required: !!required,
      collectionId: people.id,
      cascadeDelete: false,
      maxSelect: 1,
    })
    const stamps = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const find = (name) => {
      try {
        return app.findCollectionByNameOrId(name)
      } catch (_) {
        return null
      }
    }

    // 2) Assembleias
    let assemblies = find('assemblies')
    if (!assemblies) {
      assemblies = new Collection({
        name: 'assemblies',
        type: 'base',
        listRule: READ,
        viewRule: READ,
        createRule: ASSEMBLY_CREATE,
        updateRule: ASSEMBLY_UPDATE,
        deleteRule: allow('excluir') + " && status != 'FINALIZADA'",
        fields: [
          churchField,
          { name: 'title', type: 'text', required: true, max: 160 },
          { name: 'kind', type: 'text', max: 20 },
          { name: 'status', type: 'text', max: 20 },
          { name: 'date', type: 'date' },
          { name: 'place', type: 'text', max: 300 },
          { name: 'first_call', type: 'text', max: 5 },
          { name: 'second_call', type: 'text', max: 5 },
          { name: 'call_date', type: 'date' },
          { name: 'call_means', type: 'text', max: 300 },
          { name: 'agenda', type: 'text', max: 4000 },
          { name: 'voter_statuses', type: 'json', maxSize: 2000 },
          { name: 'voter_min_age', type: 'number', min: 0, max: 120, onlyInt: true },
          { name: 'quorum_first', type: 'text', max: 20 },
          { name: 'quorum_second', type: 'text', max: 20 },
          { name: 'quorum_min', type: 'number', min: 0, onlyInt: true },
          { name: 'statute_note', type: 'text', max: 500 },
          personField('president_id'),
          personField('secretary_id'),
          { name: 'opened_on', type: 'text', max: 10 },
          { name: 'started_at', type: 'text', max: 5 },
          { name: 'ended_at', type: 'text', max: 5 },
          { name: 'notes', type: 'text', max: 10000 },
          { name: 'minutes', type: 'json', maxSize: 2000000 },
          { name: 'finalized_at', type: 'date' },
          {
            name: 'created_by',
            type: 'relation',
            collectionId: users.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
        ].concat(stamps),
        indexes: ['CREATE INDEX idx_assemblies_church ON assemblies (church_id, date)'],
      })
      app.save(assemblies)
    }
    const assemblyField = {
      name: 'assembly_id',
      type: 'relation',
      required: true,
      collectionId: assemblies.id,
      cascadeDelete: true,
      maxSelect: 1,
    }

    // 3) Pontos da pauta
    let items = find('assembly_items')
    if (!items) {
      items = new Collection(
        Object.assign(
          {
            name: 'assembly_items',
            type: 'base',
            fields: [
              churchField,
              assemblyField,
              { name: 'order', type: 'number', onlyInt: true },
              { name: 'kind', type: 'text', required: true, max: 20 },
              { name: 'title', type: 'text', required: true, max: 200 },
              { name: 'description', type: 'text', max: 2000 },
              { name: 'seats', type: 'number', min: 0, max: 100, onlyInt: true },
              { name: 'term_start', type: 'date' },
              { name: 'term_end', type: 'date' },
              { name: 'method', type: 'text', max: 30 },
              { name: 'majority', type: 'text', max: 20 },
              { name: 'voters', type: 'number', min: 0, onlyInt: true },
              { name: 'votes_yes', type: 'number', min: 0, onlyInt: true },
              { name: 'votes_no', type: 'number', min: 0, onlyInt: true },
              { name: 'votes_abstain', type: 'number', min: 0, onlyInt: true },
              { name: 'votes_blank', type: 'number', min: 0, onlyInt: true },
              { name: 'votes_null', type: 'number', min: 0, onlyInt: true },
              { name: 'decided', type: 'bool' },
              { name: 'approved', type: 'bool' },
              { name: 'result_note', type: 'text', max: 2000 },
              { name: 'office_date', type: 'date' },
            ].concat(stamps),
            indexes: ['CREATE INDEX idx_assembly_items_assembly ON assembly_items (assembly_id)'],
          },
          childRules(['alterar', 'apurar'], '', ''),
        ),
      )
      app.save(items)
    }

    // 4) Candidatos
    if (!find('assembly_candidates')) {
      app.save(
        new Collection(
          Object.assign(
            {
              name: 'assembly_candidates',
              type: 'base',
              fields: [
                churchField,
                assemblyField,
                {
                  name: 'item_id',
                  type: 'relation',
                  required: true,
                  collectionId: items.id,
                  cascadeDelete: true,
                  maxSelect: 1,
                },
                personField('person_id', true),
                { name: 'order', type: 'number', onlyInt: true },
                { name: 'votes', type: 'number', min: 0, onlyInt: true },
                { name: 'elected', type: 'bool' },
              ].concat(stamps),
              indexes: [
                'CREATE UNIQUE INDEX idx_assembly_candidates_unique ON assembly_candidates (item_id, person_id)',
              ],
            },
            childRules(
              ['alterar', 'apurar'],
              ' && @request.body.item_id.assembly_id = @request.body.assembly_id' + PERSON_SAME,
              ' && (@request.body.item_id:isset = false || @request.body.item_id = item_id)' +
                PERSON_SAME_UPD,
            ),
          ),
        ),
      )
    }

    // 5) Lista de presença
    if (!find('assembly_attendees')) {
      app.save(
        new Collection(
          Object.assign(
            {
              name: 'assembly_attendees',
              type: 'base',
              fields: [
                churchField,
                assemblyField,
                personField('person_id', true),
                { name: 'voter', type: 'bool' },
                { name: 'arrived', type: 'text', max: 5 },
              ].concat(stamps),
              indexes: [
                'CREATE UNIQUE INDEX idx_assembly_attendees_unique ON assembly_attendees (assembly_id, person_id)',
              ],
            },
            childRules(['alterar', 'apurar'], PERSON_SAME, PERSON_SAME_UPD),
          ),
        ),
      )
    }
  },
  (app) => {
    for (const name of [
      'assembly_attendees',
      'assembly_candidates',
      'assembly_items',
      'assemblies',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      const people = app.findCollectionByNameOrId('people')
      for (const name of ['nationality', 'profession', 'rg', 'rg_issuer']) {
        if (people.fields.getByName(name)) people.fields.removeByName(name)
      }
      app.save(people)
    } catch (_) {}
  },
)
