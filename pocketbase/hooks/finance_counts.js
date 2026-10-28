// Aprovação da contagem do culto (Financeiro)
// POST /backend/v1/finance/counts/approve
// Body: { count_id: string }
// Quem aprova precisa ser MASTER ou ter financeiro.contagem.aprovar na igreja da contagem, e não pode
// ser quem contou (são sempre duas pessoas). Numa transação só: cria um lançamento para o
// dinheiro da salva (anônimo) e um para cada envelope, e trava a contagem como APROVADO.

routerAdd(
  'POST',
  '/backend/v1/finance/counts/approve',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Não autorizado' })
    }

    const body = e.requestInfo().body || {}
    const countId = String(body.count_id || '').trim()
    if (!countId) {
      return e.json(400, { message: 'count_id é obrigatório' })
    }

    let count = null
    try {
      count = $app.findRecordById('fin_counts', countId)
    } catch (_) {
      return e.json(404, { message: 'Contagem não encontrada' })
    }
    const churchId = count.getString('church_id')

    let member = null
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: authRecord.id },
      )
      member = rows.length > 0 ? rows[0] : null
    } catch (_) {}
    if (!member) {
      return e.json(404, { message: 'Contagem não encontrada' })
    }
    let perms = []
    let cong = []
    try {
      perms = JSON.parse(member.getString('permissions') || '[]') || []
      cong = JSON.parse(member.getString('cong_financeiro') || '[]') || []
    } catch (_) {}
    if (member.getString('role') !== 'MASTER') {
      if (perms.indexOf('financeiro.contagem.aprovar') === -1) {
        return e.json(403, { message: 'Seu perfil de acesso não permite aprovar a contagem.' })
      }
      let c = ''
      try {
        c = $app
          .findRecordById('fin_accounts', count.getString('account_id'))
          .getString('congregation')
      } catch (_) {}
      if (cong.indexOf('*') === -1 && c && cong.indexOf(c) === -1) {
        return e.json(403, { message: 'Esta contagem é de uma congregação fora do seu perfil.' })
      }
    }

    if (count.getString('status') !== 'CONTADO') {
      return e.json(400, { message: 'Esta contagem já foi aprovada ou cancelada.' })
    }
    if (count.getString('counted_by') === authRecord.id) {
      return e.json(400, {
        message: 'A conferência precisa ser feita por outra pessoa, não por quem contou.',
      })
    }

    let envelopes = []
    try {
      const raw = count.get('envelopes')
      envelopes =
        typeof raw === 'string' ? JSON.parse(raw || '[]') : JSON.parse(String(raw || '[]'))
    } catch (_) {
      try {
        envelopes = JSON.parse(count.getString('envelopes') || '[]')
      } catch (_) {
        envelopes = []
      }
    }
    if (!Array.isArray(envelopes)) envelopes = []

    const belongs = (collection, id) => {
      if (!id) return false
      try {
        return $app.findRecordById(collection, id).getString('church_id') === churchId
      } catch (_) {
        return false
      }
    }
    for (const env of envelopes) {
      const amount = Number(env && env.amount_cents)
      if (!Number.isInteger(amount) || amount <= 0) {
        return e.json(400, { message: 'Há um envelope sem valor. Corrija a contagem.' })
      }
      if (!belongs('fin_categories', env.category_id)) {
        return e.json(400, { message: 'Há um envelope sem categoria válida. Corrija a contagem.' })
      }
      if (env.person_id && !belongs('people', env.person_id)) {
        return e.json(400, { message: 'Há um envelope com pessoa inválida. Corrija a contagem.' })
      }
    }
    const cash = count.getInt('cash_cents')
    if (cash <= 0 && envelopes.length === 0) {
      return e.json(400, { message: 'A contagem está vazia.' })
    }

    const date = count.getString('date')
    const eventId = count.getString('event_id')
    let eventTitle = ''
    if (eventId) {
      try {
        eventTitle = $app.findRecordById('events', eventId).getString('title')
      } catch (_) {}
    }
    const suffix = eventTitle ? ' · ' + eventTitle : ''
    const now = new Date().toISOString().replace('T', ' ')

    try {
      $app.runInTransaction((txApp) => {
        const txCollection = txApp.findCollectionByNameOrId('fin_transactions')
        const addTx = (fields) => {
          const rec = new Record(txCollection)
          rec.set('church_id', churchId)
          rec.set('type', 'ENTRADA')
          rec.set('date', date)
          rec.set('account_id', count.getString('account_id'))
          rec.set('payment_method', 'DINHEIRO')
          rec.set('event_id', eventId)
          rec.set('count_id', count.id)
          rec.set('status', 'CONFIRMADO')
          rec.set('created_by', authRecord.id)
          for (const key in fields) rec.set(key, fields[key])
          txApp.save(rec)
        }

        if (cash > 0) {
          addTx({
            amount_cents: cash,
            category_id: count.getString('offering_category_id'),
            is_anonymous: true,
            description: 'Oferta do culto' + suffix,
          })
        }
        for (const env of envelopes) {
          addTx({
            amount_cents: Number(env.amount_cents),
            category_id: env.category_id,
            person_id: env.person_id || '',
            is_anonymous: !env.person_id,
            description: 'Envelope' + suffix,
          })
        }

        const fresh = txApp.findRecordById('fin_counts', count.id)
        if (fresh.getString('status') !== 'CONTADO') {
          throw new Error('Esta contagem já foi aprovada ou cancelada.')
        }
        fresh.set('status', 'APROVADO')
        fresh.set('approved_by', authRecord.id)
        fresh.set('approved_at', now)
        fresh.set('approved_by_name', authRecord.getString('name') || authRecord.getString('email'))
        fresh.set('difference_note', '')
        txApp.save(fresh)
      })
    } catch (err) {
      return e.json(400, { message: 'Não foi possível aprovar: ' + err.message })
    }

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)
