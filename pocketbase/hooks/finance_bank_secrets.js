// Credenciais das APIs da Cora e do Bradesco, cadastradas pela tela de Integrações
//
// GET  /backend/v1/finance/bank-secrets?church_id=...
//      Resumo do que está cadastrado (nunca o segredo): client ID mascarado, se tem segredo,
//      impressão digital do certificado, quem alterou e quando. Também diz se o servidor tem a
//      chave de cifragem (LOUVORFLOW_CREDENTIALS_KEY) e se a chave do conector já foi gerada.
//      MASTER, quem vê as integrações ou quem tem alguma permissão do financeiro.
// POST /backend/v1/finance/bank-secrets   (só MASTER)
//      { church_id, action: 'save', kind: 'CORA'|'BRADESCO', environment: 'PRODUCAO'|'TESTE',
//        credential_key?, client_id?, client_secret?, cert?, key? }
//        Campo em branco mantém o valor já salvo; na primeira vez todos são obrigatórios.
//      { church_id, action: 'delete', id }
//      { church_id, action: 'new_key' }  gera a chave do conector e devolve UMA vez (o
//        servidor guarda só o hash). A anterior deixa de valer.
//      { church_id, action: 'github', github_repo, github_token? }  acesso ao GitHub para o
//        botão "Atualizar agora" disparar o conector na hora. { github_repo: '' } remove.
//      Toda ação pede a senha do MASTER de novo (password); 5 senhas erradas em 15 minutos
//      bloqueiam as mudanças da igreja. Cada mudança vai para o registro de segurança
//      (fin_bank_audit) e é avisada por e-mail a todos os MASTERs da igreja.
//
// Tudo é cifrado com LOUVORFLOW_CREDENTIALS_KEY (32 caracteres). Sem ela, nada é salvo:
// chave privada de banco não fica em texto puro no banco de dados.
// (Funções declaradas dentro do handler: o runtime do PocketBase executa cada handler isolado.)

