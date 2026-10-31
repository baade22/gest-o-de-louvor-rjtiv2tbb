// Migração 0082: WhatsApp, diagnóstico do recebimento de comprovantes.
// - whatsapp_settings.inbound_last_at / inbound_last_note: quando chegou a última mensagem da
//   Evolution e o que o LouvorFlow fez com ela (mostrado em Financeiro > Comprovantes).
// - Limpa inbound_url: o endereço passa a ser conferido antes de ser entregue à Evolution
//   (antes podia ficar com o endereço interno do servidor); a tela liga de novo.

migrate(
  (app) => {
    const st = app.findCollectionByNameOrId('whatsapp_settings')
    if (!st.fields.getByName('inbound_last_at')) {
      st.fields.add(new DateField({ name: 'inbound_last_at' }))
      st.fields.add(new TextField({ name: 'inbound_last_note', max: 300 }))
      app.save(st)
    }
    for (const r of app.findRecordsByFilter('whatsapp_settings', "inbound_url != ''", '', 0, 0)) {
      r.set('inbound_url', '')
      app.save(r)
    }
  },
  (app) => {
    const st = app.findCollectionByNameOrId('whatsapp_settings')
    for (const name of ['inbound_last_at', 'inbound_last_note']) {
      if (st.fields.getByName(name)) st.fields.removeByName(name)
    }
    app.save(st)
  },
)
