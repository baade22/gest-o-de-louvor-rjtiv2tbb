// Migração 0106: registro do estatuto da igreja (cartório, número, folhas e
// data). Sai na abertura da ata de assembleia, como na ata de 2022 da IBMA
// ("estatuto registrado em ... sob o nº ..., fls. ..."). Dado público da
// igreja, editado por quem já edita os dados dos documentos.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    if (!churches.fields.getByName('doc_statute_registry')) {
      churches.fields.add(new TextField({ name: 'doc_statute_registry', max: 500 }))
    }
    app.save(churches)
  },
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    churches.fields.removeByName('doc_statute_registry')
    app.save(churches)
  },
)
