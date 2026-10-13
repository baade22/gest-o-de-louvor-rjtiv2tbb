// Hook: saas_holyrics_resolve_event.js (Etapa 3A da auditoria — Vincular culto do SaaS à ocorrência de culto no Holyrics)
// Endpoint: POST /backend/v1/saas/holyrics/resolve-event
//
// Regras da auditoria:
// - NUNCA cria eventos no Holyrics. Apenas LOCALIZA uma ocorrência JÁ EXISTENTE via GetSchedules.
// - Payload do comando GET_SCHEDULES é ESTRITAMENTE { month, year } (Holyrics 2.30.0 rejeita campos extras).
// - No Holyrics 2.30.0+, cultos recorrentes aparecem como 'service' e eventos pontuais como 'event'.
//   Considera candidatos com type === 'service' ou type === 'event'.
// - Para ocorrências de cultos/serviços, o identificador da ocorrência é obtido EXCLUSIVAMENTE
//   de metadata.event.id (ex: "1791842350987202610251700").
// - NUNCA persiste metadata.event.metadata.service.id (o ID do modelo recorrente, ex: "1791842350987").
// - Casamento por data COMPLETA (dia+mês+ano, formato calendário puro) e horário quando disponível (tolerância 1 min).
// - 0 candidatos -> EVENT_NOT_FOUND; >1 -> AMBIGUOUS_MATCH. Em ambos: NÃO escolhe, NÃO cria, NÃO envia;
//   registra pendência em holyrics_sync_logs.
// - Se events.holyrics_event_id já está preenchido, apenas confirma o vínculo persistido (LINKED).
// - O token do Holyrics nunca sai do Agent local: aqui falamos apenas com o SaaS (fila holyrics_commands).

