// Votação on-line da chapa de uma assembleia — acesso público, sem login.
//
// GET  /backend/v1/assembly-vote/info?key=...  → igreja, assembleia e a chapa (cargos e nomes)
// POST /backend/v1/assembly-vote               → { key, name, cpf, birth_date, choice }
//
// Qualquer pessoa que recebeu o link vota uma vez por CPF (migração 0108: só o hash do CPF
// fica gravado). Se a pessoa tem ficha na igreja, o voto fica ligado a ela e ela entra na
// lista de presença. Com "só presentes" ligado, precisa estar na lista de presença.
// Voto secreto: quem votou e o voto vão para coleções separadas (migração 0107).
// CPF e nascimento não são gravados. Limite por IP na migração 0107.

routerAdd('GET', '/backend/v1/assembly-vote/info', (e) => {
  let key = ''
  try {
    key = String(e.requestInfo().query.key || '').trim()
  } catch (_) {}
  if (!/^[A-Za-z0-9]{20,40}$/.test(key)) {
    return e.json(404, { message: 'Link de votação inválido.' })
  }
  try {
    const found = $app.findRecordsByFilter('assemblies', 'vote_key = {:key}', '', 1, 0, { key: key })
    if (found.length === 0) return e.json(404, { message: 'Link de votação inválido.' })
    const a = found[0]
    let churchName = 'Igreja'
    try {
      churchName = $app.findRecordById('churches', a.getString('church_id')).getString('name')
    } catch (_) {}
    const items = $app.findRecordsByFilter(
      'assembly_items',
      "assembly_id = {:a} && kind != 'DELIBERACAO'",
      'order,created',
      200,
      0,
      { a: a.id },
    )
    const chapa = []
    for (const it of items) {
      const cands = $app.findRecordsByFilter(
        'assembly_candidates',
        'item_id = {:i}',
        'order,created',
        100,
        0,
        { i: it.id },
      )
      const names = []
      for (const c of cands) {
        try {
          names.push($app.findRecordById('people', c.getString('person_id')).getString('name'))
        } catch (_) {}
      }
      chapa.push({ office: it.getString('title'), names: names })
    }
    const open = a.getBool('vote_open') && a.getString('status') !== 'FINALIZADA'
    return e.json(200, {
      church_name: churchName,
      title: a.getString('title'),
      date: a.getString('date').slice(0, 10),
      open: open,
      chapa: chapa,
    })
  } catch (err) {
    return e.json(500, { message: 'Não foi possível abrir a votação agora.' })
  }
})

