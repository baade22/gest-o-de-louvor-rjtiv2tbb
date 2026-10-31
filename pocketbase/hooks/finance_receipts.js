// Comprovantes de pagamento pelo WhatsApp (Financeiro)
//
// Quem paga contas pela igreja (PIX, boleto, débito) manda a foto ou o PDF do comprovante para
// o WhatsApp da igreja. Só os celulares cadastrados em Financeiro > Comprovantes contam; as
// outras mensagens são ignoradas.
//
// 1. A Evolution chama POST /backend/v1/whatsapp/inbound/{token} a cada mensagem. O token é o
//    segredo whatsapp_settings.inbound_token; a rota guarda o comprovante (RECEBIDO).
// 2. A cada minuto o cron "finance_receipts" manda o comprovante para a IA (Claude), que lê
//    valor, data, forma de pagamento, quem recebeu, código da transação e sugere a categoria.
// 3. Procura no extrato um movimento PENDENTE de saída com o mesmo valor, de 3 dias antes a
//    5 dias depois. Desempata pelo código da transação, CPF/CNPJ e nome de quem recebeu, forma
//    de pagamento e distância da data. Movimento que ainda não chegou: AGUARDANDO, confere de
//    hora em hora por 7 dias. Empate de verdade ou falta de categoria: ANALISE, para uma pessoa.
// 4. Com um movimento só: dá baixa na conta a pagar em aberto de mesmo valor (vencimento até
//    15 dias de distância) ou abre a conta a pagar já paga, cria o lançamento com o comprovante
//    anexado e concilia (CONCILIADO). Quem mandou recebe a resposta pelo WhatsApp.
//
// POST /backend/v1/finance/receipts { church_id, action, ... } é a tela (status, list, senders,
// sender_save, sender_delete, choose, discard, retry). GET .../receipts/{id}/file devolve o
// arquivo. Ver: MASTER ou financeiro.conciliacao.ver; mudar: financeiro.conciliacao.alterar.
//
// A chave da IA vem do segredo ANTHROPIC_API_KEY (LOUVORFLOW_AI_MODEL troca o modelo).
// Cada handler roda isolado no PocketBase: os helpers ficam dentro de cada um.

// Conferência do endereço: a tela só entrega à Evolution um endereço que chega neste servidor
routerAdd('GET', '/backend/v1/whatsapp/inbound/{token}', (e) => {
  const token = String(e.request.pathValue('token') || '')
  if (token.length < 32) return e.json(404, { message: 'Não encontrado' })
  try {
    $app.findFirstRecordByFilter('whatsapp_settings', 'inbound_token = {:t}', { t: token })
  } catch (_) {
    return e.json(404, { message: 'Não encontrado' })
  }
  return e.json(200, { ok: true })
})

