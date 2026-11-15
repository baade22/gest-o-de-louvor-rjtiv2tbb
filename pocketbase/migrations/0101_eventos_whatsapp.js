// Migração 0101: mensagens dos eventos pelo WhatsApp (hooks/church_event_whatsapp.js).
//
// - whatsapp_messages.kind ganha EVENTO_ALTERACAO (mudança de data/local e cancelamento),
//   LEMBRETE_EVENTO (véspera) e EVENTO_MENSAGEM (mensagem livre da equipe aos inscritos).
// - Pedido do Pedro (2026-11-15): toda mensagem de evento sai pelo WhatsApp. Liga, para as
//   igrejas que já têm o WhatsApp configurado, a confirmação de inscrição, a de pagamento, o
//   aviso de mudança e o lembrete. Dá para desligar cada um em Configurações > WhatsApp.

const NEW_KINDS = ['EVENTO_ALTERACAO', 'LEMBRETE_EVENTO', 'EVENTO_MENSAGEM']
const TURN_ON = ['INSCRICAO', 'PAGAMENTO', 'EVENTO_ALTERACAO', 'LEMBRETE_EVENTO']

migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId('whatsapp_messages')
    const kind = messages.fields.getByName('kind')
    const values = []
    for (const v of kind.values) values.push('' + v)
    let changed = false
    for (const k of NEW_KINDS) {
      if (values.indexOf(k) === -1) {
        values.push(k)
        changed = true
      }
    }
    if (changed) {
      kind.values = values
      app.save(messages)
    }

    for (const st of app.findAllRecords('whatsapp_settings')) {
      let auto = {}
      try {
        auto = JSON.parse(st.getString('auto') || '{}') || {}
      } catch (_) {}
      for (const k of TURN_ON) auto[k] = true
      st.set('auto', auto)
      app.save(st)
    }
  },
  (app) => {
    const messages = app.findCollectionByNameOrId('whatsapp_messages')
    const kind = messages.fields.getByName('kind')
    const values = []
    for (const v of kind.values) if (NEW_KINDS.indexOf('' + v) === -1) values.push('' + v)
    kind.values = values
    app.save(messages)
  },
)
