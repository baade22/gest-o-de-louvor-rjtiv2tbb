// Mídia: baixar vídeo ou áudio do YouTube pelo link (migração 0094).
//
// Ordem combinada com o Pedro (2026-11-08):
//  1. O servidor da VPS (deploy/whatsapp/youtube) baixa e o LouvorFlow guarda o arquivo na
//     mídia do culto, como se alguém tivesse enviado o arquivo.
//  2. Se a VPS falhar (YouTube bloqueou, arquivo maior que 100 MB, servidor fora do ar...),
//     o pedido vai para o computador do Holyrics (comando YOUTUBE_DOWNLOAD), que baixa
//     direto na pasta de mídias assim que estiver conectado.
//
// Endereço da VPS: YOUTUBE_API_URL, ou WHATSAPP_API_URL (mesmo servidor, rota /youtube).
// Chave: YOUTUBE_API_KEY, ou WHATSAPP_API_KEY.
//
// POST /backend/v1/saas/media/youtube
//   { church_id, event_id, url, format: VIDEO|AUDIO, category, name?, assigned_operator? }
// Cron youtube_vps_poll (a cada minuto): confere os pedidos na VPS.

routerAdd(
  'POST',
  '/backend/v1/saas/media/youtube',
  (e) => {
    const auth = e.auth
    if (!auth) return e.json(401, { success: false, message: 'Não autorizado.' })

    const body = e.requestInfo().body || {}
    const churchId = String(body.church_id || '').trim()
    const eventId = String(body.event_id || '').trim()
    const format = String(body.format || 'VIDEO').toUpperCase() === 'AUDIO' ? 'AUDIO' : 'VIDEO'
    const CATEGORIES = [
      'AGENDA',
      'ANIVERSARIANTES',
      'AVISOS',
      'CULTOS',
      'EVENTOS',
      'VIDEO_ESPECIAL',
      'OUTROS',
    ]
    let category = String(body.category || '').toUpperCase()
    if (CATEGORIES.indexOf(category) === -1) category = 'VIDEO_ESPECIAL'

    // 1. Link do YouTube -> id do vídeo (11 caracteres). Só vídeo, nada de playlist/canal.
    const videoId = (() => {
      let text = String(body.url || '').trim()
      if (!text) return ''
      if (!/^https?:\/\//i.test(text)) text = 'https://' + text
      const m = text.match(/^https?:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i)
      if (!m) return ''
      const host = m[1].toLowerCase().replace(/:\d+$/, '')
      const pathPart = m[2] || ''
      const query = m[3] || ''
      let id = ''
      if (host === 'youtu.be') {
        id = pathPart.split('/')[1] || ''
      } else if (
        ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].indexOf(host) !==
        -1
      ) {
        if (pathPart === '/watch') {
          const v = query.match(/[?&]v=([^&]+)/)
          id = v ? v[1] : ''
        } else {
          const s = pathPart.match(/^\/(?:shorts|live|embed|v)\/([^/]+)/)
          id = s ? s[1] : ''
        }
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : ''
    })()
    if (!videoId) {
      return e.json(400, {
        success: false,
        error_code: 'INVALID_YOUTUBE_URL',
        message: 'Cole o link de um vídeo do YouTube (youtube.com/watch?v=... ou youtu.be/...).',
      })
    }
    const sourceUrl = 'https://www.youtube.com/watch?v=' + videoId

    if (!churchId || !eventId) {
      return e.json(400, { success: false, message: 'Escolha o culto.' })
    }

    // 2. Permissão: MASTER ou quem pode incluir mídia (igual à regra de media_assets)
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
      if (rows.length > 0) member = rows[0]
    } catch (_) {}
    if (!member) {
      return e.json(403, {
        success: false,
        message: 'Você não faz parte desta congregação.',
      })
    }
    let keys = []
    try {
      keys = JSON.parse(member.getString('permissions') || '[]') || []
    } catch (_) {}
    const allowed =
      member.getString('role') === 'MASTER' ||
      keys.indexOf('culto.midias.novo') !== -1 ||
      keys.indexOf('culto.midias.alterar') !== -1
    if (!allowed) {
      return e.json(403, {
        success: false,
        error_code: 'FORBIDDEN',
        message: 'Você não tem permissão para incluir mídia.',
      })
    }

    let event = null
    try {
      event = $app.findRecordById('events', eventId)
    } catch (_) {}
    if (!event || event.getString('church_id') !== churchId) {
      return e.json(404, { success: false, message: 'Culto não encontrado.' })
    }

    // 3. Título: o que a pessoa digitou, ou o do YouTube (oEmbed, rápido e sem chave)
    let title = String(body.name || '')
      .trim()
      .slice(0, 200)
    let autoName = false
    if (!title) {
      autoName = true
      try {
        const res = $http.send({
          url: 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(sourceUrl),
          method: 'GET',
          timeout: 8,
        })
        if (res.statusCode === 200 && res.json && res.json.title) {
          title = String(res.json.title).trim().slice(0, 200)
          autoName = false
        }
      } catch (_) {}
      if (!title) title = 'YouTube ' + videoId
    }

    // 4. Nome físico no Holyrics: Evento - Categoria - DD-MM - Título.ext
    const ext = format === 'AUDIO' ? 'mp3' : 'mp4'
    const clean = (s) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[.\s\-_]+|[.\s\-_]+$/g, '')
        .trim()
    const CAT_LABEL = {
      AVISOS: 'Avisos',
      ANIVERSARIANTES: 'Aniversariantes',
      AGENDA: 'Agenda',
      CULTOS: 'Cultos',
      EVENTOS: 'Eventos',
      VIDEO_ESPECIAL: 'Video Especial',
      OUTROS: 'Outros',
    }
    const dm = (event.getString('date') || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    const baseName = [
      clean(event.getString('title')) || 'Evento',
      CAT_LABEL[category] || 'Outros',
      dm ? dm[3] + '-' + dm[2] : 'Sem Data',
      (clean(title) || 'Midia').slice(0, 120),
    ]
      .join(' - ')
      .replace(/\s+/g, ' ')
      .trim()

    // 5. Cria a mídia (sem arquivo ainda)
    const col = $app.findCollectionByNameOrId('media_assets')
    const media = new Record(col)
    media.set('church_id', churchId)
    media.set('event_id', eventId)
    media.set('name', title)
    media.set('media_type', format === 'AUDIO' ? 'AUDIO' : 'VIDEO')
    media.set('category', category)
    media.set('status', 'ENVIADA')
    media.set('source_url', sourceUrl)
    media.set('holyrics_filename', baseName + '.' + ext)
    media.set('uploaded_by', member.id)
    // Entra no fim da lista de mídias do culto
    try {
      const last = $app.findRecordsByFilter(
        'media_assets',
        'event_id = {:e}',
        '-presentation_order',
        1,
        0,
        { e: eventId },
      )
      media.set(
        'presentation_order',
        last.length > 0 ? last[0].getInt('presentation_order') + 1 : 1,
      )
    } catch (_) {}
    const operator = String(body.assigned_operator || '').trim()
    if (operator) {
      try {
        const op = $app.findRecordById('church_members', operator)
        if (op.getString('church_id') === churchId) media.set('assigned_operator', operator)
      } catch (_) {}
    }

    // 6. Tenta a VPS
    const vpsUrl = (
      String($os.getenv('YOUTUBE_API_URL') || '').replace(/\s+/g, '') ||
      (String($os.getenv('WHATSAPP_API_URL') || '').replace(/\s+/g, '')
        ? String($os.getenv('WHATSAPP_API_URL') || '')
            .replace(/\s+/g, '')
            .replace(/\/+$/, '') + '/youtube'
        : '')
    ).replace(/\/+$/, '')
    const vpsKey = String(
      $os.getenv('YOUTUBE_API_KEY') || $os.getenv('WHATSAPP_API_KEY') || '',
    ).trim()

    const job = {
      format: format,
      video_id: videoId,
      base_name: baseName,
      auto_name: autoName,
      requested_at: new Date().toISOString(),
    }
    let vpsError = ''
    if (vpsUrl && vpsKey) {
      try {
        const res = $http.send({
          url: vpsUrl + '/jobs',
          method: 'POST',
          headers: { 'x-api-key': vpsKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: sourceUrl, format: format }),
          timeout: 15,
        })
        if (res.statusCode === 202 && res.json && res.json.job_id) {
          job.vps_job_id = String(res.json.job_id)
        } else {
          vpsError = 'servidor respondeu ' + res.statusCode
        }
      } catch (err) {
        vpsError = String((err && err.message) || err)
      }
    } else {
      vpsError = 'servidor do YouTube não configurado'
    }

    if (job.vps_job_id) {
      media.set('youtube_stage', 'VPS')
      media.set('holyrics_status', 'BAIXANDO_YOUTUBE_SERVIDOR')
    } else {
      job.vps_error = vpsError
      media.set('youtube_stage', 'AGENT')
      media.set('holyrics_status', 'AGUARDANDO_COMPUTADOR_HOLYRICS (YouTube)')
    }
    media.set('youtube_job', job)
    $app.save(media)

    // 7. Sem VPS: fila para o computador do Holyrics
    let agentMessage = ''
    if (!job.vps_job_id) {
      let agent = null
      try {
        const agents = $app.findRecordsByFilter(
          'holyrics_agents',
          'church_id = {:c}',
          '-last_seen_at',
          1,
          0,
          { c: churchId },
        )
        if (agents.length > 0) agent = agents[0]
      } catch (_) {}
      if (!agent) {
        media.set('youtube_stage', 'FAILED')
        media.set(
          'holyrics_status',
          'ERRO_YOUTUBE: o servidor não baixou (' +
            vpsError +
            ') e não há computador do Holyrics pareado.',
        )
        $app.save(media)
        agentMessage = 'Não foi possível baixar: servidor indisponível e nenhum computador pareado.'
      } else {
        const cmdCol = $app.findCollectionByNameOrId('holyrics_commands')
        const cmd = new Record(cmdCol)
        const commandId = 'cmd_yt_' + Date.now() + '_' + $security.randomString(8)
        cmd.set('command_id', commandId)
        cmd.set('church_id', churchId)
        cmd.set('agent_id', agent.id)
        cmd.set('action', 'YOUTUBE_DOWNLOAD')
        cmd.set('status', 'PENDING')
        cmd.set('created_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
        cmd.set('payload', {
          media_id: media.id,
          church_id: churchId,
          event_id: eventId,
          name: title,
          video_id: videoId,
          youtube_url: sourceUrl,
          format: format,
          media_type: format === 'AUDIO' ? 'AUDIO' : 'VIDEO',
          category: category,
          holyrics_filename: baseName + '.' + ext,
        })
        $app.save(cmd)
        job.agent_command_id = commandId
        media.set('youtube_job', job)
        $app.save(media)
        agentMessage =
          agent.getString('status') === 'ONLINE'
            ? 'O computador do Holyrics vai baixar agora.'
            : 'O computador do Holyrics vai baixar assim que estiver conectado.'
      }
    }

    try {
      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const log = new Record(auditCol)
      log.set('church_id', churchId)
      log.set('user_id', auth.id)
      log.set('action', 'MEDIA_YOUTUBE_REQUESTED')
      log.set('entity_type', 'media')
      log.set('entity_id', media.id)
      log.set('event_id', eventId)
      log.set('details', {
        url: sourceUrl,
        format: format,
        stage: media.getString('youtube_stage'),
      })
      $app.save(log)
    } catch (_) {}

    return e.json(200, {
      success: media.getString('youtube_stage') !== 'FAILED',
      media_id: media.id,
      stage: media.getString('youtube_stage'),
      name: title,
      message: job.vps_job_id
        ? 'Baixando no servidor. Leva de alguns segundos a poucos minutos.'
        : agentMessage,
    })
  },
  $apis.requireAuth(),
)

