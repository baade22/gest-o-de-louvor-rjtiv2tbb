// Migração 0108: votação on-line aberta a quem recebeu o link (pedido do Pedro, 22/11/2026).
//
// Antes só votava quem tinha ficha em `people`. Agora qualquer pessoa vota, uma vez por CPF:
// assembly_online_voters ganha `name` (nome digitado ou da ficha) e `cpf_hash` (SHA-256 do
// CPF com o id da assembleia; o número nunca é gravado), e person_id deixa de ser obrigatório.
// Os índices únicos passam a valer por CPF e, quando há ficha, por pessoa.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('assembly_online_voters')
    const person = col.fields.getByName('person_id')
    if (person) person.required = false
    if (!col.fields.getByName('name')) col.fields.add(new TextField({ name: 'name', max: 200 }))
    if (!col.fields.getByName('cpf_hash')) col.fields.add(new TextField({ name: 'cpf_hash', max: 64 }))
    col.indexes = [
      "CREATE UNIQUE INDEX idx_assembly_online_voters_unique ON assembly_online_voters (assembly_id, person_id) WHERE person_id != ''",
      "CREATE UNIQUE INDEX idx_assembly_online_voters_cpf ON assembly_online_voters (assembly_id, cpf_hash) WHERE cpf_hash != ''",
    ]
    app.save(col)
  },
  (app) => {
    // Votantes sem ficha não cabem no formato antigo
    for (const r of app.findRecordsByFilter('assembly_online_voters', "person_id = ''", '', 0, 0)) {
      app.delete(r)
    }
    const col = app.findCollectionByNameOrId('assembly_online_voters')
    col.indexes = [
      'CREATE UNIQUE INDEX idx_assembly_online_voters_unique ON assembly_online_voters (assembly_id, person_id)',
    ]
    col.fields.removeByName('cpf_hash')
    col.fields.removeByName('name')
    const person = col.fields.getByName('person_id')
    if (person) person.required = true
    app.save(col)
  },
)
