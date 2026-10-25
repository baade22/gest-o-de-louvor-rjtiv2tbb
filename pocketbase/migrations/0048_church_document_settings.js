// Migração 0048: dados da igreja que aparecem nos documentos da membresia
// (carteirinha, cartas, certificado): quem assina, cargo, cidade, endereço e
// CNPJ. Só gestores editam a igreja (regra da 0042); são dados públicos da
// igreja, sem nada sensível.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const fields = [
      { name: 'doc_signer_name', max: 120 },
      { name: 'doc_signer_title', max: 80 },
      { name: 'doc_city', max: 120 },
      { name: 'doc_address', max: 300 },
      { name: 'doc_cnpj', max: 20 },
    ]
    for (const f of fields) {
      if (!churches.fields.getByName(f.name)) {
        churches.fields.add(new TextField({ name: f.name, max: f.max }))
      }
    }
    app.save(churches)
  },
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    for (const name of [
      'doc_signer_name',
      'doc_signer_title',
      'doc_city',
      'doc_address',
      'doc_cnpj',
    ]) {
      churches.fields.removeByName(name)
    }
    app.save(churches)
  },
)
