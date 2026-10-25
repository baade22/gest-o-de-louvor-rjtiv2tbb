// Orçamento anual do Financeiro
//
// POST /backend/v1/finance/budget
// Body: { church_id, year, congregation, lines: [{ category_id, amount_cents }] }
// Substitui o orçamento daquele ano e congregação (vazio = igreja toda) pelas linhas
// enviadas, numa transação só. Linha com valor 0 é removida. MASTER ou FINANCEIRO.

routerAdd(
  'POST',
  '/backend/v1/finance/budget',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const year = Number(body.year)
    const congregation = String(body.congregation || '').trim()
    const lines = Array.isArray(body.lines) ? body.lines : null
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return e.json(400, { message: 'Ano inválido.' })
    }
    if (congregation.length > 60) return e.json(400, { message: 'Congregação inválida.' })
    if (!lines || lines.length > 500)
      return e.json(400, { message: 'Linhas do orçamento inválidas.' })

    let member = null
    try {
      member = $app.findFirstRecordByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        { c: churchId, u: auth.id },
      )
    } catch (_) {}
    let ops = []
    try {
      ops = JSON.parse((member && member.getString('operational_roles')) || '[]') || []
    } catch (_) {}
    if (!member || (member.getString('role') !== 'MASTER' && ops.indexOf('FINANCEIRO') === -1)) {
      return e.json(403, { message: 'Só a tesouraria monta o orçamento.' })
    }

    // Confere tudo antes de gravar
    const wanted = {}
    for (const line of lines) {
      const categoryId = String((line && line.category_id) || '')
      const amount = Number(line && line.amount_cents)
      if (!Number.isInteger(amount) || amount < 0 || amount > 100000000000) {
        return e.json(400, { message: 'Valor inválido no orçamento.' })
      }
      let category = null
      try {
        category = $app.findRecordById('fin_categories', categoryId)
      } catch (_) {}
      if (!category || category.getString('church_id') !== churchId) {
        return e.json(400, { message: 'Categoria de outra igreja.' })
      }
      wanted[categoryId] = amount
    }

    const userName = auth.getString('name') || auth.getString('email')
    let saved = 0
    try {
      $app.runInTransaction((txApp) => {
        const col = txApp.findCollectionByNameOrId('fin_budgets')
        // Filtra ano e congregação aqui: o parâmetro numérico do filtro não casa com o ano
        const existing = txApp
          .findRecordsByFilter('fin_budgets', 'church_id = {:c}', '', 5000, 0, { c: churchId })
          .filter((r) => r.getInt('year') === year && r.getString('congregation') === congregation)
        const byCategory = {}
        for (const rec of existing) byCategory[rec.getString('category_id')] = rec
        for (const rec of existing) {
          const amount = wanted[rec.getString('category_id')]
          if (!amount) txApp.delete(rec)
        }
        for (const categoryId in wanted) {
          const amount = wanted[categoryId]
          if (!amount) continue
          let rec = byCategory[categoryId]
          if (rec && rec.getInt('amount_cents') === amount) {
            saved++
            continue
          }
          if (!rec) {
            rec = new Record(col)
            rec.set('church_id', churchId)
            rec.set('year', year)
            rec.set('congregation', congregation)
            rec.set('category_id', categoryId)
          }
          rec.set('amount_cents', amount)
          rec.set('updated_by_name', userName)
          txApp.save(rec)
          saved++
        }
      })
    } catch (err) {
      console.log('finance_budget: erro', String((err && err.message) || err))
      return e.json(500, { message: 'Não foi possível gravar o orçamento.' })
    }
    return e.json(200, { lines: saved })
  },
  $apis.requireAuth(),
)
