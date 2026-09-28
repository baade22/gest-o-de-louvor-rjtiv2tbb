// Hook para validar token de convite e obter dados públicos (Nome da igreja, nome do convidado, email, funções)
// GET /backend/v1/invitations/validate?token=...
// Acesso público (não requer autenticação, pois o usuário ainda vai definir a senha)

routerAdd('GET', '/backend/v1/invitations/validate', (e) => {
  let token = ''
  try {
    if (e.request && e.request.url && typeof e.request.url.query === 'function') {
      token = String(e.request.url.query().get('token') || '').trim()
    }
  } catch (_) {}
  if (!token) {
    try {
      const q = e.requestInfo ? e.requestInfo().query : null
      if (q) token = String(q.token || '').trim()
    } catch (_) {}
  }

  if (!token) {
    return e.json(400, { valid: false, message: 'Token de convite não informado' })
  }

  try {
    const records = $app.findRecordsByFilter('invitations', 'token = {:token}', '', 1, 0, {
      token: token,
    })

    if (records.length === 0) {
      return e.json(404, { valid: false, message: 'Convite não encontrado ou inválido' })
    }

    const inv = records[0]
    let status = inv.getString('status')
    const expiresAtStr = inv.getString('expires_at')

    if (status === 'ACCEPTED') {
      return e.json(400, {
        valid: false,
        status: 'ACCEPTED',
        message: 'Este convite já foi aceito anteriormente. Faça login na plataforma.',
      })
    }

    if (status === 'CANCELLED') {
      return e.json(400, {
        valid: false,
        status: 'CANCELLED',
        message: 'Este convite foi cancelado pela administração da congregação.',
      })
    }

    // Checa expiração
    if (expiresAtStr) {
      const exp = new Date(expiresAtStr.replace(' ', 'T') + 'Z')
      if (exp < new Date()) {
        inv.set('status', 'EXPIRED')
        try {
          $app.save(inv)
        } catch (_) {}
        return e.json(400, {
          valid: false,
          status: 'EXPIRED',
          message: 'Este convite expirou. Solicite ao administrador um novo convite.',
        })
      }
    }

    // Busca dados da igreja
    let churchName = 'LouvorFlow'
    try {
      const church = $app.findRecordById('churches', inv.getString('church_id'))
      churchName = church.getString('name')
    } catch (_) {}

    let opRoles = []
    try {
      const raw = inv.get('operational_roles')
      if (typeof raw === 'string' && raw) {
        opRoles = JSON.parse(raw)
      } else if (Array.isArray(raw)) {
        if (raw.length > 0 && typeof raw[0] === 'number') {
          let str = ''
          for (let b = 0; b < raw.length; b++) str += String.fromCharCode(raw[b])
          opRoles = JSON.parse(str)
        } else {
          opRoles = raw
        }
      }
    } catch (_) {}
    if (!Array.isArray(opRoles)) opRoles = []

    return e.json(200, {
      valid: true,
      invitation_id: inv.id,
      church_id: inv.getString('church_id'),
      church_name: churchName,
      name: inv.getString('name'),
      email: inv.getString('email'),
      role: inv.getString('role'),
      operational_roles: opRoles,
      expires_at: expiresAtStr,
    })
  } catch (err) {
    return e.json(500, { valid: false, message: 'Erro ao validar convite: ' + err.message })
  }
})
