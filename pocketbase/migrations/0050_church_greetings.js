// Migração 0050: mensagens de parabéns da igreja (aniversário e casamento) que
// a secretaria envia pelo WhatsApp com um toque. Mesma regra de edição da
// igreja (0042); sem nada sensível.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    for (const name of ['greeting_birthday', 'greeting_wedding']) {
      if (!churches.fields.getByName(name)) churches.fields.add(new TextField({ name, max: 1000 }))
    }
    app.save(churches)
  },
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    for (const name of ['greeting_birthday', 'greeting_wedding']) churches.fields.removeByName(name)
    app.save(churches)
  },
)
