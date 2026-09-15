// Hook de busca no YouTube Data API v3 para o LouvorFlow
// GET /backend/v1/youtube/search?q=... (requer autenticação)
// Chave lida server-side: $os.getenv("YOUTUBE_API_KEY")

routerAdd(
  'GET',
  '/backend/v1/youtube/search',
  (e) => {
    // 1. Validação do parâmetro de busca
    const query = e.request.url.query().get('q') || ''
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return e.json(400, {
        code: 'EMPTY_QUERY',
        message: 'O termo de pesquisa é obrigatório.',
        items: [],
      })
    }

    // 2. Chave de API do YouTube
    const apiKey = $os.getenv('YOUTUBE_API_KEY') || ''
    if (!apiKey) {
      return e.json(503, {
        code: 'API_KEY_MISSING',
        message: 'A chave da API do YouTube (YOUTUBE_API_KEY) não está configurada no servidor.',
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