routerAdd('POST', '/backend/v1/whatsapp/inbound/{token}', (e) => {
  const token = String(e.request.pathValue('token') || '')
  if (token.length < 32) return e.json(404, { message: 'Não encontrado' })
  let st = null
  try {
    st = $app.findFirstRecordByFilter('whatsapp_settings', 'inbound_token = {:t}', { t: token })
  } catch (_) {
    return e.json(404, { message: 'Não encontrado' })
  }
  const churchId = st.getString('church_id')
  const inst = st.getString('instance')
  const body = e.requestInfo().body || {}
  const event = String(body.event || '')
    .toLowerCase()
    .replace(/_/g, '.')
  if (event !== 'messages.upsert') return e.json(200, { ok: true })
  // O que aconteceu com a última mensagem fica para a tela de Comprovantes (diagnóstico)
  const mask = (p) => '…' + String(p || '').slice(-4)
  const note = (text) => {
    try {
      st.set('inbound_last_at', new Date().toISOString().replace('T', ' '))
      st.set('inbound_last_note', String(text).slice(0, 300))
      $app.save(st)
    } catch (_) {}
  }
  if (body.instance && String(body.instance) !== inst) {
    note(
      'Mensagem de outra instância do WhatsApp (' +
        String(body.instance).slice(0, 40) +
        '): ignorada.',
    )
    return e.json(200, { ok: true })
  }

  const apiUrl = String($os.getenv('WHATSAPP_API_URL') || '')
    .replace(/\s+/g, '')
    .replace(/\/+$/, '')
  const apiKey = String($os.getenv('WHATSAPP_API_KEY') || '').trim()

  // Celular brasileiro sem o 9 depois do DDD: o WhatsApp às vezes manda com, às vezes sem
  const phoneKey = (p) => {
    let d = String(p || '').replace(/\D/g, '')
    while (d.indexOf('0') === 0) d = d.slice(1)
    if (d.length === 10 || d.length === 11) d = '55' + d
    if (d.length === 13 && d.indexOf('55') === 0 && d.charAt(4) === '9') {
      d = d.slice(0, 4) + d.slice(5)
    }
    return d
  }
  const reply = (phone, name, text, refId) => {
    try {
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', churchId)
      msg.set('kind', 'COMPROVANTE')
      msg.set('phone', phone)
      msg.set('name', name)
      msg.set('text', text)
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('ref_id', refId || '')
      msg.set('send_after', new Date().toISOString())
      $app.save(msg)
    } catch (err) {
      console.log('comprovantes: resposta não entrou na fila: ' + err)
    }
  }
  const decode = (b64) => {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const map = {}
    for (let i = 0; i < 64; i++) map[A.charAt(i)] = i
    const s = String(b64).replace(/[^A-Za-z0-9+/]/g, '')
    const out = new Array(Math.floor((s.length * 3) / 4))
    let o = 0
    for (let i = 0; i < s.length; i += 4) {
      const n =
        (map[s.charAt(i)] << 18) |
        (map[s.charAt(i + 1)] << 12) |
        ((map[s.charAt(i + 2)] || 0) << 6) |
        (map[s.charAt(i + 3)] || 0)
      out[o++] = (n >> 16) & 255
      if (i + 2 < s.length) out[o++] = (n >> 8) & 255
      if (i + 3 < s.length) out[o++] = n & 255
    }
    out.length = o
    return out
  }

  let senders = []
  try {
    senders = $app.findRecordsByFilter(
      'fin_receipt_senders',
      'church_id = {:c} && is_active = true',
      '',
      500,
      0,
      { c: churchId },
    )
  } catch (_) {}
  if (senders.length === 0) {
    note('Mensagem recebida, mas nenhum celular está cadastrado para mandar comprovantes.')
    return e.json(200, { ok: true })
  }

  const data = body.data
  const items = Array.isArray(data)
    ? data
    : data && Array.isArray(data.messages)
      ? data.messages
      : data
        ? [data]
        : []
  const MIMES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  }

  for (const d of items) {
    try {
      const key = (d && d.key) || {}
      if (key.fromMe === true) {
        note('Mensagem enviada pelo próprio WhatsApp da igreja: ignorada.')
        continue
      }
      const remote = String(key.remoteJid || '')
      if (/@g\.us$|@broadcast$|@newsletter$/.test(remote)) continue
      // Contato com "LID" (número escondido): a Evolution manda o número em outro campo
      let phone = ''
      for (const j of [key.remoteJidAlt, key.senderPn, key.participantAlt, remote, d.sender]) {
        const s = String(j || '')
        if (/@s\.whatsapp\.net$/.test(s)) {
          phone = s.split('@')[0].split(':')[0].replace(/\D/g, '')
          break
        }
      }
      if (!phone) {
        note('Mensagem de um contato sem número visível (' + remote.split('@')[1] + '): ignorada.')
        continue
      }
      const sender = senders.find((s) => phoneKey(s.getString('phone')) === phoneKey(phone))
      if (!sender) {
        note('Mensagem do número terminado em ' + mask(phone) + ', que não está cadastrado.')
        continue
      }
      const name = sender.getString('name')

      let msg = d.message || {}
      for (let i = 0; i < 3; i++) {
        const inner =
          (msg.ephemeralMessage && msg.ephemeralMessage.message) ||
          (msg.viewOnceMessage && msg.viewOnceMessage.message) ||
          (msg.viewOnceMessageV2 && msg.viewOnceMessageV2.message) ||
          (msg.documentWithCaptionMessage && msg.documentWithCaptionMessage.message)
        if (!inner) break
        msg = Object.assign({ base64: msg.base64 }, inner)
      }
      const media = msg.imageMessage || msg.documentMessage
      if (!media) {
        const text = String(
          msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || '',
        )
        note('Texto (sem comprovante) de ' + name + '.')
        if (text) {
          // Ajuda no máximo uma vez a cada 6 horas para a mesma pessoa
          const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString().replace('T', ' ')
          let recent = 0
          try {
            recent = $app.countRecords(
              'whatsapp_messages',
              $dbx.exp(
                "church_id = {:c} AND kind = 'COMPROVANTE' AND ref_id = 'ajuda' AND phone = {:p} AND created >= {:s}",
                { c: churchId, p: phone, s: since },
              ),
            )
          } catch (_) {}
          if (!recent) {
            reply(
              phone,
              name,
              'Olá! Para registrar um pagamento da igreja, mande aqui a *foto* ou o *PDF* do comprovante (PIX, boleto ou débito). Eu leio e ligo ao extrato do banco.',
              'ajuda',
            )
          }
        }
        continue
      }
      const mime = String(media.mimetype || '')
        .split(';')[0]
        .trim()
        .toLowerCase()
      if (!MIMES[mime]) {
        note('Arquivo de ' + name + ' em formato que não dá para ler (' + mime + ').')
        reply(
          phone,
          name,
          'Não consigo ler esse tipo de arquivo. Mande o comprovante como foto ou PDF, por favor.',
          'formato',
        )
        continue
      }
      const msgId = String(key.id || '')
      if (msgId) {
        try {
          $app.findFirstRecordByFilter('fin_receipts', 'church_id = {:c} && wa_message_id = {:m}', {
            c: churchId,
            m: msgId,
          })
          continue // a Evolution mandou a mesma mensagem de novo
        } catch (_) {}
      }

      let b64 = String(msg.base64 || d.base64 || (d.message && d.message.base64) || '')
      if (!b64 && apiUrl && apiKey) {
        const res = $http.send({
          url: apiUrl + '/chat/getBase64FromMediaMessage/' + encodeURIComponent(inst),
          method: 'POST',
          headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { key: key }, convertToMp4: false }),
          timeout: 30,
        })
        if (res.statusCode < 300 && res.json) b64 = String(res.json.base64 || '')
      }
      b64 = b64.replace(/^data:[^,]*,/, '')
      if (!b64) {
        note('Comprovante de ' + name + ' chegou sem o arquivo e não deu para baixar.')
        reply(
          phone,
          name,
          'Não consegui baixar o comprovante. Pode mandar de novo, por favor?',
          'baixar',
        )
        continue
      }
      const bytes = decode(b64)
      if (bytes.length > 10485760) {
        reply(phone, name, 'O arquivo passou de 10 MB. Mande uma foto ou um PDF menor.', 'grande')
        continue
      }

      const save = (withFile) => {
        const rec = new Record($app.findCollectionByNameOrId('fin_receipts'))
        rec.set('church_id', churchId)
        rec.set('sender_phone', phone)
        rec.set('sender_name', name)
        rec.set('wa_message_id', msgId)
        rec.set('caption', String(media.caption || '').slice(0, 1000))
        rec.set('mime', mime)
        rec.set('media_b64', b64)
        if (withFile) {
          rec.set('file', $filesystem.fileFromBytes(bytes, 'comprovante.' + MIMES[mime]))
        }
        rec.set('status', 'RECEBIDO')
        rec.set('attempts', 0)
        rec.set('next_try', new Date().toISOString().replace('T', ' '))
        $app.save(rec)
      }
      try {
        save(true)
      } catch (err) {
        // Arquivo que o servidor não reconhece como imagem ou PDF: guarda só para a IA ler
        console.log('comprovantes: arquivo recusado, guardando sem anexo: ' + err)
        save(false)
      }
      note('Comprovante de ' + name + ' recebido.')
    } catch (err) {
      console.log('comprovantes: mensagem não foi guardada: ' + err)
      note('Erro ao guardar a mensagem: ' + String(err).slice(0, 200))
    }
  }
  return e.json(200, { ok: true })
})