routerAdd(
  'POST',
  '/backend/v1/saas/holyrics/resolve-event',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, {
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Não autenticado.',
      })
    }

    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {}

    const churchId = String(body.church_id || '').trim()
    const eventId = String(body.event_id || '').trim()
    let agentId = String(body.agent_id || '').trim()

    if (!churchId || !eventId) {
      return e.json(400, {
        success: false,
        error_code: 'MISSING_FIELDS',
        message: 'church_id e event_id são obrigatórios.',
      })
    }

    // 1. Validação estrita de permissão (mesmo padrão de sync-event: holyrics.sync)
    try {
      const memberships = $app.findRecordsByFilter(
        'church_members',
        'church_id = {:churchId} && user_id = {:userId} && is_active = true',
        '',
        1,
        0,
        { churchId: churchId, userId: authRecord.id },
      )
      if (memberships.length === 0) {
        return e.json(403, {
          success: false,
          error_code: 'NOT_A_MEMBER',
          message: 'Acesso negado a esta congregação.',
        })
      }
      const role = memberships[0].getString('role')
      if (role === 'MUSICO') {
        return e.json(403, {
          success: false,
          error_code: 'INSUFFICIENT_PERMISSIONS',
          message:
            'Apenas Administradores e Líderes possuem permissão para vincular eventos do Holyrics. Músicos não possuem autorização.',
        })
      }
    } catch (err) {
      return e.json(500, {
        success: false,
        error_code: 'AUTH_CHECK_FAILED',
        message: 'Erro ao validar autorização: ' + err.message,
      })
    }

    // 2. Validação do Evento e isolamento multi-tenant
    let eventRecord = null
    try {
      eventRecord = $app.findRecordById('events', eventId)
    } catch (_) {
      return e.json(404, {
        success: false,
        error_code: 'EVENT_NOT_FOUND',
        message: 'Culto/evento não encontrado no LouvorFlow.',
      })
    }

    if (eventRecord.getString('church_id') !== churchId) {
      return e.json(403, {
        success: false,
        error_code: 'MULTI_TENANT_VIOLATION',
        message: 'O culto informado pertence a outra congregação.',
      })
    }

    // 3. Vínculo já persistido: associações são permanentes, retornamos sem consultar o Holyrics.
    const persistedHolyricsEventId = eventRecord.getString('holyrics_event_id') || ''
    if (persistedHolyricsEventId) {
      return e.json(200, {
        success: true,
        status: 'LINKED',
        linked: true,
        holyrics_event_id: persistedHolyricsEventId,
        event_id: eventId,
        message: 'Culto já vinculado a um evento do Holyrics (associação persistida).',
      })
    }

    // 4. Localiza o Agent da igreja (mesmo padrão do sync-event)
    const nowTime = new Date().getTime()
    if (!agentId) {
      try {
        const agents = $app.findRecordsByFilter(
          'holyrics_agents',
          'church_id = {:churchId}',
          '-last_seen_at',
          10,
          0,
          { churchId: churchId },
        )
        for (let i = 0; i < agents.length; i++) {
          const a = agents[i]
          const ls = a.getString('last_seen_at')
          if (ls && nowTime - new Date(ls).getTime() <= 45 * 1000 && a.getString('paired_at')) {
            agentId = a.id
            break
          }
        }
      } catch (_) {}
    }

    if (!agentId) {
      return e.json(200, {
        success: false,
        agent_online: false,
        error_code: 'NO_ACTIVE_AGENT',
        status: 'SYNC_PENDING',
        message:
          'Nenhum computador do Holyrics conectado. Verifique: Agent conectado • Holyrics aberto • API Server ativo • Token válido.',
      })
    }

    let agentRecord = null
    try {
      agentRecord = $app.findRecordById('holyrics_agents', agentId)
    } catch (_) {
      return e.json(404, {
        success: false,
        error_code: 'AGENT_NOT_FOUND',
        status: 'SYNC_PENDING',
        message: 'Agente selecionado não encontrado.',
      })
    }

    if (agentRecord.getString('church_id') !== churchId) {
      return e.json(403, {
        success: false,
        error_code: 'MULTI_TENANT_VIOLATION',
        message: 'Agente pertence a outra congregação.',
      })
    }

    const lastSeenStr = agentRecord.getString('last_seen_at')
    const isOnline = lastSeenStr && nowTime - new Date(lastSeenStr).getTime() <= 45 * 1000
    if (!isOnline) {
      return e.json(200, {
        success: false,
        agent_online: false,
        error_code: 'AGENT_OFFLINE',
        status: 'SYNC_PENDING',
        message:
          'Computador do Holyrics offline. Verifique: Agent conectado • Holyrics aberto • API Server ativo • Token válido.',
      })
    }

    if (!agentRecord.getBool('holyrics_detected')) {
      return e.json(200, {
        success: false,
        agent_online: true,
        holyrics_detected: false,
        error_code: 'HOLYRICS_NOT_DETECTED',
        status: 'SYNC_PENDING',
        message:
          'Holyrics não detectado pelo Agent. Verifique se o Holyrics está aberto com o API Server ativo e o token válido.',
      })
    }

    // 5. Data do culto -> month/year para GetSchedules
    //    events.date é campo date do PocketBase (formato "YYYY-MM-DD HH:mm:ss.SSSZ" em UTC).
    //    A data do culto é interpretada na igreja (fuso local): usamos os componentes UTC do campo,
    //    pois o SaaS sempre gravou a data/hora local da igreja como se fosse UTC.
    const syncLogsCol = $app.findCollectionByNameOrId('holyrics_sync_logs')
    const cmdCol = $app.findCollectionByNameOrId('holyrics_commands')

    const recordSyncLog = (logData) => {
      try {
        const logRec = new Record(syncLogsCol)
        const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
        logRec.set('church_id', churchId)
        logRec.set('agent_id', agentId)
        if (logData.event_id) logRec.set('event_id', logData.event_id)
        logRec.set('action', logData.action || 'RESOLVE_EVENT_LINK')
        logRec.set('status', logData.status === 'ERROR' ? 'ERROR' : 'SUCCESS')
        if (logData.error) logRec.set('error', String(logData.error).substring(0, 2000))
        logRec.set('created_at', nowIso)
        if (logData.command_id) logRec.set('command_id', logData.command_id)
        if (logData.duration_ms !== undefined) logRec.set('duration_ms', logData.duration_ms)
        if (logData.http_status !== undefined) logRec.set('http_status', logData.http_status)
        if (logData.stage) logRec.set('stage', logData.stage)
        if (logData.details) logRec.set('details', logData.details)
        $app.save(logRec)
      } catch (err) {
        console.log('[HOLYRICS_RESOLVE_EVENT_LOG_ERR]', err.message)
      }
    }

    // Helper de decodificação Goja UTF-8 multibyte (mesmo padrão do sync-event)
    const decodeUtf8Bytes = (bytes) => {
      if (!Array.isArray(bytes) || bytes.length === 0) return ''
      let out = ''
      let i = 0
      const len = bytes.length
      while (i < len) {
        const c = bytes[i++] & 0xff
        if (c <= 0x7f) {
          out += String.fromCharCode(c)
        } else if ((c & 0xe0) === 0xc0) {
          if (i < len) {
            const c2 = bytes[i++] & 0xff
            out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f))
          } else {
            out += String.fromCharCode(c)
          }
        } else if ((c & 0xf0) === 0xe0) {
          if (i + 1 < len) {
            const c2 = bytes[i++] & 0xff
            const c3 = bytes[i++] & 0xff
            out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f))
          } else {
            out += String.fromCharCode(c)
          }
        } else if ((c & 0xf8) === 0xf0) {
          if (i + 2 < len) {
            const c2 = bytes[i++] & 0xff
            const c3 = bytes[i++] & 0xff
            const c4 = bytes[i++] & 0xff
            let cp = ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)
            if (cp > 0xffff) {
              cp -= 0x10000
              out += String.fromCharCode(0xd800 + (cp >> 10))
              out += String.fromCharCode(0xdc00 + (cp & 0x3ff))
            } else {
              out += String.fromCharCode(cp)
            }
          } else {
            out += String.fromCharCode(c)
          }
        } else {
          out += String.fromCharCode(c)
        }
      }
      return out
    }

    // Helper para desempacotar recursivamente strings JSON ou bytes Goja
    const unwrapJsonPayload = (raw) => {
      if (!raw) return raw
      let current = raw
      if (Array.isArray(current) && current.length > 0 && typeof current[0] === 'number') {
        try {
          current = JSON.parse(decodeUtf8Bytes(current))
        } catch (_) {}
      }
      if (typeof current === 'string') {
        const trimmed = current.trim()
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            current = JSON.parse(trimmed)
          } catch (_) {}
        }
      }
      return current
    }

    // Executa comando via fila existente (pollCommands -> executeCommand -> result)
    const runCommandSync = (action, payload, maxWaitMs) => {
      const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19)
      const cmdId =
        'cmd_' + action.toLowerCase() + '_' + Date.now() + '_' + $security.randomString(8)
      const cmd = new Record(cmdCol)
      cmd.set('command_id', cmdId)
      cmd.set('church_id', churchId)
      cmd.set('agent_id', agentId)
      cmd.set('action', action)
      cmd.set('payload', payload)
      cmd.set('status', 'PENDING')
      cmd.set('created_at', nowIso)

      try {
        $app.save(cmd)
      } catch (err) {
        return {
          command_id: cmdId,
          status: 'FAILED',
          result: null,
          error: 'Falha ao registrar comando ' + action + ' na fila: ' + err.message,
          error_code: 'COMMAND_QUEUE_FAILED',
          duration_ms: 0,
        }
      }

      const start = Date.now()
      let finalStatus = 'PENDING'
      let finalResult = null
      let finalError = ''

      while (Date.now() - start < maxWaitMs) {
        try {
          const check = $app.findRecordById('holyrics_commands', cmd.id)
          const st = check.getString('status')
          if (st === 'DONE' || st === 'FAILED') {
            finalStatus = st
            try {
              const r = check.get('result')
              if (typeof r === 'string') {
                finalResult = JSON.parse(r)
              } else if (Array.isArray(r)) {
                finalResult = JSON.parse(decodeUtf8Bytes(r))
              } else {
                finalResult = r
              }
            } catch (_) {
              finalResult = check.get('result')
            }
            finalError = check.getString('error')
            break
          }
        } catch (_) {}
        for (let k = 0; k < 60; k++) {
          $security.randomString(5)
        }
      }

      return {
        command_id: cmdId,
        status: finalStatus,
        result: finalResult,
        error: finalError,
        duration_ms: Date.now() - start,
      }
    }

    // Extração polimórfica da lista de schedules a partir do resultado do Agent
    // Tolera objetos aninhados, strings JSON (compostas ou dentro de propriedades como result/data/response)
    const extractScheduleList = (rawResult) => {
      if (!rawResult) return []
      let res = unwrapJsonPayload(rawResult)

      // Se veio embrulhado em propriedade aninhada (ex: { result: "..." } ou { data: "..." })
      if (res && typeof res === 'object' && !Array.isArray(res)) {
        if (res.result) {
          const unwrapped = unwrapJsonPayload(res.result)
          if (Array.isArray(unwrapped)) return unwrapped
          if (unwrapped && Array.isArray(unwrapped.schedules)) return unwrapped.schedules
          if (unwrapped && Array.isArray(unwrapped.items)) return unwrapped.items
        }
        if (res.response) {
          const unwrapped = unwrapJsonPayload(res.response)
          if (Array.isArray(unwrapped)) return unwrapped
          if (unwrapped && Array.isArray(unwrapped.schedules)) return unwrapped.schedules
          if (unwrapped && Array.isArray(unwrapped.items)) return unwrapped.items
        }
      }

      // Formato oficial do Agent: { schedules: [...], count, month, year }
      if (res && Array.isArray(res.schedules)) return res.schedules
      if (Array.isArray(res)) return res
      if (res && res.data) {
        const unwrappedData = unwrapJsonPayload(res.data)
        if (Array.isArray(unwrappedData)) return unwrappedData
        if (unwrappedData && Array.isArray(unwrappedData.items)) return unwrappedData.items
        if (unwrappedData && Array.isArray(unwrappedData.schedules)) return unwrappedData.schedules
      }
      if (res && Array.isArray(res.items)) return res.items
      return []
    }

    // Parse de data civil (YYYY-MM-DD) e horário a partir de item de agendamento do Holyrics
    // REGRA CRÍTICA: Prioridade 1 é o campo "datetime" (string com data local da igreja, ex: "2026-10-25 17:00").
    // O parsing é estritamente civil por split / regex de componentes (sem new Date() que dependa do fuso do servidor).
    // O campo "datetime_millis" (seja number ou string de epoch UTC) é usado apenas como fallback com guarda Number()/parseInt.
    const parseScheduleDate = (item) => {
      if (!item || typeof item !== 'object') return null

      // Candidatos de string local da igreja (prioridade máxima)
      const strCandidates = [
        item.datetime,
        item.date,
        item.datetime_str,
        item.start,
        item.start_time,
        item.time,
        // Também busca se estiver aninhado em item.metadata.event.datetime
        item.metadata && item.metadata.event ? item.metadata.event.datetime : null,
      ]

      for (let i = 0; i < strCandidates.length; i++) {
        const s = strCandidates[i]
        if (!s) continue
        const str = String(s).trim()
        if (!str) continue

        // Padrão ISO / Local: "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD"
        const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/)
        if (isoMatch) {
          return {
            source: 'datetime_string',
            raw: str,
            ymd: isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3],
            y: Number(isoMatch[1]),
            mo: Number(isoMatch[2]),
            d: Number(isoMatch[3]),
            h: isoMatch[4] !== undefined ? Number(isoMatch[4]) : -1,
            mi: isoMatch[5] !== undefined ? Number(isoMatch[5]) : -1,
          }
        }

        // Padrão brasileiro: "DD/MM/YYYY HH:mm" ou "DD/MM/YYYY"
        const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/)
        if (brMatch) {
          const dStr = String(brMatch[1]).padStart(2, '0')
          const moStr = String(brMatch[2]).padStart(2, '0')
          const yStr = brMatch[3]
          return {
            source: 'datetime_br',
            raw: str,
            ymd: yStr + '-' + moStr + '-' + dStr,
            y: Number(yStr),
            mo: Number(moStr),
            d: Number(dStr),
            h: brMatch[4] !== undefined ? Number(brMatch[4]) : -1,
            mi: brMatch[5] !== undefined ? Number(brMatch[5]) : -1,
          }
        }
      }

      // Fallback: datetime_millis como number ou string de epoch UTC (ex: "1792958400000")
      const millisCandidates = [
        item.datetime_millis,
        item.datetimeMillis,
        item.timestamp,
        item.metadata && item.metadata.event ? item.metadata.event.datetime_millis : null,
      ]
      for (let i = 0; i < millisCandidates.length; i++) {
        const rawM = millisCandidates[i]
        if (rawM === undefined || rawM === null || rawM === '') continue
        let v = typeof rawM === 'number' ? rawM : Number(String(rawM).trim())
        if (Number.isFinite(v) && v > 0) {
          const ms = v < 1e11 ? v * 1000 : v
          // No Holyrics para o Brasil (UTC-3), datetime_millis representa o epoch UTC do momento local.
          // Aplicamos o deslocamento padrão de -3h (10800000ms) para obter a data civil local da igreja,
          // evitando que horários noturnos em UTC desloquem a data civil para o dia anterior/posterior.
          const localEpoch = ms - 3 * 3600 * 1000
          const dt = new Date(localEpoch)
          const y = dt.getUTCFullYear()
          const mo = dt.getUTCMonth() + 1
          const d = dt.getUTCDate()
          const h = dt.getUTCHours()
          const mi = dt.getUTCMinutes()
          const ymd =
            String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0')
          return {
            source: 'datetime_millis',
            raw: String(rawM),
            ymd: ymd,
            y: y,
            mo: mo,
            d: d,
            h: h,
            mi: mi,
          }
        }
      }

      return null
    }

    const partsFromRecord = (dt) => ({
      y: dt.getUTCFullYear(),
      mo: dt.getUTCMonth() + 1,
      d: dt.getUTCDate(),
      h: dt.getUTCHours(),
      mi: dt.getUTCMinutes(),
    })

    const eventDateStr = eventRecord.getString('date') || ''
    const eventStartTime = eventRecord.getString('start_time') || ''

    // Componentes da data do culto (preservando o valor de calendário YYYY-MM-DD)
    // O campo date do PocketBase armazena "YYYY-MM-DD HH:mm:ss.SSSZ" ou "YYYY-MM-DD".
    // Extraímos a data civil estritamente dos dígitos "YYYY-MM-DD", imune a fuso horário.
    let targetYmd = ''
    let evParts = null
    const datePatternMatch = String(eventDateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (datePatternMatch) {
      targetYmd = datePatternMatch[1] + '-' + datePatternMatch[2] + '-' + datePatternMatch[3]
      evParts = {
        y: Number(datePatternMatch[1]),
        mo: Number(datePatternMatch[2]),
        d: Number(datePatternMatch[3]),
        ymd: targetYmd,
      }
    } else {
      try {
        const parsedDate = new Date(eventDateStr)
        if (!isNaN(parsedDate.getTime())) {
          const p = partsFromRecord(parsedDate)
          targetYmd =
            String(p.y) + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0')
          evParts = {
            y: p.y,
            mo: p.mo,
            d: p.d,
            ymd: targetYmd,
          }
        }
      } catch (_) {}
    }

    // REGRA DE HORÁRIO:
    // O horário do culto só é considerado quando start_time estiver preenchido com "HH:mm".
    // NUNCA derivar horário do campo date (meia-noite UTC não é horário de culto!).
    // Se start_time estiver ausente/em branco, hasTargetTime = false e a comparação de horário é PULADA.
    let evHour = -1
    let evMinute = -1
    let hasTargetTime = false
    const trimmedStartTime = String(eventStartTime || '').trim()
    const startTimeMatch = trimmedStartTime.match(/^(\d{1,2}):(\d{2})/)
    if (startTimeMatch) {
      evHour = Number(startTimeMatch[1])
      evMinute = Number(startTimeMatch[2])
      hasTargetTime = true
    }

    if (!evParts) {
      recordSyncLog({
        event_id: eventId,
        action: 'RESOLVE_EVENT_LINK',
        status: 'ERROR',
        stage: 'INVALID_EVENT_DATE',
        error: 'Não foi possível interpretar a data do culto (' + eventDateStr + ').',
        details: { event_date: eventDateStr },
      })
      return e.json(200, {
        success: false,
        error_code: 'INVALID_EVENT_DATE',
        status: 'SYNC_PENDING',
        message: 'Data do culto inválida ou ausente para buscar eventos no Holyrics.',
      })
    }

    const queryMonth = evParts.mo
    const queryYear = evParts.y

    // 6. Enfileira GET_SCHEDULES com payload ESTRITAMENTE { month, year }
    const schedulesRes = runCommandSync(
      'GET_SCHEDULES',
      { month: queryMonth, year: queryYear },
      12000,
    )

    if (schedulesRes.status !== 'DONE' || !schedulesRes.result) {
      const isTimeout = schedulesRes.status === 'PENDING'
      const techErr =
        schedulesRes.error ||
        (isTimeout
          ? 'Tempo limite de resposta do LouvorFlow Agent esgotado na consulta GetSchedules (TIMEOUT). Verifique se o Agent está aberto no computador da igreja.'
          : 'Falha ao consultar GetSchedules no Holyrics.')
      const errorCode = isTimeout
        ? 'AGENT_TIMEOUT'
        : schedulesRes.error_code || 'GET_SCHEDULES_FAILED'
      recordSyncLog({
        event_id: eventId,
        action: 'RESOLVE_EVENT_LINK',
        status: 'ERROR',
        stage: 'GET_SCHEDULES_FAILED',
        error: techErr,
        command_id: schedulesRes.command_id,
        duration_ms: schedulesRes.duration_ms,
        details: { month: queryMonth, year: queryYear },
      })
      return e.json(200, {
        success: false,
        error_code: errorCode,
        status: 'SYNC_PENDING',
        message: techErr,
      })
    }

    const allSchedules = extractScheduleList(schedulesRes.result)

    // 7. Filtra candidatos: considera ocorrências tanto 'service' (cultos recorrentes de domingo) quanto 'event'
    const scheduleCandidates = []
    let serviceCandidatesCount = 0
    let eventCandidatesCount = 0

    for (let i = 0; i < allSchedules.length; i++) {
      const item = allSchedules[i]
      if (!item || typeof item !== 'object') continue
      const type = String(item.type || '').toLowerCase()
      // No Holyrics 2.30.0+, cultos recorrentes são 'service' e eventos avulsos são 'event'
      if (type === 'service') {
        serviceCandidatesCount++
        scheduleCandidates.push(item)
      } else if (type === 'event') {
        eventCandidatesCount++
        scheduleCandidates.push(item)
      }
    }

    // Extrai o identificador da ocorrência: EXCLUSIVAMENTE metadata.event.id (ex: "1791842350987202610251700")
    // NUNCA persistir metadata.event.metadata.service.id (ID do modelo recorrente, ex: "1791842350987")
    const extractOccurrenceId = (item) => {
      if (!item || typeof item !== 'object') return ''

      // Prioridade 1 (regra central): metadata.event.id
      const meta = item.metadata
      if (meta && typeof meta === 'object' && meta.event && typeof meta.event === 'object') {
        const occurrenceId = String(meta.event.id || '').trim()
        if (occurrenceId) return occurrenceId
      }

      // Prioridade 2: item.event.id se estruturado assim
      const nested = item.event
      if (nested && typeof nested === 'object') {
        const nestedId = String(nested.id || '').trim()
        if (nestedId) return nestedId
      }

      // Prioridade 3: para type === 'event' que não possua metadata.event.id aninhado,
      // tolera item.id desde que não seja de um service
      const itemType = String(item.type || '').toLowerCase()
      if (itemType === 'event') {
        const topId = String(item.id || '').trim()
        if (topId) return topId
      }

      return ''
    }

    // 8. Casamento por data CIVIL (dia+mês+ano) e horário (tolerância 1 min, apenas se culto tiver horário)
    // Coleta auditoria detalhada de cada candidato para o log
    const candidateAudit = []
    const matched = []

    for (let i = 0; i < scheduleCandidates.length; i++) {
      const item = scheduleCandidates[i]
      const parsed = parseScheduleDate(item)
      const itemType = String(item.type || '').toLowerCase()
      const occurrenceId = extractOccurrenceId(item)
      const itemName = String(
        item.name || (item.metadata && item.metadata.event ? item.metadata.event.name : '') || '',
      )

      if (!parsed) {
        candidateAudit.push({
          index: i,
          type: itemType,
          name: itemName,
          parsed_date: null,
          decision: 'REJECTED_UNPARSEABLE_DATE',
          reason: 'Data não pôde ser interpretada',
        })
        continue
      }

      const dateMatch = parsed.y === evParts.y && parsed.mo === evParts.mo && parsed.d === evParts.d

      if (!dateMatch) {
        candidateAudit.push({
          index: i,
          type: itemType,
          name: itemName,
          extracted_ymd: parsed.ymd,
          extracted_time: parsed.h >= 0 ? `${parsed.h}:${parsed.mi}` : 'none',
          decision: 'REJECTED_DATE_MISMATCH',
          reason: `Data ${parsed.ymd} diverge do alvo ${targetYmd}`,
        })
        continue
      }

      // Data civil casou! Verifica horário:
      // Se o culto NÃO tem horário definido (start_time vazio), aceita qualquer horário do dia.
      // Se o culto tem horário E o item do Holyrics tem horário, compara com tolerância de 1 minuto.
      // Se o item do Holyrics não tem horário, aceita.
      if (hasTargetTime && parsed.h >= 0) {
        const diffMin = Math.abs(parsed.h * 60 + parsed.mi - (evHour * 60 + evMinute))
        if (diffMin > 1) {
          candidateAudit.push({
            index: i,
            type: itemType,
            name: itemName,
            extracted_ymd: parsed.ymd,
            extracted_time: `${parsed.h}:${String(parsed.mi).padStart(2, '0')}`,
            target_time: `${evHour}:${String(evMinute).padStart(2, '0')}`,
            diff_min: diffMin,
            decision: 'REJECTED_TIME_MISMATCH',
            reason: `Horário ${parsed.h}:${parsed.mi} difere do culto (${evHour}:${evMinute}) por ${diffMin} min`,
          })
          continue
        }
      }

      if (!occurrenceId) {
        candidateAudit.push({
          index: i,
          type: itemType,
          name: itemName,
          extracted_ymd: parsed.ymd,
          extracted_time: parsed.h >= 0 ? `${parsed.h}:${parsed.mi}` : 'none',
          decision: 'REJECTED_MISSING_ID',
          reason: 'metadata.event.id não encontrado para a ocorrência',
        })
        continue
      }

      candidateAudit.push({
        index: i,
        type: itemType,
        name: itemName,
        occurrence_id: occurrenceId,
        extracted_ymd: parsed.ymd,
        extracted_time: parsed.h >= 0 ? `${parsed.h}:${parsed.mi}` : 'none',
        decision: 'ACCEPTED',
        reason: 'Data civil e horário casaram com o alvo',
      })
      matched.push(item)
    }

    // 9. Decisão: 0 candidatos -> EVENT_NOT_FOUND; >1 -> AMBIGUOUS_MATCH. NUNCA escolher ou criar.
    if (matched.length === 0) {
      recordSyncLog({
        event_id: eventId,
        action: 'RESOLVE_EVENT_LINK',
        status: 'ERROR',
        stage: 'EVENT_NOT_FOUND',
        error:
          'Nenhum agendamento (service/event) do Holyrics encontrado para a data ' +
          targetYmd +
          (hasTargetTime ? ' às ' + trimmedStartTime : '') +
          '.',
        command_id: schedulesRes.command_id,
        duration_ms: schedulesRes.duration_ms,
        details: {
          target_date: targetYmd,
          target_time: hasTargetTime ? trimmedStartTime : null,
          target_month: queryMonth,
          target_year: queryYear,
          schedules_received: allSchedules.length,
          schedule_candidates: scheduleCandidates.length,
          service_candidates: serviceCandidatesCount,
          event_candidates: eventCandidatesCount,
          candidates_audit: candidateAudit.slice(0, 20),
        },
      })
      return e.json(200, {
        success: false,
        status: 'EVENT_NOT_FOUND',
        linked: false,
        error_code: 'EVENT_NOT_FOUND',
        holyrics_event_id: '',
        candidates_found: allSchedules.length,
        message:
          'Nenhum agendamento do Holyrics encontrado para a data deste culto (' +
          targetYmd +
          (hasTargetTime ? ' às ' + trimmedStartTime : '') +
          '). Confirme se o culto ou evento existe na agenda do Holyrics (não criamos eventos automaticamente).',
      })
    }

    if (matched.length > 1) {
      const candidateIds = matched.map((it) => extractOccurrenceId(it)).filter((s) => s)
      recordSyncLog({
        event_id: eventId,
        action: 'RESOLVE_EVENT_LINK',
        status: 'ERROR',
        stage: 'AMBIGUOUS_MATCH',
        error:
          'Mais de um agendamento do Holyrics encontrado para a mesma data/hora. Nenhuma associação foi escolhida automaticamente.',
        command_id: schedulesRes.command_id,
        duration_ms: schedulesRes.duration_ms,
        details: {
          target_date: targetYmd,
          target_time: hasTargetTime ? trimmedStartTime : null,
          target_month: queryMonth,
          target_year: queryYear,
          matched_count: matched.length,
          candidate_ids: candidateIds,
          candidates_audit: candidateAudit.slice(0, 20),
        },
      })
      return e.json(200, {
        success: false,
        status: 'AMBIGUOUS_MATCH',
        linked: false,
        error_code: 'AMBIGUOUS_MATCH',
        holyrics_event_id: '',
        matched_count: matched.length,
        candidate_ids: candidateIds,
        message:
          'Mais de um agendamento do Holyrics corresponde à data/hora deste culto (' +
          matched.length +
          ' candidatos). A associação não foi feita automaticamente — resolva a duplicidade no Holyrics.',
      })
    }

    // 10. Candidato único: persiste em events.holyrics_event_id
    const holyricsEventId = extractOccurrenceId(matched[0])
    if (!holyricsEventId) {
      recordSyncLog({
        event_id: eventId,
        action: 'RESOLVE_EVENT_LINK',
        status: 'ERROR',
        stage: 'MISSING_EVENT_ID',
        error:
          'Agendamento do Holyrics localizado na data, mas sem ID de ocorrência identificável (metadata.event.id ausente).',
        command_id: schedulesRes.command_id,
        duration_ms: schedulesRes.duration_ms,
        details: {
          target_date: targetYmd,
          schedule_name: String(matched[0].name || ''),
          schedule_type: String(matched[0].type || ''),
          candidates_audit: candidateAudit.slice(0, 20),
        },
      })
      return e.json(200, {
        success: false,
        status: 'EVENT_NOT_FOUND',
        linked: false,
        error_code: 'EVENT_ID_NOT_IDENTIFIABLE',
        holyrics_event_id: '',
        message:
          'Agendamento encontrado na data, mas sem ID de ocorrência identificável na resposta do Holyrics (metadata.event.id ausente).',
      })
    }

    try {
      eventRecord.set('holyrics_event_id', holyricsEventId)
      $app.save(eventRecord)
    } catch (err) {
      recordSyncLog({
        event_id: eventId,
        action: 'RESOLVE_EVENT_LINK',
        status: 'ERROR',
        stage: 'PERSIST_FAILED',
        error: 'Falha ao salvar holyrics_event_id: ' + err.message,
        command_id: schedulesRes.command_id,
        duration_ms: schedulesRes.duration_ms,
        details: { holyrics_event_id: holyricsEventId },
      })
      return e.json(500, {
        success: false,
        error_code: 'PERSIST_FAILED',
        status: 'SYNC_PENDING',
        message: 'Falha ao salvar o vínculo do culto: ' + err.message,
      })
    }

    recordSyncLog({
      event_id: eventId,
      action: 'RESOLVE_EVENT_LINK',
      status: 'SUCCESS',
      stage: 'LINKED',
      command_id: schedulesRes.command_id,
      duration_ms: schedulesRes.duration_ms,
      details: {
        holyrics_event_id: holyricsEventId,
        schedule_name: String(matched[0].name || ''),
        target_date: targetYmd,
        target_time: hasTargetTime ? trimmedStartTime : null,
        month: queryMonth,
        year: queryYear,
        candidates_audit: candidateAudit.slice(0, 20),
      },
    })

    return e.json(200, {
      success: true,
      status: 'LINKED',
      linked: true,
      holyrics_event_id: holyricsEventId,
      event_id: eventId,
      schedule_name: String(matched[0].name || ''),
      message:
        'Culto vinculado à ocorrência do Holyrics (' +
        holyricsEventId +
        '). Associação persistida no SaaS.',
    })
  },
  $apis.requireAuth(),
)
