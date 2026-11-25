// Migração 0112: todos os documentos da assembleia editáveis (pedido do Pedro, 24/11/2026).
//
// assemblies.doc_texts guarda, por documento, o texto ajustado à mão (body), o título (title)
// e o tamanho da letra (scale). Vazio, vale o automático. A ata continua em minutes_text (0111).
// Mesmas regras de edição da assembleia.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('assemblies')
    if (!col.fields.getByName('doc_texts')) {
      col.fields.add(new JSONField({ name: 'doc_texts', maxSize: 300000 }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('assemblies')
    col.fields.removeByName('doc_texts')
    app.save(col)
  },
)
