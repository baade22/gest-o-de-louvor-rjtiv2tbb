// Migração 0089: tipos de culto (event_types)
// Cada igreja cadastra os tipos que usa (Culto Dominical, Congresso, Rede Jovem...) com o
// horário de início e término. Ao agendar um culto basta escolher o tipo e a data: o nome e
// o horário vêm do tipo. As regras de acesso são as mesmas da coleção events (quem vê e quem
// altera cultos vê e altera os tipos). Já cria "Culto Dominical" (17:00 às 19:00) em cada
// igreja para a lista não começar vazia.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const events = app.findCollectionByNameOrId('events')

    let col
    try {
      col = app.findCollectionByNameOrId('event_types')
    } catch (_) {
      // Cópia primitiva das regras (ver gotcha do JSVM ao reaproveitar o getter)
      const rule = (r) => (r === null || r === undefined ? null : '' + r)
      col = new Collection({
        name: 'event_types',
        type: 'base',
        listRule: rule(events.listRule),
        viewRule: rule(events.viewRule),
        createRule: rule(events.createRule),
        updateRule: rule(events.updateRule),
        deleteRule: rule(events.deleteRule),
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'name', type: 'text', required: true, max: 120 },
          { name: 'start_time', type: 'text', max: 5 },
          { name: 'end_time', type: 'text', max: 5 },
          { name: 'order', type: 'number', onlyInt: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_event_types_church ON event_types (church_id)'],
      })
      app.save(col)

      let list = []
      try {
        list = app.findAllRecords('churches')
      } catch (_) {}
      for (let i = 0; i < list.length; i++) {
        try {
          const rec = new Record(col)
          rec.set('church_id', list[i].id)
          rec.set('name', 'Culto Dominical')
          rec.set('start_time', '17:00')
          rec.set('end_time', '19:00')
          rec.set('order', 1)
          app.save(rec)
        } catch (_) {}
      }
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('event_types'))
    } catch (_) {}
  },
)
