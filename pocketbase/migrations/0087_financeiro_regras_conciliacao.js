// Migração 0087: Financeiro, conciliação que aprende.
// - fin_bank_lines.match_code: o que identifica o tipo de movimento. Na API do Bradesco é o
//   código do lançamento (ex.: BRADESCO:3584 = RENTAB.INVEST FACIL); nos outros, o começo da
//   descrição sem números (ex.: TEXTO:PIX RECEBIDO).
// - fin_bank_lines.counterparty: quem pagou ou recebeu, quando o extrato diz (REM:, DES:...).
// - fin_reconcile_rules: o que a igreja fez com cada tipo de movimento (conta + sentido +
//   match_code + counterparty → lançar na categoria, transferir para a conta, ou ignorar).
//   Os hooks aprendem a cada conciliação manual; "auto" (só a pessoa liga) faz a regra
//   conciliar sozinha. Sem acesso pela API: tudo passa pela rota finance_reconcile_rules.js.
// Os movimentos que já existem ganham match_code e counterparty aqui.

const LINE_GUARD =
  ' && @request.body.match_code:isset = false && @request.body.counterparty:isset = false'

// Mesma conta de hooks/finance_reconcile_rules.js (keysOf)
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
const WHO = /\b(REM|DES|DEST|FAV|ORIG)\s*[:.]\s*([^·]+)/
const keysOf = (fitid, description) => {
  const d = norm(description)
  const segs = d.split('·').map((x) => x.trim())
  let cp = ''
  const m = WHO.exec(d)
  if (m) cp = m[2]
  else if (segs.length > 1) cp = segs.slice(1).join(' ')
  cp = cp
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ')
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (cp.length < 3) cp = ''
  let code = ''
  const f = String(fitid || '')
  if (f.indexOf('api:bradesco:') === 0) {
    const p = f.slice(13).split('|')
    const c = String(p[2] || '').replace(/^0+/, '')
    if (c) code = 'BRADESCO:' + c
  }
  if (!code) {
    const first = segs[0]
      .replace(/\b(REM|DES|DEST|FAV|ORIG)\s*[:.].*$/, '')
      .replace(/[^A-Z ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
    code = 'TEXTO:' + (first || 'MOVIMENTO')
  }
  return { code: code, cp: cp }
}

migrate(
  (app) => {
    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    if (!lines.fields.getByName('match_code')) {
      lines.fields.add(new TextField({ name: 'match_code', max: 80 }))
      lines.fields.add(new TextField({ name: 'counterparty', max: 80 }))
    }
    const rule = lines.updateRule ? '' + lines.updateRule : ''
    if (rule && rule.indexOf(LINE_GUARD) === -1) lines.updateRule = rule + LINE_GUARD
    app.save(lines)

    let rules = null
    try {
      rules = app.findCollectionByNameOrId('fin_reconcile_rules')
    } catch (_) {}
    if (!rules) {
      const churches = app.findCollectionByNameOrId('churches')
      const accounts = app.findCollectionByNameOrId('fin_accounts')
      rules = new Collection({
        name: 'fin_reconcile_rules',
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
            name: 'account_id',
            type: 'relation',
            required: true,
            collectionId: accounts.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'direction',
            type: 'select',
            required: true,
            values: ['ENTRADA', 'SAIDA'],
            maxSelect: 1,
          },
          { name: 'match_code', type: 'text', required: true, max: 80 },
          { name: 'counterparty', type: 'text', max: 80 },
          {
            name: 'action',
            type: 'select',
            required: true,
            values: ['LANCAR', 'TRANSFERENCIA', 'IGNORAR'],
            maxSelect: 1,
          },
          { name: 'category_id', type: 'text', max: 20 },
          { name: 'cost_center_id', type: 'text', max: 20 },
          { name: 'campaign_id', type: 'text', max: 20 },
          { name: 'person_id', type: 'text', max: 20 },
          { name: 'is_anonymous', type: 'bool' },
          { name: 'supplier_id', type: 'text', max: 20 },
          { name: 'transfer_account_id', type: 'text', max: 20 },
          { name: 'payment_method', type: 'text', max: 20 },
          { name: 'example', type: 'text', max: 300 },
          { name: 'hits', type: 'number', onlyInt: true, min: 0 },
          { name: 'last_line_id', type: 'text', max: 20 },
          { name: 'last_used_at', type: 'date' },
          { name: 'auto', type: 'bool' },
          { name: 'auto_count', type: 'number', onlyInt: true, min: 0 },
          { name: 'auto_by_name', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_fin_reconcile_rules_key ON fin_reconcile_rules (account_id, direction, match_code, counterparty)',
        ],
      })
      app.save(rules)
    }

    for (const r of app.findRecordsByFilter('fin_bank_lines', "match_code = ''", '', 0, 0)) {
      const k = keysOf(r.getString('fitid'), r.getString('description'))
      r.set('match_code', k.code)
      r.set('counterparty', k.cp)
      app.saveNoValidate(r)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fin_reconcile_rules'))
    } catch (_) {}
    const lines = app.findCollectionByNameOrId('fin_bank_lines')
    if (lines.updateRule) lines.updateRule = ('' + lines.updateRule).split(LINE_GUARD).join('')
    for (const n of ['match_code', 'counterparty']) {
      if (lines.fields.getByName(n)) lines.fields.removeByName(n)
    }
    app.save(lines)
  },
)
