// Migração 0092: WhatsApp, limite por dia para o número não ser bloqueado.
// - whatsapp_settings.first_connected_at / first_phone: quando ESTE número conectou pela
//   primeira vez. A fila (hooks/whatsapp_queue.js) começa com 20 mensagens no primeiro dia e
//   sobe aos poucos. Trocar de chip recomeça a contagem.
// - paused_until / pause_note / fail_streak: a fila pausa sozinha depois de várias falhas
//   seguidas do servidor do WhatsApp.
// Quem já tinha conexão começa o aquecimento de novo na próxima vez que conectar (o número da
// igreja foi suspenso em 2026-10-31).

migrate(
  (app) => {
    const st = app.findCollectionByNameOrId('whatsapp_settings')
    if (!st.fields.getByName('first_connected_at')) {
      st.fields.add(new DateField({ name: 'first_connected_at' }))
      st.fields.add(new TextField({ name: 'first_phone', max: 40 }))
      st.fields.add(new DateField({ name: 'paused_until' }))
      st.fields.add(new TextField({ name: 'pause_note', max: 300 }))
      st.fields.add(new NumberField({ name: 'fail_streak', min: 0, onlyInt: true }))
      app.save(st)
    }
  },
  (app) => {
    const st = app.findCollectionByNameOrId('whatsapp_settings')
    for (const name of [
      'first_connected_at',
      'first_phone',
      'paused_until',
      'pause_note',
      'fail_streak',
    ]) {
      if (st.fields.getByName(name)) st.fields.removeByName(name)
    }
    app.save(st)
  },
)
