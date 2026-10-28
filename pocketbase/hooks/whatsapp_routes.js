// WhatsApp conectado por QR Code: tela de Configurações > WhatsApp.
// POST /backend/v1/whatsapp { church_id, action, ... }
//
// Ações (só MASTER da igreja):
// - status: configuração, estado da conexão (lido na Evolution) e resumo da fila
// - connect: cria a conexão na Evolution se preciso e devolve o QR Code (imagem base64)
// - disconnect: desconecta o celular (logout na Evolution)
// - save: { auto } liga/desliga os envios automáticos
// - test: { phone, text? } põe uma mensagem de teste na fila
// - list: { page?, status? } histórico de mensagens
// - retry / cancel: { id } volta uma mensagem com erro para a fila / cancela uma da fila
//
// Tudo numa rota só porque o PocketBase roda cada handler isolado: os helpers ficam aqui
// dentro e não precisam ser repetidos. O endereço e a chave da Evolution vêm dos segredos
// WHATSAPP_API_URL e WHATSAPP_API_KEY; sem eles a tela mostra "servidor não configurado".

routerAdd(
  'POST',
  '/backend/v1/whatsapp',
  (e) => {
    const AUTO_KINDS = [
      'ESCALA',
      'LEMBRETE_ESCALA',
      'INSCRICAO',
      'PAGAMENTO',
      'ANIVERSARIO',
      'CASAMENTO',
    ]

    const auth = e.auth
    if (!auth) return e.json(401, { message: 'Não autorizado' })
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    const action = String(body.action || 'status')
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })

    try {
      const m = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        '',
        1,
        0,
        { c: churchId, u: auth.id },
      )
      if (m.length === 0 || m[0].getString('role') !== 'MASTER') {
        return e.json(403, {
          message: 'Só o MASTER da igreja configura o WhatsApp.',
        })
      }
    } catch (_) {
      return e.json(403, { message: 'Permissão insuficiente' })
    }

    const apiUrl = String($os.getenv('WHATSAPP_API_URL') || '')
      .replace(/\s+/g, '') // espaços colados pelo celular quebram a URL
      .replace(/\/+$/, '')
    const apiKey = String($os.getenv('WHATSAPP_API_KEY') || '').trim()
    const configured = !!(apiUrl && apiKey)

    const evo = (method, path, payload) => {
      const res = $http.send({
        url: apiUrl + path,
        method: method,
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : '',
        timeout: 20,
      })
      let json = null
      try {
        json = res.json
      } catch (_) {}
      return { code: res.statusCode, json: json }
    }

    const loadSettings = () => {
      try {
        return $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
          c: churchId,
        })
      } catch (_) {
        try {
          const col = $app.findCollectionByNameOrId('whatsapp_settings')
          const rec = new Record(col)
          rec.set('church_id', churchId)
          rec.set('instance', 'lf-' + churchId)
          rec.set('auto', {})
          rec.set('status', 'close')
          $app.save(rec)
          return rec
        } catch (saveErr) {
          // Se outro processo acabou de criar (corrida com índice único), busca novamente
          return $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
            c: churchId,
          })
        }
      }
    }

    const readAuto = (rec) => {
      let raw = {}
      try {
        raw = JSON.parse(rec.getString('auto') || '{}') || {}
      } catch (_) {}
      const out = {}
      for (const k of AUTO_KINDS) out[k] = raw[k] === true
      return out
    }

    // Pergunta à Evolution como está a conexão e guarda na configuração
    const refreshState = (rec) => {
      if (!configured) return 'unconfigured'
      const inst = rec.getString('instance')
      let state = 'close'
      try {
        const r = evo('GET', '/instance/connectionState/' + encodeURIComponent(inst))
        if (r.code === 404) state = 'close'
        else if (r.json && r.json.instance && r.json.instance.state) state = r.json.instance.state
        else if (r.json && r.json.state) state = r.json.state
        if (state === 'open') {
          const f = evo('GET', '/instance/fetchInstances?instanceName=' + encodeURIComponent(inst))
          const row = Array.isArray(f.json) ? f.json[0] : null
          const info = row && row.instance ? row.instance : row
          if (info) {
            const jid = String(info.ownerJid || info.owner || '')
            rec.set('phone', jid.split('@')[0])
            rec.set('profile_name', String(info.profileName || ''))
          }
        }
        rec.set('last_error', '')
      } catch (err) {
        state = 'error'
        rec.set('last_error', 'Servidor do WhatsApp não respondeu: ' + String(err).slice(0, 300))
      }
      rec.set('status', state)
      try {
        $app.save(rec)
      } catch (_) {}
      return state
    }

    const queueSummary = () => {
      const count = (status) => {
        try {
          return $app.countRecords(
            'whatsapp_messages',
            $dbx.exp('church_id = {:c} AND status = {:s}', {
              c: churchId,
              s: status,
            }),
          )
        } catch (_) {
          return 0
        }
      }
      return { fila: count('FILA'), erro: count('ERRO') }
    }

    const normalizePhone = (p) => {
      let d = String(p || '').replace(/\D/g, '')
      while (d.indexOf('0') === 0) d = d.slice(1)
      if (d.length === 10 || d.length === 11) d = '55' + d
      return d.length >= 12 && d.length <= 13 ? d : ''
    }

    const rec = loadSettings()

    if (action === 'status') {
      const state = refreshState(rec)
      return e.json(200, {
        configured: configured,
        state: state,
        phone: rec.getString('phone'),
        profile_name: rec.getString('profile_name'),
        last_error: rec.getString('last_error'),
        auto: readAuto(rec),
        queue: queueSummary(),
      })
    }

    if (action === 'save') {
      const incoming = body.auto || {}
      const auto = {}
      for (const k of AUTO_KINDS) auto[k] = incoming[k] === true
      rec.set('auto', auto)
      try {
        $app.save(rec)
      } catch (err) {
        // Se houve conflito ou erro de gravação, recarrega o registro existente e tenta salvar novamente
        const fresh = $app.findFirstRecordByFilter('whatsapp_settings', 'church_id = {:c}', {
          c: churchId,
        })
        fresh.set('auto', auto)
        $app.save(fresh)
      }
      return e.json(200, { auto: auto })
    }

    if (action === 'test') {
      const phone = normalizePhone(body.phone)
      if (!phone) return e.json(400, { message: 'Informe um celular com DDD.' })
      const text =
        String(body.text || '')
          .trim()
          .slice(0, 1000) ||
        'Mensagem de teste do LouvorFlow. Se chegou, o WhatsApp da igreja está conectado. 🙌'
      const col = $app.findCollectionByNameOrId('whatsapp_messages')
      const msg = new Record(col)
      msg.set('church_id', churchId)
      msg.set('kind', 'TESTE')
      msg.set('phone', phone)
      msg.set('name', auth.getString('name'))
      msg.set('text', text)
      msg.set('status', 'FILA')
      msg.set('attempts', 0)
      msg.set('send_after', new Date().toISOString())
      $app.save(msg)
      return e.json(200, { id: msg.id })
    }

    if (action === 'list') {
      const page = Math.max(1, parseInt(body.page, 10) || 1)
      const status = String(body.status || '')
      const perPage = 50
      let filter = 'church_id = {:c}'
      if (['FILA', 'ENVIADO', 'ERRO', 'CANCELADO'].indexOf(status) !== -1)
        filter += ' && status = {:s}'
      const rows = $app.findRecordsByFilter(
        'whatsapp_messages',
        filter,
        '-created',
        perPage + 1,
        (page - 1) * perPage,
        { c: churchId, s: status },
      )
      const items = []
      for (let i = 0; i < Math.min(rows.length, perPage); i++) {
        const r = rows[i]
        items.push({
          id: r.id,
          kind: r.getString('kind'),
          phone: r.getString('phone'),
          name: r.getString('name'),
          text: r.getString('text'),
          status: r.getString('status'),
          error: r.getString('error'),
          attempts: r.getInt('attempts'),
          send_after: r.getString('send_after'),
          sent_at: r.getString('sent_at'),
          created: r.getString('created'),
        })
      }
      return e.json(200, {
        items: items,
        has_more: rows.length > perPage,
        queue: queueSummary(),
      })
    }

    if (action === 'retry' || action === 'cancel') {
      let msg = null
      try {
        msg = $app.findRecordById('whatsapp_messages', String(body.id || ''))
      } catch (_) {}
      if (!msg || msg.getString('church_id') !== churchId) {
        return e.json(404, { message: 'Mensagem não encontrada' })
      }
      const st = msg.getString('status')
      if (action === 'retry') {
        if (st !== 'ERRO' && st !== 'CANCELADO')
          return e.json(400, { message: 'Esta mensagem não está com erro.' })
        msg.set('status', 'FILA')
        msg.set('attempts', 0)
        msg.set('error', '')
        msg.set('send_after', new Date().toISOString())
      } else {
        if (st !== 'FILA')
          return e.json(400, {
            message: 'Só dá para cancelar o que está na fila.',
          })
        msg.set('status', 'CANCELADO')
      }
      $app.save(msg)
      return e.json(200, { id: msg.id, status: msg.getString('status') })
    }

    if (!configured) {
      return e.json(400, {
        message:
          'O servidor do WhatsApp ainda não foi configurado (WHATSAPP_API_URL e WHATSAPP_API_KEY).',
      })
    }
    const inst = rec.getString('instance')

    if (action === 'connect') {
      // Resposta da Evolution em poucas palavras, para a tela dizer o motivo
      const why = (r) => {
        let m = ''
        try {
          const resp = r.json && r.json.response ? r.json.response.message : ''
          m = Array.isArray(resp) ? resp.join(' ') : String(resp || (r.json && r.json.error) || '')
        } catch (_) {}
        return ' (código ' + r.code + (m ? ': ' + m.slice(0, 200) : '') + ')'
      }
      try {
        const state = refreshState(rec)
        if (state === 'open') return e.json(200, { state: 'open', phone: rec.getString('phone') })
        let r = evo('GET', '/instance/connect/' + encodeURIComponent(inst))
        if (r.code === 404) {
          r = evo('POST', '/instance/create', {
            instanceName: inst,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
          })
          if (r.code >= 300) {
            return e.json(502, {
              message: 'Não foi possível criar a conexão no servidor do WhatsApp' + why(r) + '.',
            })
          }
          const created = r.json && r.json.qrcode ? r.json.qrcode : null
          if (!created || !created.base64)
            r = evo('GET', '/instance/connect/' + encodeURIComponent(inst))
          else r = { code: 200, json: created }
        }
        const qr = r.json && r.json.base64 ? String(r.json.base64) : ''
        if (!qr) {
          return e.json(502, {
            message: 'O servidor do WhatsApp não devolveu o QR Code' + why(r) + '. Tente de novo.',
          })
        }
        rec.set('status', 'connecting')
        $app.save(rec)
        return e.json(200, {
          state: 'connecting',
          qr: qr.indexOf('data:') === 0 ? qr : 'data:image/png;base64,' + qr,
        })
      } catch (err) {
        return e.json(502, {
          message: 'Servidor do WhatsApp não respondeu: ' + String(err).slice(0, 200),
        })
      }
    }

    if (action === 'disconnect') {
      try {
        evo('DELETE', '/instance/logout/' + encodeURIComponent(inst))
      } catch (_) {}
      rec.set('status', 'close')
      rec.set('phone', '')
      rec.set('profile_name', '')
      $app.save(rec)
      return e.json(200, { state: 'close' })
    }

    return e.json(400, { message: 'Ação desconhecida' })
  },
  $apis.requireAuth(),
)
