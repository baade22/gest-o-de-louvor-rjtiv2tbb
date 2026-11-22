// Migração 0111: texto da ata editado à mão (pedido do Pedro, 22/11/2026).
//
// A ata é montada sozinha a partir da convocação, presença e votação. assemblies.minutes_text
// guarda o texto ajustado à mão (parágrafos separados por linha em branco); vazio, vale o
// texto automático. Mesmas regras de edição da assembleia: não muda depois de finalizada.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('assemblies')
    if (!col.fields.getByName('minutes_text')) {
      col.fields.add(new TextField({ name: 'minutes_text', max: 60000 }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('assemblies')
    col.fields.removeByName('minutes_text')
    app.save(col)
  },
)
