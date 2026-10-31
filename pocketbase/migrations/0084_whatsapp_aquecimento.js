// Migração 0084: WhatsApp, aquecimento depois de conectar.
// - whatsapp_settings.connected_at: quando o celular conectou (ou reconectou). A fila usa
//   para mandar devagar nas primeiras 24 horas (ver hooks/whatsapp_queue.js): uma rajada logo
//   depois de conectar faz o WhatsApp tirar o aparelho.
// - Conexões que já estão abertas contam como conectadas agora, para começar devagar também.

migrate(
  (app) => {
    const st = app.findCollectionByNameOrId('whatsapp_settings')
    if (!st.fields.getByName('connected_at')) {
      st.fields.add(new DateField({ name: 'connected_at' }))
      app.save(st)
    }
    const now = new Date().toISOString()
    for (const r of app.findRecordsByFilter('whatsapp_settings', "status = 'open'", '', 0, 0)) {
      r.set('connected_at', now)
      app.saveNoValidate(r)
    }
  },
  (app) => {
    const st = app.findCollectionByNameOrId('whatsapp_settings')
    if (st.fields.getByName('connected_at')) {
      st.fields.removeByName('connected_at')
      app.save(st)
    }
  },
)
