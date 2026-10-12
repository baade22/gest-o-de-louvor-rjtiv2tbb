// Hook para download seguro de mídia EXCLUSIVO para o LouvorFlow Agent
// GET /backend/v1/agent/media/{media_id}/download
// Autenticado estritamente pelo header x-agent-token
// Valida que o church_id da mídia pertence à mesma igreja do agente pareado
// Faz streaming do arquivo diretamente do storage do PocketBase ($app.newFilesystem())
// Sanitiza logs — nenhum token ou credencial é exposto em logs

routerAdd('GET', '/backend/v1/agent/media/{media_id}/download', (e) => {
  let rawToken = ''
  try {
    const authHeader = String(e.request.header.get('x-agent-token') || '').trim()
    if (authHeader) {
      rawToken = authHeader
    } else {
      const bearer = String(e.request.header.get('authorization') || '').trim()
      if (bearer.toLowerCase().startsWith('bearer ')) {
        rawToken = bearer.substring(7).trim()
      }
    }
  } catch (_) {}

  if (!rawToken) {
    return e.json(401, {
      success: false,
      error_code: 'UNAUTHORIZED_AGENT',
      message: 'Token de agente ausente.',
    })
  }

  let mediaId = ''
  try {
    if (e.request && typeof e.request.pathValue === 'function') {
      mediaId = e.request.pathValue('media_id')
    }
  } catch (_) {}

  if (!mediaId) {
    try {
      const reqInfo = e.requestInfo ? e.requestInfo() : null
      if (reqInfo && reqInfo.pathParams && reqInfo.pathParams['media_id']) {
        mediaId = reqInfo.pathParams['media_id']
      }
    } catch (_) {}
  }

  if (!mediaId) {
    try {
      const urlPath = String(e.request?.url?.path || e.request?.url || '')
      const match = urlPath.match(/\/backend\/v1\/agent\/media\/([^/?#]+)\/download/)
      if (match && match[1]) {
        mediaId = decodeURIComponent(match[1])
      }
    } catch (_) {}
  }

  mediaId = String(mediaId || '').trim()
  if (!mediaId) {
    return e.json(400, {
      success: false,
      error_code: 'MISSING_MEDIA_ID',
      message: 'media_id é obrigatório.',
    })
  }

  // 1. Busca e valida o agente autenticado pelo token hash
  const tokenHash = $security.sha256(rawToken)
  let agentRecord = null
  try {
    const agents = $app.findRecordsByFilter(
      'holyrics_agents',
      'agent_token = {:tokenHash} && status = "ONLINE"',
      '-updated',
      1,
      0,
      { tokenHash: tokenHash },
    )
    if (agents && agents.length > 0) {
      agentRecord = agents[0]
    }
  } catch (err) {
    return e.json(500, {
      success: false,
      error_code: 'AGENT_LOOKUP_ERROR',
      message: 'Erro ao validar token do agente.',
    })
  }

  if (!agentRecord) {
    // Tenta sem filtro de ONLINE caso o agente tenha acabado de reiniciar
    try {
      const agents = $app.findRecordsByFilter(
        'holyrics_agents',
        'agent_token = {:tokenHash}',
        '-updated',
        1,
        0,
        { tokenHash: tokenHash },
      )
      if (agents && agents.length > 0) {
        agentRecord = agents[0]
      }
    } catch (_) {}
  }

  if (!agentRecord) {
    return e.json(403, {
      success: false,
      error_code: 'INVALID_AGENT_TOKEN',
      message: 'Token de agente não reconhecido ou inválido.',
    })
  }

  const agentChurchId = agentRecord.getString('church_id')
  if (!agentChurchId) {
    return e.json(403, {
      success: false,
      error_code: 'AGENT_NOT_PAIRED',
      message: 'Agente não está vinculado a uma igreja.',
    })
  }

  // 2. Busca a mídia solicitada
  let mediaRecord = null
  try {
    mediaRecord = $app.findRecordById('media_assets', mediaId)
  } catch (_) {
    return e.json(404, {
      success: false,
      error_code: 'MEDIA_NOT_FOUND',
      message: 'Mídia não encontrada.',
    })
  }

  // 3. SEGURANÇA MULTI-TENANT: validação estrita no backend
  // Uma igreja JAMAIS pode baixar mídia de outra igreja
  const mediaChurchId = mediaRecord.getString('church_id')
  if (mediaChurchId !== agentChurchId) {
    return e.json(403, {
      success: false,
      error_code: 'FORBIDDEN_CHURCH_MISMATCH',
      message: 'Acesso negado: a mídia solicitada não pertence à igreja vinculada a este agente.',
    })
  }

  const fileName = mediaRecord.getString('file')
  if (!fileName) {
    return e.json(404, {
      success: false,
      error_code: 'FILE_EMPTY',
      message: 'Registro de mídia sem arquivo físico anexado.',
    })
  }

  // 4. Determina MIME Type apropriado
  const ext = fileName.split('.').pop().toLowerCase()
  let mimeType = 'application/octet-stream'
  const mimeMap = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    pdf: 'application/pdf',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
  if (mimeMap[ext]) {
    mimeType = mimeMap[ext]
  }

  // 5. Streaming com $app.newFilesystem()
  let fsys = null
  let reader = null
  try {
    fsys = $app.newFilesystem()
    const fileKey = mediaRecord.baseFilesPath() + '/' + fileName
    reader = fsys.getReader(fileKey)

    const friendlyName = mediaRecord.getString('name') || fileName
    const cleanHeaderName = friendlyName.replace(/["\r\n\\]/g, '_')

    try {
      if (e.response && typeof e.response.header === 'function') {
        const h = e.response.header()
        if (h && typeof h.set === 'function') {
          h.set('Content-Disposition', 'attachment; filename="' + cleanHeaderName + '"')
          h.set('X-Content-Type-Options', 'nosniff')
          const fileSize = mediaRecord.getInt('size')
          if (fileSize > 0) {
            h.set('Content-Length', String(fileSize))
          }
        }
      }
    } catch (_) {}

    return e.stream(200, mimeType, reader)
  } catch (err) {
    if (reader && typeof reader.close === 'function') {
      try {
        reader.close()
      } catch (_) {}
    }
    if (fsys && typeof fsys.close === 'function') {
      try {
        fsys.close()
      } catch (_) {}
    }
    return e.json(500, {
      success: false,
      error_code: 'STREAM_ERROR',
      message: 'Erro ao transmitir arquivo: ' + err.message,
    })
  }
})
