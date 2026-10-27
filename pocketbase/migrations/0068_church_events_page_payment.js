// Migração 0068: Eventos da igreja — página do evento, mensagens, Pix e Financeiro.
//
// church_events ganha:
// - página pública: capa para celular (horizontal) e para computador (vertical), cor dos
//   botões, endereço completo (CEP), contato para dúvidas, data limite de inscrição e as
//   opções "só divulgar", "esconder o valor" e "esconder o cabeçalho";
// - mensagens de confirmação de inscrição e de pagamento (texto com formatação simples e
//   campos {nome}, {evento}...), com envio opcional por e-mail;
// - cupons de desconto (JSON) e "exclusivo para casais" (um valor para os dois);
// - ligação com o Financeiro: conta que recebe (opcional) e skip_finance para não lançar;
// - closed_at: evento encerrado.
// church_event_registrations ganha cônjuge, cupom, valor devido e o lançamento do
// Financeiro (fin_transaction_id, fin_note). Esses dois só o servidor grava
// (hooks/church_event_payments.js), por isso ficam bloqueados nas regras da API.
//
// As capas não são protegidas: aparecem na página pública de inscrição.

const LOCK_FIN =
  ' && @request.body.fin_transaction_id:isset = false && @request.body.fin_note:isset = false'

const EVENT_RATE = {
  label: '/backend/v1/event-signup/coupon',
  audience: '',
  duration: 60,
  maxRequests: 20,
}

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId('church_events')
    const add = (field) => {
      if (!events.fields.getByName(field.name)) events.fields.add(field)
    }
    const image = (name) =>
      new FileField({
        name: name,
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        thumbs: ['640x0'],
        protected: false,
      })
    add(image('cover'))
    add(image('cover_side'))
    add(new TextField({ name: 'color', max: 7, pattern: '^(#[0-9a-fA-F]{6})?$' }))
    add(new DateField({ name: 'registration_deadline' }))
    add(new TextField({ name: 'contact_name', max: 120 }))
    add(new TextField({ name: 'contact_phone', max: 40 }))
    add(new TextField({ name: 'address_cep', max: 9 }))
    add(new TextField({ name: 'address_street', max: 160 }))
    add(new TextField({ name: 'address_number', max: 20 }))
    add(new TextField({ name: 'address_complement', max: 80 }))
    add(new TextField({ name: 'address_district', max: 80 }))
    add(new TextField({ name: 'address_city', max: 80 }))
    add(new TextField({ name: 'address_state', max: 2 }))
    add(new BoolField({ name: 'publish_only' }))
    add(new BoolField({ name: 'hide_price' }))
    add(new BoolField({ name: 'hide_header' }))
    add(new BoolField({ name: 'couple_only' }))
    add(new TextField({ name: 'confirm_message', max: 4000 }))
    add(new TextField({ name: 'payment_message', max: 4000 }))
    add(new BoolField({ name: 'send_confirm_email' }))
    add(new BoolField({ name: 'send_payment_email' }))
    add(new JSONField({ name: 'coupons', maxSize: 20000 }))
    add(new BoolField({ name: 'skip_finance' }))
    add(
      new RelationField({
        name: 'fin_account_id',
        collectionId: app.findCollectionByNameOrId('fin_accounts').id,
        cascadeDelete: false,
        maxSelect: 1,
      }),
    )
    add(new DateField({ name: 'closed_at' }))
    // Descrição com formatação fica maior
    const description = events.fields.getByName('description')
    if (description) description.max = 8000
    app.save(events)

    const regs = app.findCollectionByNameOrId('church_event_registrations')
    const addReg = (field) => {
      if (!regs.fields.getByName(field.name)) regs.fields.add(field)
    }
    addReg(new TextField({ name: 'partner_name', max: 200 }))
    addReg(new TextField({ name: 'partner_phone', max: 40 }))
    addReg(new TextField({ name: 'coupon_code', max: 30 }))
    addReg(new NumberField({ name: 'amount_due', min: 0 }))
    addReg(
      new RelationField({
        name: 'fin_transaction_id',
        collectionId: app.findCollectionByNameOrId('fin_transactions').id,
        cascadeDelete: false,
        maxSelect: 1,
      }),
    )
    addReg(new TextField({ name: 'fin_note', max: 300 }))
    const create = '' + regs.createRule // cópia primitiva (ver nota da 0066)
    const update = '' + regs.updateRule
    if (create.indexOf('fin_transaction_id') === -1) regs.createRule = create + LOCK_FIN
    if (update.indexOf('fin_transaction_id') === -1) regs.updateRule = update + LOCK_FIN
    app.save(regs)

    const s = app.settings()
    const rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    if (!rules.some((r) => r.label === EVENT_RATE.label)) {
      s.rateLimits.rules = [EVENT_RATE].concat(rules)
      app.save(s)
    }
  },
  (app) => {
    const regs = app.findCollectionByNameOrId('church_event_registrations')
    for (const name of [
      'partner_name',
      'partner_phone',
      'coupon_code',
      'amount_due',
      'fin_transaction_id',
      'fin_note',
    ]) {
      if (regs.fields.getByName(name)) regs.fields.removeByName(name)
    }
    regs.createRule = ('' + regs.createRule).split(LOCK_FIN).join('')
    regs.updateRule = ('' + regs.updateRule).split(LOCK_FIN).join('')
    app.save(regs)

    const events = app.findCollectionByNameOrId('church_events')
    for (const name of [
      'cover',
      'cover_side',
      'color',
      'registration_deadline',
      'contact_name',
      'contact_phone',
      'address_cep',
      'address_street',
      'address_number',
      'address_complement',
      'address_district',
      'address_city',
      'address_state',
      'publish_only',
      'hide_price',
      'hide_header',
      'couple_only',
      'confirm_message',
      'payment_message',
      'send_confirm_email',
      'send_payment_email',
      'coupons',
      'skip_finance',
      'fin_account_id',
      'closed_at',
    ]) {
      if (events.fields.getByName(name)) events.fields.removeByName(name)
    }
    app.save(events)

    const s = app.settings()
    const rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    s.rateLimits.rules = rules.filter((r) => r.label !== EVENT_RATE.label)
    app.save(s)
  },
)
