// Migração 0102: base de contatos e listas de números dos Avisos (pedido do Pedro, 2026-11-16).
//
// - whatsapp_lists: listas de números da igreja (ex.: "Mães do infantil").
// - whatsapp_contacts: números carregados de grupos do WhatsApp ou digitados na tela. Não são
//   fichas da Membresia. phone guarda só dígitos com o código do país; phone_key (DDD + 8
//   últimos dígitos) evita o mesmo número duas vezes, com ou sem o 9. lists = listas do número.
//
// Sem regra de API (só o servidor mexe): a tela usa a rota /backend/v1/whatsapp/contatos, que
// confere as chaves culto.avisos.*. O aviso pode ir para listas e números escolhidos (público
// LISTAS em whatsapp_avisos.js).

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')

    let lists = null
    try {
      lists = app.findCollectionByNameOrId('whatsapp_lists')
    } catch (_) {}
    if (!lists) {
      lists = new Collection({
        name: 'whatsapp_lists',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'name', type: 'text', required: true, max: 100 },
          { name: 'description', type: 'text', max: 300 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_whatsapp_lists_church ON whatsapp_lists (church_id)'],
      })
      app.save(lists)
    }

    try {
      app.findCollectionByNameOrId('whatsapp_contacts')
    } catch (_) {
      app.save(
        new Collection({
          name: 'whatsapp_contacts',
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: [
            {
              name: 'church_id',
              type: 'relation',
              required: true,
              collectionId: churches.id,
              cascadeDelete: true,
              maxSelect: 1,
            },
            { name: 'phone', type: 'text', required: true, max: 20 },
            { name: 'phone_key', type: 'text', required: true, max: 20 },
            { name: 'name', type: 'text', max: 120 },
            { name: 'note', type: 'text', max: 300 },
            { name: 'origin', type: 'text', max: 150 },
            {
              name: 'lists',
              type: 'relation',
              collectionId: lists.id,
              cascadeDelete: false,
              maxSelect: 200,
            },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE UNIQUE INDEX idx_whatsapp_contacts_key ON whatsapp_contacts (church_id, phone_key)',
          ],
        }),
      )
    }
  },
  (app) => {
    for (const name of ['whatsapp_contacts', 'whatsapp_lists']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
