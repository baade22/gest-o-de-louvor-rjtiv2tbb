// Migração 0074: WhatsApp conectado por QR Code (como o Eklesia).
//
// O WhatsApp da igreja fica pareado num servidor próprio com a Evolution API
// (deploy/whatsapp). O PocketBase só guarda a configuração e a fila de mensagens; quem
// conversa com a Evolution são os hooks (hooks/whatsapp*.js), com o endereço e a chave
// nos segredos WHATSAPP_API_URL e WHATSAPP_API_KEY.
//
// - whatsapp_settings: uma linha por igreja. instance = nome da conexão na Evolution;
//   auto = envios automáticos ligados ({ ESCALA: true, ... }); status/phone = último estado
//   lido da Evolution.
// - whatsapp_messages: fila e histórico. Os hooks põem na fila (FILA) e o cron envia aos
//   poucos (ENVIADO / ERRO). ref_id liga a mensagem ao registro que a gerou (escala,
//   inscrição, pessoa) para cancelar ou não repetir.
//
// As duas coleções não têm regra de API (só o servidor mexe): a tela usa as rotas
// /backend/v1/whatsapp/*, que exigem MASTER da igreja.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')

    let settings = null
    try {
      settings = app.findCollectionByNameOrId('whatsapp_settings')
    } catch (_) {}
    if (!settings) {
      settings = new Collection({
        name: 'whatsapp_settings',
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
          { name: 'instance', type: 'text', max: 80 },
          { name: 'auto', type: 'json', maxSize: 5000 },
          { name: 'status', type: 'text', max: 30 },
          { name: 'phone', type: 'text', max: 40 },
          { name: 'profile_name', type: 'text', max: 200 },
          { name: 'last_error', type: 'text', max: 1000 },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_whatsapp_settings_church ON whatsapp_settings (church_id)',
        ],
      })
      app.save(settings)
    }

    let messages = null
    try {
      messages = app.findCollectionByNameOrId('whatsapp_messages')
    } catch (_) {}
    if (!messages) {
      messages = new Collection({
        name: 'whatsapp_messages',
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
          {
            name: 'kind',
            type: 'select',
            required: true,
            values: [
              'ESCALA',
              'LEMBRETE_ESCALA',
              'INSCRICAO',
              'PAGAMENTO',
              'ANIVERSARIO',
              'CASAMENTO',
              'TESTE',
            ],
            maxSelect: 1,
          },
          { name: 'phone', type: 'text', required: true, max: 20 },
          { name: 'name', type: 'text', max: 200 },
          { name: 'text', type: 'text', required: true, max: 4000 },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['FILA', 'ENVIADO', 'ERRO', 'CANCELADO'],
            maxSelect: 1,
          },
          { name: 'error', type: 'text', max: 1000 },
          { name: 'ref_id', type: 'text', max: 40 },
          { name: 'attempts', type: 'number', onlyInt: true },
          { name: 'send_after', type: 'date' },
          { name: 'sent_at', type: 'date' },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_whatsapp_messages_queue ON whatsapp_messages (status, send_after)',
          'CREATE INDEX idx_whatsapp_messages_church ON whatsapp_messages (church_id, created)',
          'CREATE INDEX idx_whatsapp_messages_ref ON whatsapp_messages (ref_id, kind)',
        ],
      })
      app.save(messages)
    }
  },
  (app) => {
    for (const name of ['whatsapp_messages', 'whatsapp_settings']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