routerAdd('POST', '/backend/v1/assembly-vote', (e) => {
  const body = e.requestInfo().body || {}
  const text = (v, max) =>
    String(v == null ? '' : v)
      .trim()
      .slice(0, max)
  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const digits = (s) => String(s || '').replace(/\D/g, '')

  // Campo invisível no formulário: robôs preenchem, pessoas não
  if (text(body.website, 200) !== '') return e.json(200, { ok: true })

  const key = text(body.key, 40)
  if (!/^[A-Za-z0-9]{20,40}$/.test(key)) return e.json(404, { message: 'Link de votação inválido.' })
  const name = norm(text(body.name, 200))
  const cpf = digits(text(body.cpf, 20))
  const birth = text(body.birth_date, 10)
  const choice = text(body.choice, 12)
  if (name.split(' ').length < 2) return e.json(400, { message: 'Informe o nome completo.' })
  if (cpf.length !== 11) return e.json(400, { message: 'Confira o CPF (11 números).' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth))
    return e.json(400, { message: 'Informe a data de nascimento.' })
  if (['SIM', 'NAO', 'ABSTENCAO'].indexOf(choice) < 0)
    return e.json(400, { message: 'Escolha SIM, NÃO ou ABSTENÇÃO.' })

  let a
  try {
    const found = $app.findRecordsByFilter('assemblies', 'vote_key = {:key}', '', 1, 0, { key: key })
    if (found.length === 0) return e.json(404, { message: 'Link de votação inválido.' })
    a = found[0]
  } catch (err) {
    return e.json(500, { message: 'Não foi possível votar agora. Tente de novo em instantes.' })
  }
  if (!a.getBool('vote_open') || a.getString('status') === 'FINALIZADA') {
    return e.json(403, { message: 'A votação está encerrada.' })
  }
  const churchId = a.getString('church_id')

  // Qualquer pessoa que recebeu o link vota (pedido do Pedro, 22/11/2026). O CPF só serve para
  // impedir voto duplicado: grava-se um hash dele, nunca o número. Se a pessoa tem ficha na
  // igreja (nome bate e, quando a ficha tem, CPF e nascimento também), o voto fica ligado à
  // ficha e ela entra na lista de presença.
  const cpfOk = (() => {
    if (/^(\d)\1{10}$/.test(cpf)) return false
    const calc = (n) => {
      let sum = 0
      for (let i = 0; i < n; i++) sum += Number(cpf[i]) * (n + 1 - i)
      const r = (sum * 10) % 11
      return r === 10 ? 0 : r
    }
    return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
  })()
  if (!cpfOk) return e.json(400, { message: 'Confira o CPF: o número não é válido.' })
  const cpfHash = $security.sha256(a.id + ':' + cpf)

  let person = null
  try {
    const list = $app.findRecordsByFilter('people', 'church_id = {:c}', '', 10000, 0, {
      c: churchId,
    })
    const tw = name.split(' ')
    const matches = []
    for (const p of list) {
      const real = norm(p.getString('name'))
      const rw = real.split(' ')
      const same =
        real === name || (rw[0] === tw[0] && rw[rw.length - 1] === tw[tw.length - 1])
      if (!same) continue
      const doc = digits(p.getString('document'))
      const fb = p.getString('birth_date').slice(0, 10)
      if (doc && doc !== cpf) continue
      if (fb && fb !== birth) continue
      matches.push({ p: p, strong: !!doc })
    }
    const strong = matches.filter((m) => m.strong)
    if (strong.length === 1) person = strong[0].p
    else if (strong.length === 0 && matches.length === 1) person = matches[0].p
  } catch (_) {}

  let attendee = null
  if (person) {
    try {
      attendee = $app.findFirstRecordByFilter(
        'assembly_attendees',
        'assembly_id = {:a} && person_id = {:p}',
        { a: a.id, p: person.id },
      )
    } catch (_) {}
  }
  if (a.getBool('vote_only_present') && (!attendee || !attendee.getBool('voter'))) {
    return e.json(403, {
      message: 'Seu nome não está na lista de presença desta assembleia. Procure a secretaria da igreja.',
    })
  }

  const ALREADY = 'Já existe um voto registrado com este CPF. Cada pessoa vota uma vez só.'
  try {
    $app.findFirstRecordByFilter(
      'assembly_online_voters',
      'assembly_id = {:a} && cpf_hash = {:h}',
      { a: a.id, h: cpfHash },
    )
    return e.json(409, { message: ALREADY })
  } catch (_) {}
  if (person) {
    try {
      $app.findFirstRecordByFilter(
        'assembly_online_voters',
        'assembly_id = {:a} && person_id = {:p}',
        { a: a.id, p: person.id },
      )
      return e.json(409, { message: 'Seu voto já foi registrado. Cada pessoa vota uma vez só.' })
    } catch (_) {}
  }

  const typedName = text(body.name, 200).replace(/\s+/g, ' ')
  try {
    $app.runInTransaction((tx) => {
      const voter = new Record(tx.findCollectionByNameOrId('assembly_online_voters'))
      voter.set('church_id', churchId)
      voter.set('assembly_id', a.id)
      voter.set('person_id', person ? person.id : '')
      voter.set('name', person ? person.getString('name') : typedName)
      voter.set('cpf_hash', cpfHash)
      tx.save(voter)

      const ballot = new Record(tx.findCollectionByNameOrId('assembly_online_ballots'))
      ballot.set('church_id', churchId)
      ballot.set('assembly_id', a.id)
      ballot.set('choice', choice)
      tx.save(ballot)

      if (person && !attendee) {
        // Horário de Recife (UTC-3) na lista de presença
        const t = new Date(Date.now() - 3 * 3600 * 1000)
        const hh = String(t.getUTCHours()).padStart(2, '0')
        const mm = String(t.getUTCMinutes()).padStart(2, '0')
        const at = new Record(tx.findCollectionByNameOrId('assembly_attendees'))
        at.set('church_id', churchId)
        at.set('assembly_id', a.id)
        at.set('person_id', person.id)
        at.set('voter', true)
        at.set('arrived', hh + ':' + mm)
        tx.save(at)
      }
    })
  } catch (err) {
    // Dois envios ao mesmo tempo: o índice único segura o segundo
    return e.json(409, { message: ALREADY })
  }
  const first = typedName.split(' ')[0]
  return e.json(200, { ok: true, first_name: first })
})
