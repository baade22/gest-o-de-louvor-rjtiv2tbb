// Pagamento de inscrição em evento da igreja → Financeiro e mensagem de pagamento.
//
// Quando a secretaria marca uma inscrição como paga (Pix, dinheiro, cartão, outro):
// - lança a receita em fin_transactions (categoria "Eventos e inscrições", se existir), na
//   conta escolhida no evento ou, sem ela, numa conta ativa da congregação do evento
//   (dinheiro prefere CAIXA, o resto prefere BANCO). Quem marcou fica como created_by.
//   Se não der (sem conta, mês fechado...), a inscrição fica paga e fin_note explica.
// - se o evento pede, manda a mensagem de pagamento por e-mail; se o envio automático de
//   pagamento estiver ligado em Configurações > WhatsApp, também pelo WhatsApp da igreja.
// Quando o pagamento é desfeito, o lançamento é estornado antes; se o mês já foi fechado no
// Financeiro, o servidor recusa e pede para o financeiro estornar.
//
// O evento com skip_finance não lança nada. Isento não lança.

onRecordUpdateRequest((e) => {
  const reg = e.record
  const old = reg.original()
  const wasPaid = old.getBool('paid')
  const nowPaid = reg.getBool('paid')
  const txId = old.getString('fin_transaction_id')

  // Desfazer pagamento: estorna o lançamento antes de gravar
  if (wasPaid && !nowPaid && txId) {
    let tx = null
    try {
      tx = $app.findRecordById('fin_transactions', txId)
    } catch (_) {}
    if (tx && tx.getString('status') !== 'ESTORNADO') {
      tx.set('status', 'ESTORNADO')
      tx.set('void_reason', 'Pagamento da inscrição desfeito no evento')
      try {
        $app.save(tx)
      } catch (err) {
        throw new BadRequestError(
          'O lançamento deste pagamento está num mês fechado do Financeiro. Peça ao financeiro para estornar.',
        )
      }
    }
    reg.set('fin_transaction_id', '')
    reg.set('fin_note', '')
  }

  e.next()

  const method = reg.getString('payment_method')
  if (wasPaid || !nowPaid || method === 'ISENTO') return

  let ev = null
  try {
    ev = $app.findRecordById('church_events', reg.getString('event_id'))
  } catch (_) {
    return
  }
  const churchId = reg.getString('church_id')
  const amount =
    reg.getFloat('paid_amount') > 0
      ? reg.getFloat('paid_amount')
      : reg.getFloat('amount_due') > 0
        ? reg.getFloat('amount_due')
        : ev.getFloat('price')

  // 1. Financeiro
  if (!ev.getBool('skip_finance') && !reg.getString('fin_transaction_id') && amount > 0) {
    let note = ''
    try {
      let account = null
      const chosen = ev.getString('fin_account_id')
      if (chosen) {
        try {
          const a = $app.findRecordById('fin_accounts', chosen)
          if (a.getString('church_id') === churchId && a.getBool('is_active')) account = a
        } catch (_) {}
      }
      if (!account) {
        const accounts = $app.findRecordsByFilter(
          'fin_accounts',
          'church_id = {:c} && is_active = true',
          'created',
          200,
          0,
          { c: churchId },
        )
        const cong = ev.getString('congregation').toLowerCase()
        const kind = method === 'DINHEIRO' ? 'CAIXA' : 'BANCO'
        let best = -1
        for (const a of accounts) {
          const ac = a.getString('congregation').toLowerCase()
          const score =
            (cong && ac === cong ? 4 : !ac ? 2 : cong ? 0 : 2) +
            (a.getString('kind') === kind ? 1 : 0)
          if (score > best) {
            best = score
            account = a
          }
        }
      }
      if (!account) {
        note = 'Não lançado no Financeiro: cadastre uma conta lá.'
      } else {
        let categoryId = ''
        try {
          const cats = $app.findRecordsByFilter(
            'fin_categories',
            "church_id = {:c} && direction = 'ENTRADA' && is_active = true && name ~ 'Evento'",
            'created',
            1,
            0,
            { c: churchId },
          )
          if (cats.length) categoryId = cats[0].id
        } catch (_) {}

        let createdBy = e.auth && e.auth.collection().name === 'users' ? e.auth.id : ''
        if (!createdBy) createdBy = ev.getString('created_by')
        const payMethod = { PIX: 'PIX', DINHEIRO: 'DINHEIRO', CARTAO: 'CARTAO' }[method] || 'OUTRO'
        const who = reg.getString('partner_name')
          ? reg.getString('name') + ' e ' + reg.getString('partner_name')
          : reg.getString('name')
        const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

        const tx = new Record($app.findCollectionByNameOrId('fin_transactions'))
        tx.set('church_id', churchId)
        tx.set('type', 'ENTRADA')
        tx.set('date', today + ' 12:00:00.000Z')
        tx.set('amount_cents', Math.round(amount * 100))
        tx.set('description', ('Inscrição ' + ev.getString('title') + ' – ' + who).slice(0, 200))
        tx.set('account_id', account.id)
        if (categoryId) tx.set('category_id', categoryId)
        tx.set('payment_method', payMethod)
        if (reg.getString('person_id')) tx.set('person_id', reg.getString('person_id'))
        tx.set('notes', 'Lançado pelo evento (inscrição ' + reg.id + ').')
        tx.set('status', 'CONFIRMADO')
        tx.set('created_by', createdBy)
        $app.save(tx)
        reg.set('fin_transaction_id', tx.id)
      }
    } catch (err) {
      note = ('Não lançado no Financeiro: ' + String(err && err.message ? err.message : err)).slice(
        0,
        300,
      )
    }
    reg.set('fin_note', note)
    try {
      $app.save(reg)
    } catch (err) {
      $app.logger().warn('event payment link failed', 'error', String(err))
    }
  }

  // 2. Confirmação de pagamento pelo WhatsApp da igreja, se o envio automático estiver ligado
  try {
    const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
      c: churchId,
    })
    let auto = {}
    try {
      auto = JSON.parse(st.getString('auto') || '{}') || {}
    } catch (_) {}
    let to = reg.getString('phone').replace(/\D/g, '')
    while (to.indexOf('0') === 0) to = to.slice(1)
    if (to.length === 10 || to.length === 11) to = '55' + to
    if (auto.PAGAMENTO === true && to.length >= 12 && to.length <= 13) {
      let churchName = 'Igreja'
      try {
        churchName = $app.findRecordById('churches', churchId).getString('name')
      } catch (_) {}
      const parts = Number(amount || 0)
        .toFixed(2)
        .split('.')
      const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
      const start = ev.getString('starts_on').slice(0, 10)
      const end = ev.getString('ends_on').slice(0, 10)
      const vars = {
        nome: reg.getString('name').split(' ')[0],
        evento: ev.getString('title'),
        data:
          (end && end !== start ? dmy(start) + ' a ' + dmy(end) : dmy(start)) +
          (ev.getString('start_time') ? ', ' + ev.getString('start_time') : ''),
        local:
          ev.getString('location') ||
          [ev.getString('address_street'), ev.getString('address_number')]
            .filter(Boolean)
            .join(', '),
        valor: 'R$ ' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + parts[1],
        igreja: churchName,
      }
      const wa = (
        ev.getString('payment_message') ||
        'Olá, {nome}! Confirmamos o pagamento da sua inscrição em **{evento}** ({valor}). Obrigado!'
      )
        .replace(/\{(\w+)\}/g, (all, k) =>
          Object.prototype.hasOwnProperty.call(vars, k.toLowerCase()) ? vars[k.toLowerCase()] : all,
        )
        .split('\n')
        .map((l) => l.replace(/^#{1,3}\s+(.*)$/, '**$1**'))
        .join('\n')
        .replace(/\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g, (_, b, i) =>
          b !== undefined ? '*' + b + '*' : '_' + i + '_',
        )
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', churchId)
      msg.set('kind', 'PAGAMENTO')
      msg.set('phone', to)
      msg.set('name', reg.getString('name'))
      msg.set('text', wa.slice(0, 4000))
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('ref_id', reg.id)
      msg.set('send_after', new Date().toISOString())
      $app.save(msg)
    }
  } catch (_) {
    // WhatsApp não configurado: segue só com o e-mail
  }

  // 3. Mensagem de pagamento por e-mail
  const email = reg.getString('email')
  const text = ev.getString('payment_message')
  if (!email || !text || !ev.getBool('send_payment_email')) return
  try {
    const settings = $app.settings()
    if (!settings.smtp.enabled) return
    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', churchId).getString('name')
    } catch (_) {}
    const parts = Number(amount || 0)
      .toFixed(2)
      .split('.')
    const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '')
    const start = ev.getString('starts_on').slice(0, 10)
    const end = ev.getString('ends_on').slice(0, 10)
    const vars = {
      nome: reg.getString('name').split(' ')[0],
      evento: ev.getString('title'),
      data:
        (end && end !== start ? dmy(start) + ' a ' + dmy(end) : dmy(start)) +
        (ev.getString('start_time') ? ', ' + ev.getString('start_time') : ''),
      local:
        ev.getString('location') ||
        [ev.getString('address_street'), ev.getString('address_number')].filter(Boolean).join(', '),
      valor: 'R$ ' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + parts[1],
      igreja: churchName,
    }
    const message = text.replace(/\{(\w+)\}/g, (all, k) =>
      Object.prototype.hasOwnProperty.call(vars, k.toLowerCase()) ? vars[k.toLowerCase()] : all,
    )
    const esc = (s) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const inline = (s) =>
      esc(s)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')
    const html = message
      .replace(/\r\n?/g, '\n')
      .split(/\n\s*\n/)
      .map((block) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            '<ul>' +
            lines.map((l) => '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') +
            '</ul>'
          )
        }
        if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
          return '<h3>' + inline(lines[0].replace(/^#{1,3}\s+/, '')) + '</h3>'
        }
        return '<p>' + lines.map(inline).join('<br>') + '</p>'
      })
      .join('')
    $app.newMailClient().send(
      new MailerMessage({
        from: {
          address: settings.meta.senderAddress,
          name: settings.meta.senderName || churchName,
        },
        to: [{ address: email }],
        subject: 'Pagamento confirmado: ' + ev.getString('title'),
        html:
          '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b">' +
          html +
          '</div>',
      }),
    )
  } catch (err) {
    $app.logger().warn('event payment email failed', 'error', String(err))
  }
}, 'church_event_registrations')
