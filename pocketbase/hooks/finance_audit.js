// Auditoria do conselho fiscal (Financeiro)
//
// POST /backend/v1/finance/audit
// Body: { church_id, action: 'approve' | 'objection' | 'reply', transaction_ids: [...], text? }
// - approve: aprova um ou vários lançamentos (AUDITOR ou MASTER). Também resolve a ressalva.
//   Quem lançou não aprova o próprio lançamento; num lote, esses ficam de fora e voltam contados.
// - objection: registra uma ressalva com texto num lançamento (AUDITOR ou MASTER).
// - reply: a tesouraria responde a ressalva (FINANCEIRO ou MASTER).
// fin_audits e fin_audit_comments só são gravados aqui.

routerAdd(
  'POST',
  '/backend/v1/finance/audit',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const action = String(body.action || '')
    const text = String(body.text || '').trim()
    const ids = Array.isArray(body.transaction_ids)
      ? body.transaction_ids.map((id) => String(id)).filter(Boolean)
      : []
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })
    if (['approve', 'objection', 'reply'].indexOf(action) === -1) {
      return e.json(400, { message: 'Ação desconhecida' })
    }
    if (!ids.length) return e.json(400, { message: 'Escolha ao menos um lançamento.' })
    if (ids.length > 500) return e.json(400, { message: 'No máximo 500 lançamentos por vez.' })
    if (action !== 'approve' && ids.length !== 1) {
      return e.json(400, { message: 'Ressalva e resposta são de um lançamento por vez.' })
    }
    if (action !== 'approve' && text.length < 3) {
      return e.json(400, { message: 'Escreva o motivo.' })
    }
    if (text.length > 2000) return e.json(400, { message: 'Texto longo demais.' })

    let member = null
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: auth.id },
      )
      member = rows.length ? rows[0] : null
    } catch (_) {}
    if (!member) return e.json(403, { message: 'Sem acesso ao financeiro desta igreja.' })
    const role = member.getString('role')
    let opRoles = []
    try {
      opRoles = JSON.parse(member.getString('operational_roles') || '[]') || []
    } catch (_) {}
    const isMaster = role === 'MASTER'
    const isAuditor = opRoles.indexOf('AUDITOR') !== -1
    const isFin = opRoles.indexOf('FINANCEIRO') !== -1
    if (action === 'reply' ? !isMaster && !isFin : !isMaster && !isAuditor) {
      return e.json(403, {
        message:
          action === 'reply'
            ? 'Só a tesouraria responde a ressalva.'
            : 'Só o conselho fiscal aprova ou registra ressalva.',
      })
    }
    const authorRole =
      isAuditor && action !== 'reply' ? 'Conselho fiscal' : isFin ? 'Tesouraria' : 'Master'
    const userName = auth.getString('name') || auth.getString('email')

    // Confere tudo antes de gravar
    const items = []
    let skippedOwn = 0
    for (const id of ids) {
      let tx = null
      try {
        tx = $app.findRecordById('fin_transactions', id)
      } catch (_) {}
      if (!tx || tx.getString('church_id') !== churchId) {
        return e.json(400, { message: 'Lançamento não encontrado nesta igreja.' })
      }
      let audit = null
      try {
        audit = $app.findFirstRecordByFilter('fin_audits', 'transaction_id = {:id}', { id: id })
      } catch (_) {}
      if (action === 'approve' && tx.getString('created_by') === auth.id) {
        if (ids.length === 1) {
          return e.json(400, { message: 'Quem lançou não aprova o próprio lançamento.' })
        }
        skippedOwn++
        continue
      }
      if (action === 'reply' && (!audit || audit.getString('status') === 'APROVADO')) {
        return e.json(400, { message: 'Este lançamento não tem ressalva para responder.' })
      }
      items.push({ id: id, tx: tx, audit: audit })
    }

    let status = ''
    try {
      $app.runInTransaction((txApp) => {
        const audits = txApp.findCollectionByNameOrId('fin_audits')
        const comments = txApp.findCollectionByNameOrId('fin_audit_comments')
        for (const item of items) {
          const tx = item.tx
          const month = tx.getString('date').slice(0, 7)
          let audit = item.audit ? txApp.findRecordById('fin_audits', item.audit.id) : null
          const hadObjection = !!audit && audit.getString('status') !== 'APROVADO'
          if (!audit) {
            audit = new Record(audits)
            audit.set('church_id', churchId)
            audit.set('transaction_id', item.id)
          }
          audit.set('month', month)
          if (action === 'approve') {
            audit.set('status', 'APROVADO')
            audit.set('approved_by', auth.id)
            audit.set('approved_by_name', userName)
            audit.set('approved_at', new Date().toISOString().replace('T', ' '))
            audit.set('tx_updated', tx.getString('updated'))
          } else if (action === 'objection') {
            audit.set('status', 'RESSALVA')
            audit.set('approved_by', '')
            audit.set('approved_by_name', '')
            audit.set('approved_at', '')
            audit.set('tx_updated', '')
          } else {
            audit.set('status', 'RESPONDIDA')
          }
          txApp.save(audit)
          status = audit.getString('status')
          const kind =
            action === 'approve' ? 'APROVACAO' : action === 'objection' ? 'RESSALVA' : 'RESPOSTA'
          // Aprovação simples não vira comentário; só quando resolve uma ressalva ou tem texto
          if (action !== 'approve' || hadObjection || text) {
            const c = new Record(comments)
            c.set('church_id', churchId)
            c.set('audit_id', audit.id)
            c.set('month', month)
            c.set('kind', kind)
            c.set('text', text)
            c.set('author_id', auth.id)
            c.set('author_name', userName)
            c.set('author_role', authorRole)
            txApp.save(c)
          }
        }
      })
    } catch (err) {
      console.log('finance_audit: erro', String((err && err.message) || err))
      return e.json(500, { message: 'Não foi possível gravar a auditoria.' })
    }
    const result = {
      approved: action === 'approve' ? items.length : 0,
      skipped_own: skippedOwn,
      status: status,
    }
    return e.json(200, result)
  },
  $apis.requireAuth(),
)
