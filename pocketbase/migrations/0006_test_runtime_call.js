migrate(
  (app) => {
    try {
      const user = app.findAuthRecordByEmail('_pb_users_auth_', 'pedro_baade@hotmail.com')
      const pbUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

      const loginRes = $http.send({
        url: pbUrl + '/api/collections/users/auth-with-password',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: 'pedro_baade@hotmail.com',
          password: 'Skip@Pass',
        }),
        timeout: 10,
      })

      const token = loginRes.json ? loginRes.json.token : ''

      if (token) {
        // 1. Testa GET /backend/v1/integrations
        const listRes = $http.send({
          url: pbUrl + '/backend/v1/integrations?church_id=8minai50ybqzkek',
          method: 'GET',
          headers: { Authorization: token },
          timeout: 10,
        })

        // 2. Testa GET /backend/v1/youtube/search
        const searchRes = $http.send({
          url: pbUrl + '/backend/v1/youtube/search?q=Bondade&church_id=8minai50ybqzkek',
          method: 'GET',
          headers: { Authorization: token },
          timeout: 15,
        })

        const item0 = (listRes.json && listRes.json.items && listRes.json.items[0]) || {}
        const diag = {
          listStatus: listRes.statusCode,
          has_credentials: item0.has_credentials,
          masked_key: item0.masked_key,
          searchStatus: searchRes.statusCode,
          searchCode: searchRes.json ? searchRes.json.code : null,
          searchItemsCount:
            searchRes.json && searchRes.json.items ? searchRes.json.items.length : 0,
          firstVideoTitle:
            searchRes.json && searchRes.json.items && searchRes.json.items[0]
              ? searchRes.json.items[0].title
              : null,
        }

        const r = app.findFirstRecordByData('integrations', 'church_id', '8minai50ybqzkek')
        r.set('last_error_message', JSON.stringify(diag).substring(0, 500))
        app.save(r)
      }
    } catch (err) {
      try {
        const r = app.findFirstRecordByData('integrations', 'church_id', '8minai50ybqzkek')
        r.set('last_error_message', 'ERR: ' + err.message)
        app.save(r)
      } catch (_) {}
    }
  },
  (app) => {},
)
