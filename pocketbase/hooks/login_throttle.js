// Trava de login contra força-bruta (ver migração 0085).
//
// Após MAX_FAILS senhas erradas seguidas para o MESMO e-mail, bloqueia novas
// tentativas desse e-mail por LOCK_MINUTES. O contador zera sozinho se o e-mail
// ficar WINDOW_MINUTES sem errar. Um login certo zera na hora.
//
// A chave é o e-mail (nunca o IP): atrás do proxy do Skip o IP pode ser o mesmo
// para todos, e travar por IP derrubaria o login de todos juntos (ver 0042).
// Travar por e-mail no máximo atrasa quem está sob ataque naquela conta — nunca
// o resto da igreja — e corta a força-bruta de senha.
//
// Observação 1: o hook roda ANTES da validação. Se o e-mail nem existe, ainda
// contamos a tentativa, o que também barra varredura de e-mails.
// Observação 2 (JSVM): o PocketBase roda este handler num runtime isolado, então
// TODA constante e helper precisa ficar DENTRO da função — nada do escopo do
// arquivo é visível aqui dentro.

onRecordAuthWithPasswordRequest((e) => {
  const MAX_FAILS = 10 // tentativas erradas antes de travar
  const LOCK_MS = 15 * 60 * 1000 // tempo travado
  const WINDOW_MS = 15 * 60 * 1000 // janela que zera o contador se ficou quieto

  const ident = String(e.identity || '')
    .trim()
    .toLowerCase()

  // sem identificador: deixa o PocketBase responder o erro normal
  if (!ident) {
    e.next()
    return
  }

  const now = Date.now()

  let rec = null
  try {
    rec = $app.findFirstRecordByData('login_attempts', 'ident', ident)
  } catch (_) {
    rec = null
  }

  // já travado?
  if (rec) {
    const lockedUntil = rec.getFloat('locked_until') || 0
    if (lockedUntil > now) {
      throw new ApiError(
        429,
        'Muitas tentativas de login para esta conta. Aguarde alguns minutos e tente novamente.',
        null,
      )
    }
  }

  const registerFailure = () => {
    try {
      let r = rec
      if (!r) {
        const col = $app.findCollectionByNameOrId('login_attempts')
        r = new Record(col)
        r.set('ident', ident)
        r.set('fails', 0)
      }
      const last = r.getFloat('last_fail') || 0
      let fails = r.getFloat('fails') || 0
      // ficou quieto tempo suficiente: começa a contar de novo
      if (now - last > WINDOW_MS) fails = 0
      fails = fails + 1
      r.set('fails', fails)
      r.set('last_fail', now)
      let lockedNow = false
      if (fails >= MAX_FAILS) {
        r.set('locked_until', now + LOCK_MS)
        lockedNow = true
      }
      $app.save(r)
      return lockedNow
    } catch (_) {
      // nunca deixar a contabilidade da trava quebrar o fluxo de login
      return false
    }
  }

  let failed = false
  try {
    e.next()
  } catch (err) {
    failed = true
    const lockedNow = registerFailure()
    if (lockedNow) {
      throw new ApiError(
        429,
        'Muitas tentativas de login para esta conta. Aguarde alguns minutos e tente novamente.',
        null,
      )
    }
    throw err // mantém a resposta original (ex.: 400 credencial inválida)
  }

  // login certo: zera o histórico de falhas
  if (!failed && rec) {
    try {
      $app.delete(rec)
    } catch (_) {
      /* sem problema */
    }
  }
})