routerAdd(
  'GET',
  '/backend/v1/finance/bank-secrets',
  (e) => {
    const churchId = e.request.url.query().get('church_id') || ''
    if (!churchId) return e.json(400, { message: 'church_id é obrigatório' })
    let member = null
    try {
      member = $app.findFirstRecordByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        { c: churchId, u: e.auth.id },
      )
    } catch (_) {}
    let perms = []
    try {
      perms = JSON.parse((member && member.getString('permissions')) || '[]') || []
    } catch (_) {}
    const canSee =
      member &&
      (member.getString('role') === 'MASTER' ||
        perms.indexOf('admin.integracoes.ver') !== -1 ||
        perms.some((k) => String(k).indexOf('financeiro.') === 0))
    if (!canSee)
      return e.json(403, {
        message: 'Sem acesso às integrações desta igreja.',
      })

    const rows = $app.findRecordsByFilter(
      'fin_bank_secrets',
      'church_id = {:c}',
      'created',
      100,
      0,
      {
        c: churchId,
      },
    )
    const sets = []
    let connector = {
      has_key: false,
      has_github_token: false,
      github_repo: '',
    }
    for (const r of rows) {
      let summary = {}
      try {
        summary = JSON.parse(r.getString('summary') || '{}') || {}
      } catch (_) {}
      if (r.getString('kind') === 'CONECTOR') {
        connector = {
          has_key: !!r.getString('token_hash'),
          key_prefix: summary.key_prefix || '',
          key_created_at: summary.key_created_at || '',
          github_repo: summary.github_repo || '',
          has_github_token: !!summary.has_github_token,
          updated_by_name: r.getString('updated_by_name'),
        }
        continue
      }
      sets.push({
        id: r.id,
        kind: r.getString('kind'),
        environment: r.getString('environment'),
        credential_key: r.getString('credential_key'),
        summary: summary,
        updated: r.getString('updated'),
        updated_by_name: r.getString('updated_by_name'),
      })
    }
    let encKey = ''
    let envToken = ''
    let envGithub = false
    try {
      encKey = $os.getenv('LOUVORFLOW_CREDENTIALS_KEY') || ''
      envToken = $os.getenv('BANK_SYNC_TOKEN') || ''
      envGithub = !!($os.getenv('BANK_SYNC_GITHUB_TOKEN') && $os.getenv('BANK_SYNC_GITHUB_REPO'))
    } catch (_) {}
    // Registro de segurança: mudanças, entregas ao conector e senhas erradas
    const audit = $app
      .findRecordsByFilter('fin_bank_audit', 'church_id = {:c}', '-created', 30, 0, {
        c: churchId,
      })
      .map((r) => ({
        id: r.id,
        event: r.getString('event'),
        detail: r.getString('detail'),
        ip: r.getString('ip'),
        user_name: r.getString('user_name'),
        created: r.getString('created'),
      }))
    return e.json(200, {
      audit: audit,
      encryption_ready: encKey.length === 32,
      server_token: envToken.length >= 32,
      server_github: envGithub,
      sets: sets,
      connector: connector,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/finance/bank-secrets',
  (e) => {
    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '')
    const action = String(body.action || '')
    let member = null
    try {
      member = $app.findFirstRecordByFilter(
        'church_members',
        'church_id = {:c} && user_id = {:u} && is_active = true',
        { c: churchId, u: e.auth.id },
      )
    } catch (_) {}
    // Certificado e chave do banco abrem a conta da igreja: só o MASTER mexe
    if (!member || member.getString('role') !== 'MASTER') {
      return e.json(403, {
        message: 'Só o MASTER cadastra as credenciais dos bancos.',
      })
    }

    const userName = e.auth.getString('name') || e.auth.getString('email')
    const ip = e.realIP()
    const audit = (event, detail) => {
      try {
        const r = new Record($app.findCollectionByNameOrId('fin_bank_audit'))
        r.set('church_id', churchId)
        r.set('event', event)
        r.set('detail', String(detail || '').slice(0, 300))
        r.set('ip', ip)
        r.set('user_name', userName)
        $app.save(r)
      } catch (err) {
        $app.logger().warn('bank audit failed', 'error', String(err))
      }
    }
    // Aviso por e-mail a cada MASTER da igreja (o e-mail falhar não desfaz a mudança)
    const notify = (what) => {
      try {
        const settings = $app.settings()
        if (!settings.meta.senderAddress) return
        const esc = (v) =>
          String(v || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
        let churchName = ''
        try {
          churchName = $app.findRecordById('churches', churchId).getString('name')
        } catch (_) {}
        const brt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
        const when =
          brt.slice(8, 10) + '/' + brt.slice(5, 7) + '/' + brt.slice(0, 4) + ' ' + brt.slice(11, 16)
        const masters = $app.findRecordsByFilter(
          'church_members',
          "church_id = {:c} && role = 'MASTER' && is_active = true",
          '',
          50,
          0,
          { c: churchId },
        )
        for (const m of masters) {
          let address = ''
          try {
            address = $app.findRecordById('users', m.getString('user_id')).getString('email')
          } catch (_) {}
          if (!address) continue
          $app.newMailClient().send(
            new MailerMessage({
              from: {
                address: settings.meta.senderAddress,
                name: settings.meta.senderName || 'LouvorFlow',
              },
              to: [{ address: address }],
              subject: 'LouvorFlow: ' + what,
              html:
                '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b">' +
                '<p><b>' +
                esc(what) +
                '</b></p><p>Igreja: ' +
                esc(churchName) +
                '<br>Quem: ' +
                esc(userName) +
                '<br>Quando: ' +
                when +
                ' (horário de Brasília)<br>IP: ' +
                esc(ip) +
                '</p><p>Se não foi você ou alguém da liderança, entre no LouvorFlow, apague as ' +
                'credenciais em Configurações › Integrações, gere uma chave nova do conector e ' +
                'peça ao banco um certificado novo.</p></div>',
            }),
          )
        }
      } catch (err) {
        $app.logger().warn('bank secrets alert email failed', 'error', String(err))
      }
    }

    // Confirma a senha de novo: sessão aberta num computador esquecido não basta
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ')
    const wrong = $app.findRecordsByFilter(
      'fin_bank_audit',
      "church_id = {:c} && event = 'SENHA_ERRADA' && created >= {:s}",
      '',
      5,
      0,
      { c: churchId, s: since },
    )
    if (wrong.length >= 5) {
      return e.json(429, {
        message: 'Muitas tentativas com senha errada. Espere 15 minutos para tentar de novo.',
      })
    }
    const password = String(body.password || '')
    if (!password || !e.auth.validatePassword(password)) {
      const tried = {
        save: 'ao salvar credencial',
        delete: 'ao apagar credencial',
        new_key: 'ao gerar chave do conector',
        github: 'ao mudar o acesso ao GitHub',
      }
      audit('SENHA_ERRADA', tried[action] || action)
      return e.json(400, {
        message: 'Senha incorreta. Confirme a sua senha do LouvorFlow para mexer nas credenciais.',
      })
    }

    let encKey = ''
    try {
      encKey = $os.getenv('LOUVORFLOW_CREDENTIALS_KEY') || ''
    } catch (_) {}
    const encReady = encKey.length === 32
    const seal = (obj) => ({
      enc: 'v1',
      data: $security.encrypt(JSON.stringify(obj), encKey),
    })
    const open = (rec) => {
      try {
        const d = JSON.parse(rec.getString('data') || 'null')
        if (d && d.enc === 'v1' && typeof d.data === 'string') {
          return JSON.parse($security.decrypt(d.data, encKey)) || {}
        }
      } catch (_) {}
      return {}
    }
    const nowIso = new Date().toISOString().replace('T', ' ')
    const mask = (s) => {
      const v = String(s || '')
      if (!v) return ''
      return v.length > 8 ? v.slice(0, 4) + '••••' + v.slice(-4) : '••••'
    }
    const findOne = (filter, params) => {
      try {
        return $app.findFirstRecordByFilter('fin_bank_secrets', filter, params)
      } catch (_) {
        return null
      }
    }
    const connectorRecord = () => {
      let rec = findOne("church_id = {:c} && kind = 'CONECTOR'", {
        c: churchId,
      })
      if (!rec) {
        rec = new Record($app.findCollectionByNameOrId('fin_bank_secrets'))
        rec.set('church_id', churchId)
        rec.set('kind', 'CONECTOR')
      }
      return rec
    }
    const summaryOf = (rec) => {
      try {
        return JSON.parse(rec.getString('summary') || '{}') || {}
      } catch (_) {
        return {}
      }
    }

    if (action === 'delete') {
      const rec = findOne('id = {:id} && church_id = {:c}', {
        id: String(body.id || ''),
        c: churchId,
      })
      if (!rec || rec.getString('kind') === 'CONECTOR') {
        return e.json(404, { message: 'Credencial não encontrada.' })
      }
      $app.delete(rec)
      const bankName = rec.getString('kind') === 'CORA' ? 'Cora' : 'Bradesco'
      audit('CREDENCIAL_APAGADA', bankName + ' · ' + rec.getString('environment'))
      notify('credenciais do ' + bankName + ' apagadas')
      return e.json(200, { success: true })
    }

    if (action === 'new_key') {
      // A chave em si não é segredo de banco, mas é ela que libera as credenciais ao conector:
      // o servidor guarda só o hash e mostra a chave uma única vez
      const token = 'lfbs_' + $security.randomString(48)
      const rec = connectorRecord()
      const summary = summaryOf(rec)
      summary.key_prefix = token.slice(0, 9)
      summary.key_created_at = nowIso
      rec.set('token_hash', $security.sha256(token))
      rec.set('summary', summary)
      rec.set('updated_by_name', userName)
      $app.save(rec)
      audit('CHAVE_NOVA', 'Chave ' + summary.key_prefix + '…')
      notify('nova chave do conector bancário gerada')
      return e.json(200, { token: token, key_prefix: summary.key_prefix })
    }

    if (action === 'github') {
      const repo = String(body.github_repo || '').trim()
      const ghToken = String(body.github_token || '').trim()
      if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        return e.json(400, { message: 'Repositório no formato dono/nome.' })
      }
      if (ghToken.length > 300) return e.json(400, { message: 'Token do GitHub inválido.' })
      const rec = connectorRecord()
      const summary = summaryOf(rec)
      const current = open(rec)
      if (!repo) {
        rec.set('data', null)
        summary.github_repo = ''
        summary.has_github_token = false
      } else {
        if (!encReady) {
          return e.json(503, {
            message:
              'O servidor ainda não tem a chave de cifragem (LOUVORFLOW_CREDENTIALS_KEY). Peça para configurá-la antes de salvar credenciais.',
          })
        }
        const token = ghToken || current.github_token || ''
        if (!token) return e.json(400, { message: 'Informe o token do GitHub.' })
        rec.set('data', seal({ github_repo: repo, github_token: token }))
        summary.github_repo = repo
        summary.has_github_token = true
      }
      rec.set('summary', summary)
      rec.set('updated_by_name', userName)
      $app.save(rec)
      audit('GITHUB', repo ? 'Repositório ' + repo : 'Acesso removido')
      notify(
        repo ? 'acesso ao GitHub do conector alterado' : 'acesso ao GitHub do conector removido',
      )
      return e.json(200, { success: true })
    }

    if (action !== 'save') return e.json(400, { message: 'Ação desconhecida' })
    if (!encReady) {
      return e.json(503, {
        message:
          'O servidor ainda não tem a chave de cifragem (LOUVORFLOW_CREDENTIALS_KEY). Peça para configurá-la antes de salvar credenciais.',
      })
    }
    const kind = String(body.kind || '')
    const environment = String(body.environment || '')
    const credKey = String(body.credential_key || '')
      .trim()
      .toUpperCase()
    if (['CORA', 'BRADESCO'].indexOf(kind) === -1)
      return e.json(400, { message: 'Banco inválido.' })
    if (['PRODUCAO', 'TESTE'].indexOf(environment) === -1) {
      return e.json(400, { message: 'Ambiente inválido.' })
    }
    if (!/^[A-Z0-9_]{0,30}$/.test(credKey)) {
      return e.json(400, {
        message: 'Nome do conjunto: só letras, números e _ (até 30).',
      })
    }

    const clean = (v, max) =>
      String(v || '')
        .trim()
        .slice(0, max + 1)
    const input = {
      client_id: clean(body.client_id, 200),
      client_secret: clean(body.client_secret, 500),
      cert: clean(body.cert, 20000).replace(/\r\n/g, '\n'),
      key: clean(body.key, 20000).replace(/\r\n/g, '\n'),
    }
    if (input.client_id.length > 200 || input.client_secret.length > 500) {
      return e.json(400, { message: 'Client ID ou segredo grande demais.' })
    }
    if (input.cert.length > 20000 || input.key.length > 20000) {
      return e.json(400, { message: 'Certificado ou chave grande demais.' })
    }
    if (input.cert && input.cert.indexOf('-----BEGIN CERTIFICATE-----') === -1) {
      return e.json(400, {
        message:
          'O certificado precisa estar no formato PEM (texto começando com -----BEGIN CERTIFICATE-----).',
      })
    }
    if (input.key) {
      if (
        input.key.indexOf('ENCRYPTED PRIVATE KEY') !== -1 ||
        input.key.indexOf('Proc-Type: 4,ENCRYPTED') !== -1
      ) {
        return e.json(400, {
          message:
            'A chave privada está protegida por senha. Envie a chave sem senha (arquivo .key ou .pem).',
        })
      }
      if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(input.key)) {
        return e.json(400, {
          message:
            'A chave privada precisa estar no formato PEM (texto começando com -----BEGIN PRIVATE KEY-----).',
        })
      }
    }

    // Parâmetro vazio no filtro não casa com texto vazio: sem nome, compara com '' direto
    let rec = findOne(
      'church_id = {:c} && kind = {:k} && environment = {:env} && credential_key = ' +
        (credKey ? '{:ck}' : "''"),
      { c: churchId, k: kind, env: environment, ck: credKey },
    )
    const current = rec ? open(rec) : {}
    const merged = {
      client_id: input.client_id || current.client_id || '',
      client_secret: input.client_secret || current.client_secret || '',
      cert: input.cert || current.cert || '',
      key: input.key || current.key || '',
    }
    const missing = []
    if (!merged.client_id) missing.push('Client ID')
    if (kind === 'BRADESCO' && !merged.client_secret) missing.push('Client secret')
    if (!merged.cert) missing.push('certificado')
    if (!merged.key) missing.push('chave privada')
    if (missing.length) return e.json(400, { message: 'Falta: ' + missing.join(', ') + '.' })

    if (!rec) {
      rec = new Record($app.findCollectionByNameOrId('fin_bank_secrets'))
      rec.set('church_id', churchId)
      rec.set('kind', kind)
      rec.set('environment', environment)
      rec.set('credential_key', credKey)
    }
    const certBody = merged.cert.replace(/-----[A-Z ]+-----|\s/g, '')
    rec.set('data', seal(merged))
    rec.set('summary', {
      client_id: mask(merged.client_id),
      has_secret: !!merged.client_secret,
      has_cert: true,
      has_key: true,
      // Primeiros caracteres do SHA-256 do certificado, para conferir qual está salvo
      cert_fingerprint: $security.sha256(certBody).slice(0, 16).toUpperCase(),
    })
    rec.set('updated_by_name', userName)
    $app.save(rec)
    const bankName = kind === 'CORA' ? 'Cora' : 'Bradesco'
    audit(
      'CREDENCIAL_SALVA',
      bankName +
        ' · ' +
        environment +
        (credKey ? ' · ' + credKey : '') +
        ' · client ID ' +
        mask(merged.client_id),
    )
    notify('credenciais do ' + bankName + ' cadastradas ou alteradas')
    return e.json(200, { success: true, id: rec.id })
  },
  $apis.requireAuth(),
)
