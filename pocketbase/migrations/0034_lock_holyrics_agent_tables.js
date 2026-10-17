// Migração 0034: fecha a API direta das tabelas do LouvorFlow Agent.
// Justificativa: as regras eram `@request.auth.id != ''`, então qualquer usuário logado,
// de qualquer igreja, podia listar computadores (com o hash do token do Agent), criar
// comandos ou apagar registros. O app e o Agent só usam os hooks em pocketbase/hooks,
// que acessam os dados via $app e validam a igreja; por isso a API direta fica só
// para superusuários (regra null).

const TABLES = ['holyrics_agents', 'holyrics_commands', 'holyrics_sync_logs']
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']
const OLD_RULE = "@request.auth.id != ''"

migrate(
  (app) => {
    for (const name of TABLES) {
      const col = app.findCollectionByNameOrId(name)
      for (const rule of RULES) col[rule] = null
      app.save(col)
    }
  },
  (app) => {
    for (const name of TABLES) {
      const col = app.findCollectionByNameOrId(name)
      for (const rule of RULES) col[rule] = OLD_RULE
      app.save(col)
    }
  },
)
