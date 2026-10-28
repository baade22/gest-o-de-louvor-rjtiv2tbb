// Migração 0069: Eventos da igreja — questionário, equipe de apoio, check-in por QR e a
// função EVENTOS.
//
// - church_events.questions: perguntas extras da inscrição (JSON: id, label, kind TEXT |
//   CHOICE | YESNO, options, required). church_events.staff: equipe de apoio (JSON: nome,
//   telefone, tarefa).
// - church_event_registrations.answers: respostas (JSON { id da pergunta: texto });
//   checkin_code: código do comprovante (QR) que a equipe lê na entrada, gerado pelo
//   servidor (hooks/church_event_checkin.js) e travado nas regras da API; attended_at e
//   checked_out_at: horário de entrada e de saída.
// - Função EVENTOS (dada só pelo MASTER): organiza eventos e inscrições sem ver a membresia.
//   As regras das duas coleções passam a aceitar MEMBRESIA ou EVENTOS.

const MEMBRESIA = '@collection.church_members.operational_roles ?~ \'"MEMBRESIA"\''
const MEMBRESIA_OU_EVENTOS =
  '(@collection.church_members.operational_roles ?~ \'"MEMBRESIA"\' || @collection.church_members.operational_roles ?~ \'"EVENTOS"\')'
const LOCK_CODE = ' && @request.body.checkin_code:isset = false'
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

migrate(
  (app) => {
    const swap = (rule) => {
      if (rule === null || rule === undefined) return rule
      const s = '' + rule // cópia primitiva (ver nota da 0066)
      return s.indexOf(MEMBRESIA_OU_EVENTOS) !== -1
        ? s
        : s.split(MEMBRESIA).join(MEMBRESIA_OU_EVENTOS)
    }

    const events = app.findCollectionByNameOrId('church_events')
    if (!events.fields.getByName('questions'))
      events.fields.add(new JSONField({ name: 'questions', maxSize: 20000 }))
    if (!events.fields.getByName('staff'))
      events.fields.add(new JSONField({ name: 'staff', maxSize: 20000 }))
    events.listRule = swap(events.listRule)
    events.viewRule = swap(events.viewRule)
    events.createRule = swap(events.createRule)
    events.updateRule = swap(events.updateRule)
    events.deleteRule = swap(events.deleteRule)
    app.save(events)

    const regs = app.findCollectionByNameOrId('church_event_registrations')
    if (!regs.fields.getByName('answers'))
      regs.fields.add(new JSONField({ name: 'answers', maxSize: 20000 }))
    if (!regs.fields.getByName('checkin_code'))
      regs.fields.add(new TextField({ name: 'checkin_code', max: 20, pattern: '^[a-z0-9]*$' }))
    if (!regs.fields.getByName('attended_at'))
      regs.fields.add(new DateField({ name: 'attended_at' }))
    if (!regs.fields.getByName('checked_out_at'))
      regs.fields.add(new DateField({ name: 'checked_out_at' }))
    regs.listRule = swap(regs.listRule)
    regs.viewRule = swap(regs.viewRule)
    const create = swap(regs.createRule)
    const update = swap(regs.updateRule)
    regs.createRule = create.indexOf('checkin_code') === -1 ? create + LOCK_CODE : create
    regs.updateRule = update.indexOf('checkin_code') === -1 ? update + LOCK_CODE : update
    regs.deleteRule = swap(regs.deleteRule)
    regs.addIndex('idx_church_event_regs_checkin', false, 'checkin_code', '')
    app.save(regs)

    // Comprovante para quem já estava inscrito
    const old = app.findRecordsByFilter('church_event_registrations', "checkin_code = ''", '', 0, 0)
    for (const r of old) {
      r.set('checkin_code', $security.randomStringWithAlphabet(12, CODE_ALPHABET))
      app.save(r)
    }
  },
  (app) => {
    const unswap = (rule) => {
      if (rule === null || rule === undefined) return rule
      return ('' + rule).split(MEMBRESIA_OU_EVENTOS).join(MEMBRESIA)
    }
    const regs = app.findCollectionByNameOrId('church_event_registrations')
    for (const name of ['answers', 'checkin_code', 'attended_at', 'checked_out_at']) {
      if (regs.fields.getByName(name)) regs.fields.removeByName(name)
    }
    regs.removeIndex('idx_church_event_regs_checkin')
    regs.listRule = unswap(regs.listRule)
    regs.viewRule = unswap(regs.viewRule)
    regs.createRule = unswap(regs.createRule).split(LOCK_CODE).join('')
    regs.updateRule = unswap(regs.updateRule).split(LOCK_CODE).join('')
    regs.deleteRule = unswap(regs.deleteRule)
    app.save(regs)

    const events = app.findCollectionByNameOrId('church_events')
    for (const name of ['questions', 'staff']) {
      if (events.fields.getByName(name)) events.fields.removeByName(name)
    }
    events.listRule = unswap(events.listRule)
    events.viewRule = unswap(events.viewRule)
    events.createRule = unswap(events.createRule)
    events.updateRule = unswap(events.updateRule)
    events.deleteRule = unswap(events.deleteRule)
    app.save(events)
  },
)
