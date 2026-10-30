// Migração 0079: Financeiro, comprovantes de pagamento mandados pelo WhatsApp da igreja.
// Quem paga contas (PIX, boleto, débito) manda a foto ou o PDF do comprovante para o WhatsApp
// da igreja; uma IA lê o comprovante e o LouvorFlow acha o movimento no extrato, abre a conta
// a pagar já paga e concilia. Se ficar em dúvida, o comprovante fica para alguém conferir.
//
// - fin_receipt_senders: celulares autorizados a mandar comprovantes (os outros são ignorados).
// - fin_receipts: cada comprovante recebido, o que a IA leu (data), os movimentos candidatos
//   e o resultado (linha do extrato, lançamento e conta a pagar).
//   media_b64 guarda o arquivo para a IA ler e é apagado quando o comprovante é concluído.
// - whatsapp_settings.inbound_token: segredo do endereço que a Evolution chama a cada mensagem.
// - whatsapp_messages.kind ganha COMPROVANTE (resposta para quem mandou).
//
// Sem regra de API: só os hooks (finance_receipts.js) mexem; a tela usa a rota
// /backend/v1/finance/receipts.

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    const transactions = app.findCollectionByNameOrId('fin_transactions')
    const bills = app.findCollectionByNameOrId('fin_bills')
    const categories = app.findCollectionByNameOrId('fin_categories')
    const church = {
      name: 'church_id',
      type: 'relation',
      required: true,
      collectionId: churches.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
    const stamps = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const exists = (name) => {
      try {
        app.findCollectionByNameOrId(name)
        return true
      } catch (_) {
        return false
      }
    }

    if (!exists('fin_receipt_senders')) {
      app.save(
        new Collection({
          name: 'fin_receipt_senders',
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: [
            church,
            { name: 'name', type: 'text', required: true, max: 160 },
            { name: 'phone', type: 'text', required: true, max: 20 },
            { name: 'is_active', type: 'bool' },
            ...stamps,
          ],
          indexes: [
            'CREATE UNIQUE INDEX idx_fin_receipt_senders_phone ON fin_receipt_senders (church_id, phone)',
          ],
        }),
      )
    }

    if (!exists('fin_receipts')) {
      app.save(
        new Collection({
          name: 'fin_receipts',
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: [
            church,
            { name: 'sender_phone', type: 'text', max: 20 },
            { name: 'sender_name', type: 'text', max: 160 },
            { name: 'wa_message_id', type: 'text', max: 120 },
            { name: 'caption', type: 'text', max: 1000 },
            {
              name: 'file',
              type: 'file',
              maxSelect: 1,
              maxSize: 10485760,
              mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
              protected: true,
            },
            { name: 'mime', type: 'text', max: 80 },
            { name: 'media_b64', type: 'text', max: 15000000 },
            {
              name: 'status',
              type: 'select',
              required: true,
              values: [
                'RECEBIDO',
                'LENDO',
                'AGUARDANDO',
                'ANALISE',
                'CONFIRMANDO',
                'CONCILIADO',
                'DESCARTADO',
              ],
              maxSelect: 1,
            },
            { name: 'reason', type: 'text', max: 300 },
            { name: 'data', type: 'json', maxSize: 20000 },
            { name: 'candidates', type: 'json', maxSize: 5000 },
            {
              name: 'line_id',
              type: 'relation',
              collectionId: lines.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            {
              name: 'transaction_id',
              type: 'relation',
              collectionId: transactions.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            {
              name: 'bill_id',
              type: 'relation',
              collectionId: bills.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            // Escolhidos por quem conferiu: o cron concilia com esta linha e esta categoria
            {
              name: 'chosen_category_id',
              type: 'relation',
              collectionId: categories.id,
              cascadeDelete: false,
              maxSelect: 1,
            },
            { name: 'chosen_by', type: 'text', max: 40 },
            { name: 'attempts', type: 'number', onlyInt: true },
            { name: 'next_try', type: 'date' },
            { name: 'notified', type: 'text', max: 20 },
            { name: 'done_by_name', type: 'text', max: 160 },
            ...stamps,
          ],
          indexes: [
            'CREATE INDEX idx_fin_receipts_church ON fin_receipts (church_id, created)',
            'CREATE INDEX idx_fin_receipts_queue ON fin_receipts (status, next_try)',
            'CREATE INDEX idx_fin_receipts_msg ON fin_receipts (church_id, wa_message_id)',
            'CREATE INDEX idx_fin_receipts_line ON fin_receipts (line_id)',
          ],
        }),
      )
    }

    const settings = app.findCollectionByNameOrId('whatsapp_settings')
    if (!settings.fields.getByName('inbound_token')) {
      settings.fields.add(new TextField({ name: 'inbound_token', max: 80 }))
      settings.fields.add(new TextField({ name: 'inbound_url', max: 500 }))
      app.save(settings)
    }

    const messages = app.findCollectionByNameOrId('whatsapp_messages')
    const kind = messages.fields.getByName('kind')
    const values = []
    for (const v of kind.values) values.push('' + v)
    if (values.indexOf('COMPROVANTE') === -1) {
      values.push('COMPROVANTE')
      kind.values = values
      app.save(messages)
    }
  },
  (app) => {
    for (const name of ['fin_receipts', 'fin_receipt_senders']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    const settings = app.findCollectionByNameOrId('whatsapp_settings')
    for (const name of ['inbound_token', 'inbound_url']) {
      if (settings.fields.getByName(name)) settings.fields.removeByName(name)
    }
    app.save(settings)
    const messages = app.findCollectionByNameOrId('whatsapp_messages')
    const kind = messages.fields.getByName('kind')
    const values = []
    for (const v of kind.values) if ('' + v !== 'COMPROVANTE') values.push('' + v)
    kind.values = values
    app.save(messages)
  },
)