// Leitura pela IA, busca no extrato e conciliação
cronAdd('finance_receipts', '* * * * *', () => {
  const now = Date.now()
  const pbNow = (ms) => new Date(ms).toISOString().replace('T', ' ')
  const MAX_WAIT_DAYS = 7
  const NO_CATEGORY = 'Escolha a categoria.'

  // Comprovante preso em "lendo" (servidor reiniciou no meio): volta para a fila
  try {
    const stuck = $app.findRecordsByFilter(
      'fin_receipts',
      "status = 'LENDO' && updated <= {:t}",
      '',
      20,
      0,
      { t: pbNow(now - 10 * 60 * 1000) },
    )
    for (const r of stuck) {
      r.set('status', 'RECEBIDO')
      $app.save(r)
    }
  } catch (_) {}

  let due = []
  try {
    due = $app.findRecordsByFilter(
      'fin_receipts',
      "(status = 'RECEBIDO' || status = 'AGUARDANDO' || status = 'CONFIRMANDO') && next_try <= {:n}",
      'next_try',
      5,
      0,
      { n: pbNow(now) },
    )
  } catch (_) {
    return
  }
  if (due.length === 0) return

  const ymd = (s) => String(s || '').slice(0, 10)
  const addDays = (day, n) => {
    const d = new Date(day + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const dayDiff = (a, b) =>
    Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000)
  const brl = (cents) => {
    const v = Math.abs(cents)
    const int = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return 'R$ ' + int + ',' + String(v % 100).padStart(2, '0')
  }
  const dm = (day) => (day ? day.slice(8, 10) + '/' + day.slice(5, 7) : '')
  const plain = (s) => {
    let t = String(s || '').toUpperCase()
    try {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    } catch (_) {}
    return t
  }
  const digits = (s) => String(s || '').replace(/\D/g, '')
  const readJson = (rec, field, def) => {
    try {
      const v = JSON.parse(rec.getString(field) || 'null')
      return v === null || v === undefined ? def : v
    } catch (_) {
      return def
    }
  }
  const decode = (b64) => {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const map = {}
    for (let i = 0; i < 64; i++) map[A.charAt(i)] = i
    const s = String(b64).replace(/[^A-Za-z0-9+/]/g, '')
    const out = new Array(Math.floor((s.length * 3) / 4))
    let o = 0
    for (let i = 0; i < s.length; i += 4) {
      const n =
        (map[s.charAt(i)] << 18) |
        (map[s.charAt(i + 1)] << 12) |
        ((map[s.charAt(i + 2)] || 0) << 6) |
        (map[s.charAt(i + 3)] || 0)
      out[o++] = (n >> 16) & 255
      if (i + 2 < s.length) out[o++] = (n >> 8) & 255
      if (i + 3 < s.length) out[o++] = n & 255
    }
    out.length = o
    return out
  }
  const EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  }
  const METHOD_LABEL = {
    PIX: 'PIX',
    BOLETO: 'boleto',
    CARTAO: 'débito',
    TRANSFERENCIA: 'transferência',
    OUTRO: '',
  }

  const notify = (rec) => {
    const status = rec.getString('status')
    if (['CONCILIADO', 'ANALISE', 'AGUARDANDO', 'DESCARTADO'].indexOf(status) === -1) return
    if (rec.getString('notified') === status || !rec.getString('sender_phone')) return
    const d = readJson(rec, 'data', {}) || {}
    const what =
      'o comprovante' +
      (d.amount_cents > 0 ? ' de *' + brl(d.amount_cents) + '*' : '') +
      (d.payee_name ? ' para ' + d.payee_name : '') +
      (d.date ? ' (' + dm(d.date) + ')' : '')
    let text = ''
    if (status === 'CONCILIADO') {
      text =
        '✅ Registrei ' +
        what +
        '. Já está ligado ao extrato do banco e lançado no financeiro. Obrigado!'
    } else if (status === 'AGUARDANDO') {
      text =
        '🕐 Recebi ' +
        what +
        '. O pagamento ainda não apareceu no extrato do banco; confiro de novo nas próximas horas.'
    } else if (status === 'ANALISE') {
      text = '👀 Recebi ' + what + '. A tesouraria vai conferir antes de lançar.'
    } else {
      text =
        'Não encontrei um comprovante de pagamento nessa imagem. Se for um comprovante, mande uma foto mais nítida ou o PDF, por favor.'
    }
    try {
      const msg = new Record($app.findCollectionByNameOrId('whatsapp_messages'))
      msg.set('church_id', rec.getString('church_id'))
      msg.set('kind', 'COMPROVANTE')
      msg.set('phone', rec.getString('sender_phone'))
      msg.set('name', rec.getString('sender_name'))
      msg.set('text', text)
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('ref_id', rec.id)
      msg.set('send_after', new Date().toISOString())
      $app.save(msg)
    } catch (_) {}
    rec.set('notified', status)
  }

  const finish = (rec, status, reason, extra) => {
    rec.set('status', status)
    rec.set('reason', String(reason || '').slice(0, 300))
    if (extra) for (const k in extra) rec.set(k, extra[k])
    if (status === 'CONCILIADO' || status === 'DESCARTADO') rec.set('media_b64', '')
    notify(rec)
    $app.save(rec)
  }

  const categoriesOf = (churchId) => {
    try {
      const rows = $app.findRecordsByFilter(
        'fin_categories',
        "church_id = {:c} && direction = 'SAIDA' && is_active = true",
        'name',
        300,
        0,
        { c: churchId },
      )
      const byId = {}
      for (const r of rows) byId[r.id] = r
      return rows.map((r) => {
        const parent = byId[r.getString('parent_id')]
        return {
          id: r.id,
          name: (parent ? parent.getString('name') + ' › ' : '') + r.getString('name'),
        }
      })
    } catch (_) {
      return []
    }
  }

  const readWithAi = (rec) => {
    const key = String($os.getenv('ANTHROPIC_API_KEY') || '').trim()
    if (!key) {
      const err = new Error('Falta configurar a IA no servidor (segredo ANTHROPIC_API_KEY).')
      err.noRetry = true
      throw err
    }
    const model = String($os.getenv('LOUVORFLOW_AI_MODEL') || '').trim() || 'claude-opus-5-5'
    const url =
      String($os.getenv('LOUVORFLOW_AI_URL') || '').trim() ||
      'https://api.anthropic.com/v1/messages'
    const mime = rec.getString('mime')
    const b64 = rec.getString('media_b64')
    if (!b64) {
      const err = new Error('O arquivo do comprovante não está mais guardado.')
      err.noRetry = true
      throw err
    }
    const cats = categoriesOf(rec.getString('church_id'))
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'is_receipt',
        'amount_cents',
        'date',
        'method',
        'payee_name',
        'payee_document',
        'payer_name',
        'transaction_code',
        'description',
        'category_id',
        'notes',
      ],
      properties: {
        is_receipt: { type: 'boolean' },
        amount_cents: { type: 'integer' },
        date: { type: 'string' },
        method: { type: 'string', enum: ['PIX', 'BOLETO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO'] },
        payee_name: { type: 'string' },
        payee_document: { type: 'string' },
        payer_name: { type: 'string' },
        transaction_code: { type: 'string' },
        description: { type: 'string' },
        category_id: { type: 'string' },
        notes: { type: 'string' },
      },
    }
    const system =
      'Você lê comprovantes de pagamento brasileiros (PIX, boleto, compra no cartão de débito, TED) ' +
      'que a tesouraria de uma igreja recebe pelo WhatsApp. Copie os dados como aparecem no comprovante e não invente nada: ' +
      'o que não estiver legível fica vazio (ou 0 no valor).\n' +
      '- amount_cents: valor pago em centavos (R$ 1.234,56 = 123456).\n' +
      '- date: data em que o pagamento foi feito, AAAA-MM-DD (não a data de vencimento).\n' +
      '- method: PIX, BOLETO, CARTAO (débito ou crédito), TRANSFERENCIA (TED/DOC) ou OUTRO.\n' +
      '- payee_name e payee_document: quem recebeu (favorecido, beneficiário, estabelecimento) e o CPF/CNPJ dele, se aparecer.\n' +
      '- payer_name: quem pagou.\n' +
      '- transaction_code: identificador da transação (ID/E2E do PIX, autenticação, NSU, código de barras do boleto).\n' +
      '- description: em poucas palavras, o que foi pago (ex.: "Conta de luz outubro", "Compra no Atacadão").\n' +
      '- category_id: o id da categoria de saída da lista que melhor descreve o pagamento; vazio se não der para saber.\n' +
      '- notes: o que estiver duvidoso ou ilegível.\n' +
      '- is_receipt: false se a imagem não for um comprovante de pagamento.'
    const text =
      'Categorias de saída da igreja (id: nome):\n' +
      (cats.length ? cats.map((c) => c.id + ': ' + c.name).join('\n') : '(nenhuma)') +
      (rec.getString('caption')
        ? '\n\nLegenda que a pessoa mandou: ' + rec.getString('caption')
        : '')
    const media =
      mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: mime, data: b64 } }
        : { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }
    const payload = {
      model: model,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
      system: system,
      messages: [{ role: 'user', content: [media, { type: 'text', text: text }] }],
    }
    const headers = {
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      'Content-Type': 'application/json',
    }
    if (model === 'claude-opus-5-5') {
      // Se o modelo recusar, a própria API tenta outro
      payload.fallbacks = 'default'
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'
    }
    const res = $http.send({
      url: url,
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      timeout: 120,
    })
    const json = res.json || {}
    if (res.statusCode !== 200) {
      const m = (json.error && json.error.message) || ''
      const err = new Error('A IA respondeu ' + res.statusCode + (m ? ': ' + m : ''))
      err.noRetry = res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 403
      throw err
    }
    if (json.stop_reason === 'refusal') throw new Error('A IA não quis ler este arquivo.')
    const block = (json.content || []).find((b) => b.type === 'text')
    if (!block) throw new Error('A IA não devolveu a leitura.')
    const out = JSON.parse(block.text)
    out.amount_cents = Math.abs(parseInt(out.amount_cents, 10) || 0)
    out.date = /^\d{4}-\d{2}-\d{2}$/.test(String(out.date || '')) ? out.date : ''
    if (!cats.some((c) => c.id === out.category_id)) out.category_id = ''
    return out
  }

  // Movimentos de saída pendentes com o mesmo valor, perto da data, que nenhum outro
  // comprovante já pegou
  const findCandidates = (rec, d) => {
    const churchId = rec.getString('church_id')
    let rows = []
    try {
      rows = $app.findRecordsByFilter(
        'fin_bank_lines',
        "church_id = {:c} && status = 'PENDENTE' && amount_cents = {:a} && date >= {:f} && date <= {:t}",
        'date',
        50,
        0,
        {
          c: churchId,
          a: -d.amount_cents,
          f: addDays(d.date, -3) + ' 00:00:00.000Z',
          t: addDays(d.date, 5) + ' 23:59:59.999Z',
        },
      )
    } catch (_) {}
    const out = []
    for (const l of rows) {
      let taken = false
      try {
        const others = $app.findRecordsByFilter(
          'fin_receipts',
          "line_id = {:l} && id != {:id} && (status = 'CONCILIADO' || status = 'CONFIRMANDO')",
          '',
          1,
          0,
          { l: l.id, id: rec.id },
        )
        taken = others.length > 0
      } catch (_) {}
      if (taken) continue
      const desc = plain(l.getString('description') + ' ' + l.getString('fitid'))
      let score = 0
      const diff = Math.abs(dayDiff(ymd(l.getString('date')), d.date))
      score += diff === 0 ? 3 : diff === 1 ? 2 : diff <= 3 ? 1 : 0
      const code = plain(d.transaction_code).replace(/\s+/g, '')
      if (code.length >= 8 && desc.replace(/\s+/g, '').indexOf(code) !== -1) score += 10
      const doc = digits(d.payee_document)
      if (doc.length >= 11 && digits(desc).indexOf(doc) !== -1) score += 5
      let words = 0
      for (const w of plain(d.payee_name).split(/[^A-Z0-9]+/)) {
        if (w.length >= 4 && desc.indexOf(w) !== -1 && words < 3) words++
      }
      score += words
      const kw = {
        PIX: /PIX/,
        BOLETO: /BOLETO|PAGTO|PAGAMENTO|TITULO|COBRANCA/,
        CARTAO: /CARTAO|DEBITO|COMPRA|CARD/,
        TRANSFERENCIA: /TED|DOC|TRANSF/,
      }[d.method]
      if (kw && kw.test(desc)) score += 1
      out.push({ line: l, score: score })
    }
    out.sort((a, b) => b.score - a.score)
    return out
  }

  const ownerOf = (churchId) => {
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        "church_id = {:c} && role = 'MASTER' && is_active = true",
        'created',
        1,
        0,
        { c: churchId },
      )
      return rows.length ? rows[0].getString('user_id') : ''
    } catch (_) {
      return ''
    }
  }

  // Abre (ou quita) a conta a pagar, cria o lançamento com o comprovante e concilia a linha
  const reconcile = (rec, lineId, categoryId) => {
    const churchId = rec.getString('church_id')
    const d = readJson(rec, 'data', {}) || {}
    const b64 = rec.getString('media_b64')
    const ext = EXT[rec.getString('mime')] || 'jpg'
    const file = () => (b64 ? $filesystem.fileFromBytes(decode(b64), 'comprovante.' + ext) : null)
    const userId = rec.getString('chosen_by') || ownerOf(churchId)
    if (!userId) throw new Error('A igreja não tem um MASTER ativo para assinar o lançamento.')
    const who = rec.getString('done_by_name') || 'Comprovante pelo WhatsApp'
    const methods = {
      PIX: 'PIX',
      BOLETO: 'BOLETO',
      CARTAO: 'CARTAO',
      TRANSFERENCIA: 'TRANSFERENCIA',
    }
    const method = methods[d.method] || 'OUTRO'
    const result = {}
    $app.runInTransaction((txApp) => {
      const line = txApp.findRecordById('fin_bank_lines', lineId)
      if (line.getString('church_id') !== churchId) throw new Error('Movimento de outra igreja.')
      if (line.getString('status') !== 'PENDENTE') {
        throw new Error('O movimento já foi conciliado ou ignorado.')
      }
      const amount = line.getInt('amount_cents')
      if (amount >= 0) throw new Error('O movimento não é uma saída.')
      const abs = -amount
      const day = ymd(line.getString('date'))
      const pbDate = day + ' 12:00:00.000Z'
      const accountId = line.getString('account_id')

      // Conta a pagar em aberto de mesmo valor perto da data: dá baixa nela
      let bill = null
      const open = txApp.findRecordsByFilter(
        'fin_bills',
        "church_id = {:c} && kind = 'PAGAR' && status = 'ABERTO' && amount_cents = {:a} && due_date >= {:f} && due_date <= {:t}",
        'due_date',
        5,
        0,
        {
          c: churchId,
          a: abs,
          f: addDays(day, -15) + ' 00:00:00.000Z',
          t: addDays(day, 15) + ' 23:59:59.999Z',
        },
      )
      if (open.length === 1) bill = open[0]

      let supplierId = bill ? bill.getString('supplier_id') : ''
      const doc = digits(d.payee_document)
      if (!supplierId && (doc.length === 11 || doc.length === 14)) {
        const sups = txApp.findRecordsByFilter(
          'fin_suppliers',
          "church_id = {:c} && document != ''",
          '',
          2000,
          0,
          { c: churchId },
        )
        const found = sups.find((s) => digits(s.getString('document')) === doc)
        if (found) supplierId = found.id
        else if (d.payee_name) {
          const sup = new Record(txApp.findCollectionByNameOrId('fin_suppliers'))
          sup.set('church_id', churchId)
          sup.set('name', String(d.payee_name).slice(0, 160))
          sup.set('document', doc)
          sup.set('is_active', true)
          txApp.save(sup)
          supplierId = sup.id
        }
      }

      const category = (bill && bill.getString('category_id')) || categoryId
      if (!category) throw new Error(NO_CATEGORY)
      const description = String(
        (bill && bill.getString('description')) ||
          d.description ||
          (d.payee_name ? 'Pagamento a ' + d.payee_name : '') ||
          line.getString('description'),
      ).slice(0, 200)
      const notes = (
        'Comprovante mandado por ' +
        (rec.getString('sender_name') || rec.getString('sender_phone')) +
        ' pelo WhatsApp' +
        (d.transaction_code ? '. Código: ' + d.transaction_code : '') +
        '.'
      ).slice(0, 1000)

      if (!bill) {
        bill = new Record(txApp.findCollectionByNameOrId('fin_bills'))
        bill.set('church_id', churchId)
        bill.set('kind', 'PAGAR')
        bill.set('description', description)
        bill.set('amount_cents', abs)
        bill.set('due_date', pbDate)
        bill.set('issue_date', pbDate)
        bill.set('category_id', category)
        bill.set('supplier_id', supplierId)
        bill.set('account_id', accountId)
        bill.set('document_type', 'RECIBO')
        bill.set('document_number', String(d.transaction_code || '').slice(0, 60))
        bill.set('notes', notes)
        bill.set('status', 'ABERTO')
        const f = file()
        if (f) bill.set('attachment', f)
        txApp.save(bill)
      } else if (!bill.getString('attachment')) {
        const f = file()
        if (f) bill.set('attachment', f)
      }

      const tx = new Record(txApp.findCollectionByNameOrId('fin_transactions'))
      tx.set('church_id', churchId)
      tx.set('type', 'SAIDA')
      tx.set('date', pbDate)
      tx.set('amount_cents', abs)
      tx.set('description', description)
      tx.set('account_id', accountId)
      tx.set('category_id', category)
      tx.set('cost_center_id', bill.getString('cost_center_id'))
      tx.set('campaign_id', bill.getString('campaign_id'))
      tx.set('supplier_id', supplierId)
      tx.set('payment_method', method)
      tx.set('bill_id', bill.id)
      tx.set('notes', notes)
      tx.set('status', 'CONFIRMADO')
      tx.set('created_by', userId)
      const f = file()
      if (f) tx.set('attachment', f)
      txApp.save(tx)
      tx.set('bank_line_id', line.id)
      txApp.save(tx)

      bill.set('status', 'PAGO')
      bill.set('paid_at', pbDate)
      bill.set('paid_amount_cents', abs)
      bill.set('paid_account_id', accountId)
      bill.set('transaction_id', tx.id)
      txApp.save(bill)

      line.set('status', 'CONCILIADO')
      line.set('transaction_id', tx.id)
      line.set('reconciled_at', pbNow(Date.now()))
      line.set('reconciled_by_name', who.slice(0, 160))
      txApp.save(line)

      result.line_id = line.id
      result.transaction_id = tx.id
      result.bill_id = bill.id
    })
    return result
  }

  const match = (rec) => {
    const d = readJson(rec, 'data', {}) || {}
    const cands = findCandidates(rec, d)
    if (cands.length === 0) {
      const age = (now - Date.parse(rec.getString('created').replace(' ', 'T'))) / 86400000
      if (age >= MAX_WAIT_DAYS) {
        return finish(rec, 'ANALISE', 'O pagamento não apareceu no extrato em 7 dias.', {
          candidates: [],
        })
      }
      return finish(rec, 'AGUARDANDO', 'Esperando o pagamento aparecer no extrato do banco.', {
        next_try: pbNow(now + 60 * 60 * 1000),
        candidates: [],
      })
    }
    const top = cands[0]
    const ties = cands.filter((c) => c.score === top.score)
    if (ties.length > 1) {
      return finish(
        rec,
        'ANALISE',
        'Há ' + ties.length + ' movimentos iguais no extrato. Escolha qual é este pagamento.',
        { candidates: cands.slice(0, 10).map((c) => c.line.id) },
      )
    }
    try {
      // Sem categoria da IA só concilia se houver conta a pagar em aberto (que já tem categoria)
      const r = reconcile(rec, top.line.id, d.category_id)
      finish(rec, 'CONCILIADO', '', r)
    } catch (err) {
      const msg = String(err.message || err)
      finish(
        rec,
        'ANALISE',
        msg === NO_CATEGORY
          ? 'Achei o movimento no extrato. Falta escolher a categoria.'
          : 'Não deu para conciliar sozinho: ' + msg,
        { candidates: [top.line.id], line_id: top.line.id },
      )
    }
  }

  // Marca todos como "lendo" antes de começar: a próxima rodada do cron não pega os mesmos
  const jobs = []
  for (const rec of due) {
    jobs.push({ rec: rec, status: rec.getString('status') })
    rec.set('status', 'LENDO')
    try {
      $app.save(rec)
    } catch (_) {}
  }

  for (const job of jobs) {
    const rec = job.rec
    const status = job.status
    try {
      if (status === 'CONFIRMANDO') {
        try {
          const r = reconcile(rec, rec.getString('line_id'), rec.getString('chosen_category_id'))
          finish(rec, 'CONCILIADO', '', r)
        } catch (err) {
          finish(rec, 'ANALISE', 'Não deu para conciliar: ' + String(err.message || err))
        }
        continue
      }
      if (status === 'AGUARDANDO') {
        match(rec)
        continue
      }
      let d = null
      try {
        d = readWithAi(rec)
      } catch (err) {
        const attempts = rec.getInt('attempts') + 1
        rec.set('attempts', attempts)
        const msg = String(err.message || err)
        if (err.noRetry || attempts >= 3) {
          finish(rec, 'ANALISE', 'Não consegui ler o comprovante. ' + msg)
        } else {
          rec.set('status', 'RECEBIDO')
          rec.set('reason', msg.slice(0, 300))
          rec.set('next_try', pbNow(now + attempts * 5 * 60 * 1000))
          $app.save(rec)
        }
        continue
      }
      rec.set('data', d)
      if (!d.is_receipt) {
        finish(rec, 'DESCARTADO', 'A IA não achou um comprovante de pagamento no arquivo.')
        continue
      }
      if (!d.amount_cents || !d.date) {
        finish(rec, 'ANALISE', 'A IA não achou o valor ou a data do pagamento.')
        continue
      }
      match(rec)
    } catch (err) {
      console.log('comprovantes: erro no comprovante ' + rec.id + ': ' + err)
      try {
        const fresh = $app.findRecordById('fin_receipts', rec.id)
        fresh.set('status', 'ANALISE')
        fresh.set('reason', ('Erro ao processar: ' + String(err.message || err)).slice(0, 300))
        $app.save(fresh)
      } catch (_) {}
    }
  }
})

