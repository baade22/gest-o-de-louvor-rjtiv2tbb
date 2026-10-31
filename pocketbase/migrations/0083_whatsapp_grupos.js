// Migração 0083: Avisos pelo WhatsApp também para grupos.
// - whatsapp_messages.phone passa de 20 para 60 caracteres: o endereço de um grupo do
//   WhatsApp ("120363...@g.us") não cabia.
// O público "Grupos do WhatsApp" fica no JSON audience do aviso (type WHATSAPP, wa_groups).

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_messages')
    const f = col.fields.getByName('phone')
    if (f && f.max < 60) {
      f.max = 60
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_messages')
    const f = col.fields.getByName('phone')
    if (f) {
      f.max = 20
      app.save(col)
    }
  },
)
