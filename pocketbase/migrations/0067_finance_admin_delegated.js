// Migração 0067: Financeiro delegado pelo MASTER — ADMIN deixa de ver por padrão (etapa 4).
//
// Pedido do Pedro (2026-10-25, confirmado): o Financeiro passa a ser igual à Membresia —
// só o MASTER e quem receber a função FINANCEIRO/AUDITOR acessam. O ADMIN deixa de ver o
// financeiro por padrão (precisa receber a função).
//
// A ESCRITA do financeiro (create/update/delete) já era só MASTER + FINANCEIRO (sem ADMIN).
// Falta tirar o ADMIN apenas da LEITURA (list/view), cujo bloco de papel é
//   (MASTER || ADMIN || FINANCEIRO || AUDITOR)
// trocado por
//   (MASTER || FINANCEIRO || AUDITOR).
// Esse é o único trecho com ADMIN nas coleções fin_*, então a troca preserva todas as
// demais restrições (isolamento por church_id, relações da mesma igreja, etc.).
//
// Nota JSVM (ver 0066): força cópia primitiva com `('' + rule)` antes de split/join, senão
// salvar várias coleções na mesma transação dá rollback silencioso.
//
// Rollback: devolve o ADMIN à leitura do financeiro.

const FINANCE_COLLECTIONS = [
  'fin_accounts',
  'fin_bank_connections',
  'fin_bank_imports',
  'fin_bank_lines',
  'fin_budgets',
  'fin_campaigns',
  'fin_categories',
  'fin_cost_centers',
  'fin_suppliers',
  'fin_transactions',
]

const WITH_ADMIN =
  "(@collection.church_members.role ?= 'MASTER'" +
  " || @collection.church_members.role ?= 'ADMIN'" +
  " || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"'" +
  " || @collection.church_members.operational_roles ?~ '\"AUDITOR\"')"

const WITHOUT_ADMIN =
  "(@collection.church_members.role ?= 'MASTER'" +
  " || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"'" +
  " || @collection.church_members.operational_roles ?~ '\"AUDITOR\"')"

function applyAll(app, from, to) {
  const swap = (rule) => {
    if (rule === null || rule === undefined) return rule
    const s = '' + rule // cópia primitiva: evita o proxy do goja (ver 0066)
    return s.indexOf(from) === -1 ? s : s.split(from).join(to)
  }
  for (const name of FINANCE_COLLECTIONS) {
    const col = app.findCollectionByNameOrId(name)
    col.listRule = swap(col.listRule)
    col.viewRule = swap(col.viewRule)
    col.createRule = swap(col.createRule)
    col.updateRule = swap(col.updateRule)
    col.deleteRule = swap(col.deleteRule)
    app.save(col)
  }
}

migrate(
  (app) => {
    applyAll(app, WITH_ADMIN, WITHOUT_ADMIN)
  },
  (app) => {
    applyAll(app, WITHOUT_ADMIN, WITH_ADMIN)
  },
)
