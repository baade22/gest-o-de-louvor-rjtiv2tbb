// Hook de busca no YouTube Data API v3 para o LouvorFlow
// GET /backend/v1/youtube/search?q=...&church_id=... (requer autenticação)
// Chave utilizada:
// 1) Credencial configurada pela igreja via collection `integrations` (ADMIN painel)
// 2) Fallback para variável de ambiente YOUTUBE_API_KEY se a igreja ainda não configurou

routerAdd(
  'GET',
  '/backend/v1/youtube/search',
  (e) => {
    // 1. Validação do parâmetro de busca
    const query = e.request.url.query().get('q') || ''
    const churchId = e.request.url.query().get('church_id') || ''
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      return e.json(400, {
        code: 'EMPTY_QUERY',
        message: 'O termo de pesquisa é obrigatório.',
        items: [],
      })
    }

    // 2. Chave de API do YouTube: busca primeiro da congregação
    let apiKey = ''
    let effectiveChurchId = churchId

    // Se church_id não veio na query, tenta inferir pela associação do usuário logado
    if (!effectiveChurchId && e.auth) {
      try {
        const memberships = $app.findRecordsByFilter(
          'church_members',
          'user_id = {:userId} && is_active = true',
          '-role',
          1,
          0,
          { userId: e.auth.id },
        )
        if (memberships.length > 0) {
          effectiveChurchId = memberships[0].getString('church_id')
        }
      } catch (_) {}
    }

    if (effectiveChurchId) {
      try {
        const integrations = $app.findRecordsByFilter(
          'integrations',
          'church_id = {:churchId} && provider = "youtube" && enabled = true',
          '',
          1,
          0,
          { churchId: effectiveChurchId },
        )
        if (integrations && integrations.length > 0) {
          const rawCreds = integrations[0].get('credentials')
          let creds = rawCreds
          if (typeof rawCreds === 'string' && rawCreds) {
            try {
              creds = JSON.parse(rawCreds)
            } catch (_) {}
          }
          if (creds && typeof creds === 'object' && creds.apiKey) {
            apiKey = String(creds.apiKey).trim()
          }
        }
      } catch (_) {}
    }

    // Fallback razoável para a variável de ambiente se a igreja não tiver configurado ainda
    if (!apiKey) {
      apiKey = $os.getenv('YOUTUBE_API_KEY') || ''
    }

    if (!apiKey) {
      return e.json(503, {
        code: 'API_KEY_MISSING',
        message:
          'Para pesquisar vídeos do YouTube dentro do LouvorFlow, cadastre uma API Key em Configurações → Integrações.',
        items: [],
      })
    }

    // 3. Chamada à API oficial do YouTube v3
    // type=video, maxResults=10 (hard cap)
    const encodedQuery = encodeURIComponent(trimmedQuery)
    const ytUrl =
      'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=' +
      encodedQuery +
      '&key=' +
      apiKey

    try {
      const res = $http.send({
        url: ytUrl,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        timeout: 10,
      })

      if (res.statusCode === 403) {
        let isQuota = false
        try {
          const errBody = res.json
          if (
            errBody &&
            errBody.error &&
            errBody.error.errors &&
            Array.isArray(errBody.error.errors)
          ) {
            for (let i = 0; i < errBody.error.errors.length; i++) {
              if (errBody.error.errors[i].reason === 'quotaExceeded') {
                isQuota = true
                break
              }
            }
          }
        } catch (_) {}

        if (isQuota) {
          return e.json(429, {
            code: 'QUOTA_EXCEEDED',
            message: 'A cota diária da API do YouTube foi excedida. Tente novamente mais tarde.',
            items: [],
          })
        }

        return e.json(403, {
          code: 'API_FORBIDDEN',
          message: 'Acesso negado pela API do YouTube. Verifique as restrições da chave.',
          items: [],
        })
      }

      if (res.statusCode !== 200) {
        return e.json(res.statusCode, {
          code: 'API_ERROR',
          message: 'Ocorreu um erro ao comunicar com a API do YouTube (' + res.statusCode + ').',
          items: [],
        })
      }

      const data = res.json || {}
      const rawItems = data.items || []

      // Retorna APENAS: videoId, title, description, channelTitle, publishedAt, thumbnail, videoUrl
      const cleanItems = []
      for (let i = 0; i < rawItems.length; i++) {
        const item = rawItems[i]
        const idObj = item.id || {}
        const videoId = idObj.videoId
        if (!videoId) continue

        const snippet = item.snippet || {}
        const thumbnails = snippet.thumbnails || {}
        const thumbUrl =
          (thumbnails.medium && thumbnails.medium.url) ||
          (thumbnails.high && thumbnails.high.url) ||
          (thumbnails.default && thumbnails.default.url) ||
          'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg'

        cleanItems.push({
          videoId: videoId,
          title: snippet.title || '',
          description: snippet.description || '',
          channelTitle: snippet.channelTitle || '',
          publishedAt: snippet.publishedAt || '',
          thumbnail: thumbUrl,
          videoUrl: 'https://www.youtube.com/watch?v=' + videoId,
        })
      }

      return e.json(200, {
        code: 'SUCCESS',
        message:
          cleanItems.length === 0 ? 'Nenhum vídeo encontrado.' : 'Pesquisa realizada com sucesso.',
        items: cleanItems,
      })
    } catch (err) {
      return e.json(500, {
        code: 'NETWORK_ERROR',
        message: 'Falha na conexão com a API do YouTube.',
        items: [],
      })
    }
  },
  $apis.requireAuth(),
)
