// Migração 0077: Financeiro, histórico do extrato pela API e conta "só para ver o extrato".
// - fin_bank_connections.purpose: CONCILIAR (padrão, como antes) ou VISUALIZAR (os movimentos
//   aparecem no extrato, mas não entram na conciliação).
// - fin_bank_connections.reconcile_from: só os movimentos a partir desta data entram na
//   conciliação; os anteriores ficam só no extrato (ex.: anos já conciliados em outro sistema).
// - fin_bank_connections.history_from / history_max: buscar o histórico desde uma data ou o
//   máximo que o banco devolver. O conector busca em partes, do mais novo para o mais antigo.
// - history_loaded_from / history_done_for: até onde o histórico já chegou e para qual pedido
//   ele terminou (só o hook finance_bank_sync.js grava).
// - fin_bank_lines.status ganha EXTRATO: movimento só para consulta. Pela API não dá para
//   mudar uma linha EXTRATO; ela vira PENDENTE quando a conexão passa a conciliar.

const SERVER_FIELDS = ['history_loaded_from', 'history_done_for']
const NO_SERVER = SERVER_FIELDS.map((f) => ' && @request.body.' + f + ':isset = false').join('')
const LINE_GUARD = " && status != 'EXTRATO'"

migrate(
  (app) => {
    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    const add = (field) => {
      if (!conns.fields.getByName(field.name)) conns.fields.add(field)
    }
    add(new SelectField({ name: 'purpose', values: ['CONCILIAR', 'VISUALIZAR'], maxSelect: 1 }))
    add(new DateField({ name: 'reconcile_from' }))
    add(new DateField({ name: 'history_from' }))
    add(new BoolField({ name: 'history_max' }))
    add(new DateField({ name: 'history_loaded_from' }))
    add(new TextField({ name: 'history_done_for', max: 20 }))
    for (const rule of ['createRule', 'updateRule']) {
      // Cópia primitiva da regra: reusar o getter direto faz o save não persistir
      const s = conns[rule] ? '' + conns[rule] : ''
      if (s && s.indexOf('history_done_for:isset') === -1) conns[rule] = s + NO_SERVER
    }
    app.save(conns)

    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    const status = lines.fields.getByName('status')
    if (status.values.indexOf('EXTRATO') === -1) {
      status.values = ['PENDENTE', 'CONCILIADO', 'IGNORADO', 'EXTRATO']
    }
    const lineRule = lines.updateRule ? '' + lines.updateRule : ''
    if (lineRule && lineRule.indexOf(LINE_GUARD) === -1) lines.updateRule = lineRule + LINE_GUARD
    app.save(lines)
  },
  (app) => {
    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    for (const l of app.findRecordsByFilter('fin_bank_lines', "status = 'EXTRATO'", '', 0, 0)) {
      l.set('status', 'PENDENTE')
      app.save(l)
    }
    const status = lines.fields.getByName('status')
    status.values = ['PENDENTE', 'CONCILIADO', 'IGNORADO']
    if (lines.updateRule) lines.updateRule = ('' + lines.updateRule).split(LINE_GUARD).join('')
    app.save(lines)

    const conns = app.findCollectionByNameOrId('fin_bank_connections')
    for (const rule of ['createRule', 'updateRule']) {
      if (conns[rule]) conns[rule] = ('' + conns[rule]).split(NO_SERVER).join('')
    }
    for (const name of [
      'purpose',
      'reconcile_from',
      'history_from',
      'history_max',
      'history_loaded_from',
      'history_done_for',
    ]) {
      if (conns.fields.getByName(name)) conns.fields.removeByName(name)
    }
    app.save(conns)
  },
)