// Tela de Comprovantes
routerAdd(
  'POST',
  '/backend/v1/finance/receipts',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    const action = String(body.action || 'list')
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })

    let member = null
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        '',
        1,
        0,
        { c: churchId, u: auth.id },
      )
      member = rows.length ? rows[0] : null
    } catch (_) {}
    let perms = []
    try {
      perms = JSON.parse((member && member.getString('permissions')) || '[]') || []
    } catch (_) {}
    const isMaster = !!member && member.getString('role') === 'MASTER'
    const canView = isMaster || perms.indexOf('financeiro.conciliacao.ver') !== -1
    const canEdit = isMaster || perms.indexOf('financeiro.conciliacao.alterar') !== -1
    if (!member || !canView) {
      return e.json(403, { message: 'Só quem cuida do financeiro vê os comprovantes.' })
    }
    const READ_ONLY = ['status', 'list', 'senders']
    if (READ_ONLY.indexOf(action) === -1 && !canEdit) {
      return e.json(403, { message: 'Você só pode ver os comprovantes.' })
    }
    const userName = auth.getString('name') || auth.getString('email')
    const pbNow = () => new Date().toISOString().replace('T', ' ')
    const readJson = (rec, field, def) => {
      try {
        const v = JSON.parse(rec.getString(field) || 'null')
        return v === null || v === undefined ? def : v
      } catch (_) {
        return def
      }
    }
    const normalizePhone = (p) => {
      let d = String(p || '').replace(/\D/g, '')
      while (d.indexOf('0') === 0) d = d.slice(1)
      if (d.length === 10 || d.length === 11) d = '55' + d
      return d.length >= 12 && d.length <= 13 ? d : ''
    }
    const findReceipt = (id) => {
      try {
        const r = $app.findRecordById('fin_receipts', String(id || ''))
        return r.getString('church_id') === churchId ? r : null
      } catch (_) {
        return null
      }
    }

    if (action === 'status') {
      const apiUrl = String($os.getenv('WHATSAPP_API_URL') || '')
        .replace(/\s+/g, '')
        .replace(/\/+$/, '')
      const apiKey = String($os.getenv('WHATSAPP_API_KEY') || '').trim()
      let whatsapp = 'SEM_SERVIDOR'
      let webhookError = ''
      let inboundBase = ''
      let lastAt = ''
      let lastNote = ''
      if (apiUrl && apiKey) {
        whatsapp = 'DESCONECTADO'
        try {
          const st = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
            c: churchId,
          })
          // Estado real na Evolution: o salvo pode estar velho (o celular desconectou)
          let state = st.getString('status')
          if (st.getString('instance')) {
            try {
              const r = $http.send({
                url:
                  apiUrl +
                  '/instance/connectionState/' +
                  encodeURIComponent(st.getString('instance')),
                method: 'GET',
                headers: { apikey: apiKey },
                timeout: 10,
              })
              if (r.statusCode === 404) state = 'close'
              else if (r.json && r.json.instance && r.json.instance.state) {
                state = String(r.json.instance.state)
              } else if (r.json && r.json.state) state = String(r.json.state)
              if (state && state !== st.getString('status')) {
                st.set('status', state)
                $app.save(st)
              }
            } catch (_) {}
          }
          if (state === 'open') whatsapp = 'CONECTADO'
          lastAt = st.getString('inbound_last_at')
          lastNote = st.getString('inbound_last_note')
          if (!st.getString('inbound_token')) {
            st.set('inbound_token', $security.randomString(48))
            $app.save(st)
          }
          const path = '/backend/v1/whatsapp/inbound/' + st.getString('inbound_token')
          // Endereço público deste servidor, nesta ordem: o segredo WHATSAPP_MEDIA_BASE_URL, o
          // endereço pelo qual a tela chegou aqui e o endereço do servidor que a tela usa. Fora
          // o segredo, só vale o que for conferido (chamada a este mesmo servidor por ele).
          const clean = (u) =>
            String(u || '')
              .replace(/\s+/g, '')
              .replace(/\/+$/, '')
          const env = clean($os.getenv('WHATSAPP_MEDIA_BASE_URL'))
          const host = String(e.request.header.get('X-Forwarded-Host') || e.request.host || '')
            .split(',')[0]
            .trim()
          let proto = String(e.request.header.get('X-Forwarded-Proto') || '')
            .split(',')[0]
            .trim()
          if (!proto) proto = /^(localhost|127\.)/.test(host) ? 'http' : 'https'
          const candidates = []
          if (host) candidates.push(proto + '://' + host)
          const fromScreen = clean(body.base)
          if (canEdit && /^https?:\/\/[^\s?#]+$/.test(fromScreen)) candidates.push(fromScreen)
          const reaches = (b) => {
            try {
              const r = $http.send({ url: b + path, method: 'GET', timeout: 10 })
              return r.statusCode === 200 && !!r.json && r.json.ok === true
            } catch (_) {
              return false
            }
          }
          let base = env
          const current = st.getString('inbound_url')
          if (!base && current && candidates.indexOf(current.slice(0, -path.length)) !== -1) {
            base = current.slice(0, -path.length) // já conferido antes
          }
          if (!base) {
            for (const c of candidates) {
              if (/^https:/.test(c) && reaches(c)) {
                base = c
                break
              }
            }
          }
          if (!base) {
            webhookError =
              'não achei o endereço público do servidor; cadastre no Skip o segredo WHATSAPP_MEDIA_BASE_URL com o endereço do servidor'
          }
          inboundBase = base
          const url = base + path
          // A conexão pode ter sido apagada e criada de novo (novo QR Code): confere na
          // Evolution se o aviso continua ligado com este endereço
          let webhookOk = st.getString('inbound_url') === url
          if (webhookOk && base && st.getString('instance')) {
            try {
              const f = $http.send({
                url: apiUrl + '/webhook/find/' + encodeURIComponent(st.getString('instance')),
                method: 'GET',
                headers: { apikey: apiKey },
                timeout: 10,
              })
              const w = f.json && f.json.webhook ? f.json.webhook : f.json
              if (f.statusCode < 300) webhookOk = !!w && w.enabled === true && w.url === url
            } catch (_) {}
          }
          if (base && st.getString('instance') && !webhookOk) {
            const res = $http.send({
              url: apiUrl + '/webhook/set/' + encodeURIComponent(st.getString('instance')),
              method: 'POST',
              headers: { apikey: apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                webhook: {
                  enabled: true,
                  url: url,
                  byEvents: false,
                  base64: true,
                  events: ['MESSAGES_UPSERT'],
                },
              }),
              timeout: 20,
            })
            if (res.statusCode < 300) {
              st.set('inbound_url', url)
              $app.save(st)
            } else {
              webhookError =
                'O servidor do WhatsApp respondeu ' +
                res.statusCode +
                ' ' +
                String(res.raw || '').slice(0, 150)
            }
          }
        } catch (err) {
          webhookError = String(err).slice(0, 200)
        }
      }
      const counts = {}
      for (const s of ['RECEBIDO', 'LENDO', 'AGUARDANDO', 'ANALISE', 'CONFIRMANDO']) {
        try {
          counts[s] = $app.countRecords(
            'fin_receipts',
            $dbx.exp('church_id = {:c} AND status = {:s}', { c: churchId, s: s }),
          )
        } catch (_) {
          counts[s] = 0
        }
      }
      return e.json(200, {
        ai: !!String($os.getenv('ANTHROPIC_API_KEY') || '').trim(),
        whatsapp: whatsapp,
        webhook_error: webhookError,
        inbound_base: inboundBase,
        inbound_last_at: lastAt,
        inbound_last_note: lastNote,
        counts: counts,
        can_edit: canEdit,
      })
    }

    if (action === 'senders') {
      const rows = $app.findRecordsByFilter(
        'fin_receipt_senders',
        'church_id = {:c}',
        'name',
        500,
        0,
        { c: churchId },
      )
      return e.json(200, {
        items: rows.map((r) => ({
          id: r.id,
          name: r.getString('name'),
          phone: r.getString('phone'),
          is_active: r.getBool('is_active'),
        })),
      })
    }

    if (action === 'sender_save') {
      const name = String(body.name || '')
        .trim()
        .slice(0, 160)
      const phone = normalizePhone(body.phone)
      if (!name) return e.json(400, { message: 'Informe o nome.' })
      if (!phone) return e.json(400, { message: 'Informe um celular com DDD.' })
      let rec = null
      if (body.id) {
        try {
          rec = $app.findRecordById('fin_receipt_senders', String(body.id))
        } catch (_) {}
        if (!rec || rec.getString('church_id') !== churchId) {
          return e.json(404, { message: 'Número não encontrado.' })
        }
      } else {
        rec = new Record($app.findCollectionByNameOrId('fin_receipt_senders'))
        rec.set('church_id', churchId)
      }
      rec.set('name', name)
      rec.set('phone', phone)
      rec.set('is_active', body.is_active !== false)
      try {
        $app.save(rec)
      } catch (_) {
        return e.json(400, { message: 'Este celular já está cadastrado.' })
      }
      return e.json(200, { id: rec.id })
    }

    if (action === 'sender_delete') {
      try {
        const rec = $app.findRecordById('fin_receipt_senders', String(body.id || ''))
        if (rec.getString('church_id') === churchId) $app.delete(rec)
      } catch (_) {}
      return e.json(200, { success: true })
    }

    if (action === 'list') {
      const filters = {
        conferir: "(status = 'ANALISE')",
        andamento:
          "(status = 'RECEBIDO' || status = 'LENDO' || status = 'AGUARDANDO' || status = 'CONFIRMANDO')",
        concluidos: "(status = 'CONCILIADO' || status = 'DESCARTADO')",
      }
      const which = String(body.filter || '')
      const page = Math.max(1, parseInt(body.page, 10) || 1)
      const perPage = 30
      const rows = $app.findRecordsByFilter(
        'fin_receipts',
        'church_id = {:c}' + (filters[which] ? ' && ' + filters[which] : ''),
        '-created',
        perPage + 1,
        (page - 1) * perPage,
        { c: churchId },
      )
      const lineInfo = {}
      const accountName = {}
      const describe = (id) => {
        if (!id) return null
        if (lineInfo[id] !== undefined) return lineInfo[id]
        let out = null
        try {
          const l = $app.findRecordById('fin_bank_lines', id)
          const acc = l.getString('account_id')
          if (accountName[acc] === undefined) {
            try {
              accountName[acc] = $app.findRecordById('fin_accounts', acc).getString('name')
            } catch (_) {
              accountName[acc] = ''
            }
          }
          out = {
            id: l.id,
            date: l.getString('date').slice(0, 10),
            description: l.getString('description'),
            amount_cents: l.getInt('amount_cents'),
            status: l.getString('status'),
            account_name: accountName[acc],
          }
        } catch (_) {}
        lineInfo[id] = out
        return out
      }
      const items = []
      for (let i = 0; i < Math.min(rows.length, perPage); i++) {
        const r = rows[i]
        const cands = readJson(r, 'candidates', []) || []
        items.push({
          id: r.id,
          created: r.getString('created'),
          sender_name: r.getString('sender_name'),
          sender_phone: r.getString('sender_phone'),
          caption: r.getString('caption'),
          mime: r.getString('mime'),
          has_file: !!r.getString('file'),
          status: r.getString('status'),
          reason: r.getString('reason'),
          data: readJson(r, 'data', null),
          line: describe(r.getString('line_id')),
          candidates: cands.map(describe).filter((x) => !!x),
          transaction_id: r.getString('transaction_id'),
          bill_id: r.getString('bill_id'),
          done_by_name: r.getString('done_by_name'),
          can_retry: !!r.getString('media_b64'),
        })
      }
      return e.json(200, { items: items, has_more: rows.length > perPage })
    }

    const rec = findReceipt(body.id)
    if (!rec) return e.json(404, { message: 'Comprovante não encontrado.' })
    const status = rec.getString('status')

    if (action === 'choose') {
      if (['ANALISE', 'AGUARDANDO'].indexOf(status) === -1) {
        return e.json(400, { message: 'Este comprovante não está esperando conferência.' })
      }
      let line = null
      try {
        line = $app.findRecordById('fin_bank_lines', String(body.line_id || ''))
      } catch (_) {}
      if (!line || line.getString('church_id') !== churchId) {
        return e.json(400, { message: 'Escolha o movimento do extrato.' })
      }
      if (line.getString('status') !== 'PENDENTE' || line.getInt('amount_cents') >= 0) {
        return e.json(400, { message: 'O movimento precisa ser uma saída ainda não conciliada.' })
      }
      let cat = null
      try {
        cat = $app.findRecordById('fin_categories', String(body.category_id || ''))
      } catch (_) {}
      if (
        !cat ||
        cat.getString('church_id') !== churchId ||
        cat.getString('direction') !== 'SAIDA'
      ) {
        return e.json(400, { message: 'Escolha a categoria de saída.' })
      }
      rec.set('line_id', line.id)
      rec.set('chosen_category_id', cat.id)
      rec.set('chosen_by', auth.id)
      rec.set('done_by_name', userName)
      rec.set('status', 'CONFIRMANDO')
      rec.set('reason', '')
      rec.set('next_try', pbNow())
      $app.save(rec)
      return e.json(200, { status: 'CONFIRMANDO' })
    }

    if (action === 'discard') {
      if (status === 'CONCILIADO') {
        return e.json(400, { message: 'Comprovante já conciliado: desfaça pela conciliação.' })
      }
      rec.set('status', 'DESCARTADO')
      rec.set('notified', 'DESCARTADO')
      rec.set('reason', 'Descartado por ' + userName)
      rec.set('done_by_name', userName)
      rec.set('media_b64', '')
      $app.save(rec)
      return e.json(200, { status: 'DESCARTADO' })
    }

    if (action === 'retry') {
      if (['ANALISE', 'AGUARDANDO'].indexOf(status) === -1 || !rec.getString('media_b64')) {
        return e.json(400, { message: 'Este comprovante não pode ser lido de novo.' })
      }
      rec.set('status', 'RECEBIDO')
      rec.set('attempts', 0)
      rec.set('reason', '')
      rec.set('notified', '')
      rec.set('next_try', pbNow())
      $app.save(rec)
      return e.json(200, { status: 'RECEBIDO' })
    }

    return e.json(400, { message: 'Ação desconhecida' })
  },
  $apis.requireAuth(),
)

