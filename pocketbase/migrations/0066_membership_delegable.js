// Migração 0066: Membresia como função delegável pelo MASTER (etapa 2 do acesso delegado).
//
// Pedido do Pedro (2026-10-25): membresia só para quem o MASTER delegar — não é mais
// um acesso automático do ADMIN. Introduz a função operacional MEMBRESIA (dada só pelo
// MASTER, como Financeiro/Conselho fiscal — ver musicians_save.js, invitations_create.js
// e church_members_finance_guard.js).
//
// As coleções da membresia passam de "MASTER ou ADMIN" para "MASTER ou quem tem a função
// MEMBRESIA". A única mudança é trocar o termo de autorização do ADMIN
// (`@collection.church_members.role ?= 'ADMIN'`) pelo da função MEMBRESIA
// (`@collection.church_members.operational_roles ?~ '"MEMBRESIA"'`). Esse termo aparece
// uma única vez em cada regra (sempre no bloco de papel), então a troca preserva todas as
// demais restrições de cada coleção (church_id travado, chaves imutáveis, mesma igreja nas
// relações, FINANCEIRO/AUDITOR com leitura em `people`, etc.).
//
// IMPORTANTE (JSVM): os getters de regra (col.listRule, ...) devolvem um valor empacotado
// pelo goja; usar esse valor direto em split/join e reatribuir a vários objetos na mesma
// transação faz o save "passar" mas a transação dar rollback silencioso (nada persiste).
// Por isso forçamos uma cópia primitiva com `('' + r)` antes de mexer na string.
//
// Consequência: um ADMIN que não tiver a função MEMBRESIA deixa de ver/editar a membresia.
// O MASTER continua com acesso total. Rollback restaura "MASTER ou ADMIN".

const MEMBERSHIP_COLLECTIONS = [
  'people',
  'people_events',
  'people_relations',
  'people_signup_links',
  'people_signups',
  'church_events',
  'church_event_registrations',
  'church_groups',
  'church_group_members',
]

migrate(
  (app) => {
    const OLD = "@collection.church_members.role ?= 'ADMIN'"
    const NEW = "@collection.church_members.operational_roles ?~ '\"MEMBRESIA\"'"
    const swap = (rule) => {
      if (rule === null || rule === undefined) return rule
      const s = '' + rule // cópia primitiva: evita o proxy do goja (ver nota acima)
      return s.indexOf(OLD) === -1 ? s : s.split(OLD).join(NEW)
    }
    for (const name of MEMBERSHIP_COLLECTIONS) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = swap(col.listRule)
      col.viewRule = swap(col.viewRule)
      col.createRule = swap(col.createRule)
      col.updateRule = swap(col.updateRule)
      col.deleteRule = swap(col.deleteRule)
      app.save(col)
    }
  },
  (app) => {
    // Rollback: volta a "MASTER ou ADMIN".
    const OLD = "@collection.church_members.role ?= 'ADMIN'"
    const NEW = "@collection.church_members.operational_roles ?~ '\"MEMBRESIA\"'"
    const unswap = (rule) => {
      if (rule === null || rule === undefined) return rule
      const s = '' + rule
      return s.indexOf(NEW) === -1 ? s : s.split(NEW).join(OLD)
    }
    for (const name of MEMBERSHIP_COLLECTIONS) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = unswap(col.listRule)
      col.viewRule = unswap(col.viewRule)
      col.createRule = unswap(col.createRule)
      col.updateRule = unswap(col.updateRule)
      col.deleteRule = unswap(col.deleteRule)
      app.save(col)
    }
  },
)
