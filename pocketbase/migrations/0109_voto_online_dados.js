// Migração 0109: dados de quem votou on-line, para a ata (pedido do Pedro, 22/11/2026).
//
// O cartório pede nome e CPF de quem participou. Até aqui só o hash do CPF era gravado;
// agora assembly_online_voters guarda também o CPF, a data de nascimento, o IP e o
// aparelho (user agent) de quem votou. O voto continua em outra coleção, sem ligação.
// Quem votou antes recupera os dados abrindo o link de novo: o CPF confere com o hash
// e o voto não muda.
// Leitura: só MASTER e quem tem membresia.assembleias.ata ou .apurar (dado pessoal).

const MEMBER =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const M = "@collection.church_members.role ?= 'MASTER'"
const P = (k) => '@collection.church_members.permissions ?~ \'"' + k + '"\''
const STRICT =
  MEMBER +
  ' && (' +
  M +
  ' || ' +
  P('membresia.assembleias.ata') +
  ' || ' +
  P('membresia.assembleias.apurar') +
  ')'
const READ = MEMBER + ' && (' + M + ' || ' + P('membresia.assembleias.ver') + ')'
const FIELDS = [
  ['cpf', 14],
  ['birth_date', 10],
  ['ip', 64],
  ['user_agent', 300],
]

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('assembly_online_voters')
    for (const [name, max] of FIELDS) {
      if (!col.fields.getByName(name)) col.fields.add(new TextField({ name, max }))
    }
    col.listRule = STRICT
    col.viewRule = STRICT
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('assembly_online_voters')
    for (const [name] of FIELDS) col.fields.removeByName(name)
    col.listRule = READ
    col.viewRule = READ
    app.save(col)
  },
)