// Arquivo do comprovante (a tela busca com o token de login no cabeçalho)
routerAdd(
  'GET',
  '/backend/v1/finance/receipts/{id}/file',
  (e) => {
    const auth = e.auth
    let rec = null
    try {
      rec = $app.findRecordById('fin_receipts', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { message: 'Comprovante não encontrado.' })
    }
    let ok = false
    try {
      const rows = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        '',
        1,
        0,
        { c: rec.getString('church_id'), u: auth.id },
      )
      if (rows.length) {
        const perms = JSON.parse(rows[0].getString('permissions') || '[]') || []
        ok =
          rows[0].getString('role') === 'MASTER' ||
          perms.indexOf('financeiro.conciliacao.ver') !== -1
      }
    } catch (_) {}
    if (!ok || !rec.getString('file'))
      return e.json(404, { message: 'Comprovante não encontrado.' })
    const fsys = $app.newFilesystem()
    try {
      const reader = fsys.getReader(rec.baseFilesPath() + '/' + rec.getString('file'))
      try {
        e.response.header().set('Cache-Control', 'private, max-age=3600')
        return e.blob(200, rec.getString('mime') || 'application/octet-stream', toBytes(reader))
      } finally {
        reader.close()
      }
    } finally {
      fsys.close()
    }
  },
  $apis.requireAuth(),
)
