// Migração 0110: nome completo (razão social) da igreja nos documentos.
//
// O nome curto da igreja no app (ex.: "IBMALDEIA") não serve para ata, edital e cartas:
// o cartório pede o nome completo do estatuto, com o CNPJ e o logo no cabeçalho (como na
// ata de 2022 da Igreja Batista Missionária em Aldeia). O logo usa o campo churches.logo.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    if (!churches.fields.getByName('doc_legal_name')) {
      churches.fields.add(new TextField({ name: 'doc_legal_name', max: 200 }))
    }
    app.save(churches)
  },
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    churches.fields.removeByName('doc_legal_name')
    app.save(churches)
  },
)