// Confere os pedidos que estão na VPS
cronAdd('youtube_vps_poll', '* * * * *', () => {
  const vpsUrl = (
    String($os.getenv('YOUTUBE_API_URL') || '').replace(/\s+/g, '') ||
    (String($os.getenv('WHATSAPP_API_URL') || '').replace(/\s+/g, '')
      ? String($os.getenv('WHATSAPP_API_URL') || '')
          .replace(/\s+/g, '')
          .replace(/\/+$/, '') + '/youtube'
      : '')
  ).replace(/\/+$/, '')
  const vpsKey = String(
    $os.getenv('YOUTUBE_API_KEY') || $os.getenv('WHATSAPP_API_KEY') || '',
  ).trim()
  const host = vpsUrl.replace(/\/youtube$/, '')

  let rows = []
  try {
    rows = $app.findRecordsByFilter('media_assets', "youtube_stage = 'VPS'", 'created', 20, 0)
  } catch (_) {
    return
  }
  if (rows.length === 0) return

  const readJob = (rec) => {
    try {
      const raw = rec.get('youtube_job')
      if (!raw) return {}
      if (typeof raw === 'string') return JSON.parse(raw) || {}
      return JSON.parse(rec.getString('youtube_job') || '{}') || {}
    } catch (_) {
      return {}
    }
  }

  // Passa para o computador do Holyrics
  const toAgent = (rec, job, reason) => {
    job.vps_error = reason
    let agent = null
    try {
      const agents = $app.findRecordsByFilter(
        'holyrics_agents',
        'church_id = {:c}',
        '-last_seen_at',
        1,
        0,
        { c: rec.getString('church_id') },
      )
      if (agents.length > 0) agent = agents[0]
    } catch (_) {}
    if (!agent) {
      rec.set('youtube_stage', 'FAILED')
      rec.set(
        'holyrics_status',
        'ERRO_YOUTUBE: ' + reason + ' Não há computador do Holyrics pareado para tentar de novo.',
      )
      rec.set('youtube_job', job)
      $app.save(rec)
      return
    }
    const format = job.format === 'AUDIO' ? 'AUDIO' : 'VIDEO'
    const ext = format === 'AUDIO' ? 'mp3' : 'mp4'
    const cmd = new Record($app.findCollectionByNameOrId('holyrics_commands'))
    const commandId = 'cmd_yt_' + Date.now() + '_' + $security.randomString(8)
    cmd.set('command_id', commandId)
    cmd.set('church_id', rec.getString('church_id'))
    cmd.set('agent_id', agent.id)
    cmd.set('action', 'YOUTUBE_DOWNLOAD')
    cmd.set('status', 'PENDING')
    cmd.set('created_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
    cmd.set('payload', {
      media_id: rec.id,
      church_id: rec.getString('church_id'),
      event_id: rec.getString('event_id'),
      name: rec.getString('name'),
      video_id: job.video_id,
      youtube_url: rec.getString('source_url'),
      format: format,
      media_type: format,
      category: rec.getString('category'),
      holyrics_filename: (job.base_name || rec.getString('name')) + '.' + ext,
    })
    $app.save(cmd)
    job.agent_command_id = commandId
    rec.set('youtube_job', job)
    rec.set('youtube_stage', 'AGENT')
    rec.set('holyrics_status', 'AGUARDANDO_COMPUTADOR_HOLYRICS (YouTube: ' + reason + ')')
    $app.save(rec)
  }

  for (const rec of rows) {
    const job = readJob(rec)
    const startedAt = new Date(job.requested_at || rec.getString('created').replace(' ', 'T'))
    const ageMin = (Date.now() - startedAt.getTime()) / 60000
    if (!vpsUrl || !vpsKey || !job.vps_job_id) {
      toAgent(rec, job, 'servidor do YouTube não configurado.')
      continue
    }
    let st = null
    try {
      const res = $http.send({
        url: vpsUrl + '/jobs/' + encodeURIComponent(job.vps_job_id),
        method: 'GET',
        headers: { 'x-api-key': vpsKey },
        timeout: 15,
      })
      if (res.statusCode === 200) st = res.json
      else if (res.statusCode === 404) {
        toAgent(rec, job, 'o servidor perdeu o pedido (reiniciou).')
        continue
      }
    } catch (_) {}
    if (!st) {
      if (ageMin > 10) toAgent(rec, job, 'servidor do YouTube fora do ar.')
      continue
    }
    if (st.status === 'failed') {
      toAgent(rec, job, String(st.error || 'o servidor não conseguiu baixar.'))
      continue
    }
    if (st.status !== 'done') {
      if (ageMin > 30) toAgent(rec, job, 'o servidor demorou demais.')
      continue
    }
    // Pronto: traz o arquivo para a mídia
    try {
      const file = $filesystem.fileFromURL(host + st.file_path, 300)
      const ext = String(st.ext || (job.format === 'AUDIO' ? 'mp3' : 'mp4')).toLowerCase()
      let name = rec.getString('name')
      if (job.auto_name && st.title) {
        name = String(st.title).slice(0, 200)
        rec.set('name', name)
      }
      const clean = (s) =>
        String(s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      let base = job.base_name || clean(name)
      if (job.auto_name && st.title) {
        const parts = String(job.base_name || '').split(' - ')
        if (parts.length >= 4)
          base = parts
            .slice(0, 3)
            .concat([clean(name).slice(0, 120)])
            .join(' - ')
      }
      const original = (clean(name).slice(0, 80) || 'youtube') + '.' + ext
      try {
        file.originalName = original
      } catch (_) {}
      rec.set('file', file)
      rec.set('original_filename', original)
      rec.set('holyrics_filename', base + '.' + ext)
      rec.set('size', Number(st.size) || 0)
      rec.set('youtube_stage', 'DONE')
      rec.set('holyrics_status', '')
      job.done_by = 'VPS'
      rec.set('youtube_job', job)
      $app.save(rec)
    } catch (err) {
      toAgent(
        rec,
        job,
        'não deu para trazer o arquivo do servidor (' +
          String((err && err.message) || err).slice(0, 120) +
          ').',
      )
      continue
    }
    try {
      $http.send({
        url: vpsUrl + '/jobs/' + encodeURIComponent(job.vps_job_id),
        method: 'DELETE',
        headers: { 'x-api-key': vpsKey },
        timeout: 10,
      })
    } catch (_) {}
  }
})
