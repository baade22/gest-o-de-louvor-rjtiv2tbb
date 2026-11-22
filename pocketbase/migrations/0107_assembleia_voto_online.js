// Migração 0107: votação on-line da chapa (pedido do Pedro, 2026-11-22).
//
// A mesa gera um link (assemblies.vote_key) e abre a votação (vote_open). O membro entra no
// link, informa nome completo, CPF e data de nascimento e vota SIM, NÃO ou ABSTENÇÃO na chapa.
// A rota pública /backend/v1/assembly-vote (hooks/assembly_vote.js) confere os dados com a
// ficha em `people`, se a pessoa vota pelas regras da convocação e se já votou.
//
// Voto secreto: quem votou (assembly_online_voters) e o voto (assembly_online_ballots) ficam
// em coleções separadas, sem ligação entre si e sem data no voto. CPF e nascimento só são
// conferidos, não são gravados. Ninguém cria esses registros pela API, só a rota pública.

const MEMBER =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const M = "@collection.church_members.role ?= 'MASTER'"
const P = (k) => '@collection.church_members.permissions ?~ \'"' + k + '"\''
const READ = MEMBER + ' && (' + M + ' || ' + P('membresia.assembleias.ver') + ')'

const VOTE_LABEL = 'POST /backend/v1/assembly-vote'
const INFO_LABEL = '/backend/v1/assembly-vote/info'

migrate(
  (app) => {
    const assemblies = app.findCollectionByNameOrId('assemblies')
    const add = (f) => {
      if (!assemblies.fields.getByName(f.name)) assemblies.fields.add(f)
    }
    add(new TextField({ name: 'vote_key', max: 40 }))
    add(new BoolField({ name: 'vote_open' }))
    add(new BoolField({ name: 'vote_only_present' }))
    app.save(assemblies)

    const churches = app.findCollectionByNameOrId('churches')
    const people = app.findCollectionByNameOrId('people')
    const rel = (name, collectionId, cascade) => ({
      name,
      type: 'relation',
      required: true,
      collectionId,
      cascadeDelete: cascade,
      maxSelect: 1,
    })
    const find = (name) => {
      try {
        return app.findCollectionByNameOrId(name)
      } catch (_) {
        return null
      }
    }

    if (!find('assembly_online_voters')) {
      app.save(
        new Collection({
          name: 'assembly_online_voters',
          type: 'base',
          listRule: READ,
          viewRule: READ,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: [
            rel('church_id', churches.id, true),
            rel('assembly_id', assemblies.id, true),
            rel('person_id', people.id, false),
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          ],
          indexes: [
            'CREATE UNIQUE INDEX idx_assembly_online_voters_unique ON assembly_online_voters (assembly_id, person_id)',
          ],
        }),
      )
    }

    if (!find('assembly_online_ballots')) {
      app.save(
        new Collection({
          name: 'assembly_online_ballots',
          type: 'base',
          listRule: READ,
          viewRule: READ,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          // Sem data e sem pessoa: não dá para ligar o voto a quem votou
          fields: [
            rel('church_id', churches.id, true),
            rel('assembly_id', assemblies.id, true),
            { name: 'choice', type: 'text', required: true, max: 12 },
          ],
          indexes: [
            'CREATE INDEX idx_assembly_online_ballots_assembly ON assembly_online_ballots (assembly_id)',
          ],
        }),
      )
    }

    // Limite por IP (muita gente vota da mesma rede da igreja: limite folgado)
    const settings = app.settings()
    const rules = Array.isArray(settings.rateLimits.rules) ? settings.rateLimits.rules : []
    const custom = [
      { label: VOTE_LABEL, audience: '', duration: 60, maxRequests: 20 },
      { label: INFO_LABEL, audience: '', duration: 60, maxRequests: 60 },
    ]
    const labels = rules.map((r) => r.label)
    settings.rateLimits.rules = custom.filter((r) => labels.indexOf(r.label) === -1).concat(rules)
    app.save(settings)
  },
  (app) => {
    for (const name of ['assembly_online_ballots', 'assembly_online_voters']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      const assemblies = app.findCollectionByNameOrId('assemblies')
      for (const name of ['vote_key', 'vote_open', 'vote_only_present']) {
        if (assemblies.fields.getByName(name)) assemblies.fields.removeByName(name)
      }
      app.save(assemblies)
    } catch (_) {}
    const settings = app.settings()
    const rules = Array.isArray(settings.rateLimits.rules) ? settings.rateLimits.rules : []
    settings.rateLimits.rules = rules.filter(
      (r) => r.label !== VOTE_LABEL && r.label !== INFO_LABEL,
    )
    app.save(settings)
  },
)
