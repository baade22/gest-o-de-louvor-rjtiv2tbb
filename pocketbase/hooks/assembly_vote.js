// Votação on-line da chapa de uma assembleia — acesso público, sem login.
//
// GET  /backend/v1/assembly-vote/info?key=...  → igreja, assembleia e a chapa (cargos e nomes)
// POST /backend/v1/assembly-vote               → { key, name, cpf, birth_date, choice }
//
// O voto só vale se nome, CPF e data de nascimento batem com uma ficha da igreja, se a pessoa
// vota pelas regras da convocação (situação e idade mínima) e se ainda não votou. Com
// "só presentes" ligado, precisa estar na lista de presença como votante; sem ele, votar
// on-line já coloca a pessoa na lista de presença.
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
  const NOT_FOUND =
    'Não encontramos um membro com esses dados. Confira o nome completo, o CPF e a data de nascimento, ou procure a secretaria da igreja.'

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

  // Ficha: mesmo CPF e mesma data de nascimento, e o nome tem que bater
  let person = null
  try {
    const list = $app.findRecordsByFilter(
      'people',
      "church_id = {:c} && document != ''",
      '',
      5000,
      0,
      { c: churchId },
    )
    for (const p of list) {
      if (digits(p.getString('document')) !== cpf) continue
      if (p.getString('birth_date').slice(0, 10) !== birth) continue
      const real = norm(p.getString('name'))
      const rw = real.split(' ')
      const tw = name.split(' ')
      const same =
        real === name || (rw[0] === tw[0] && rw[rw.length - 1] === tw[tw.length - 1])
      if (same) {
        person = p
        break
      }
    }
  } catch (err) {
    return e.json(500, { message: 'Não foi possível votar agora. Tente de novo em instantes.' })
  }
  if (!person) return e.json(404, { message: NOT_FOUND })

  // Regras da convocação: situação e idade mínima
  let statuses = []
  try {
    statuses = JSON.parse(a.getString('voter_statuses') || '[]') || []
  } catch (_) {}
  if (!Array.isArray(statuses) || statuses.length === 0) statuses = ['MEMBRO']
  if (statuses.indexOf(person.getString('status')) < 0) {
    return e.json(403, {
      message: 'Pelas regras do estatuto, sua situação na igreja não dá direito a voto nesta assembleia.',
    })
  }
  const minAge = a.getInt('voter_min_age')
  if (minAge > 0) {
    const on = a.getString('date').slice(0, 10)
    const by = Number(birth.slice(0, 4))
    const bm = Number(birth.slice(5, 7))
    const bd = Number(birth.slice(8, 10))
    const y = Number(on.slice(0, 4))
    const m = Number(on.slice(5, 7))
    const d = Number(on.slice(8, 10))
    let age = y - by
    if (m < bm || (m === bm && d < bd)) age--
    if (on && age < minAge) {
      return e.json(403, { message: 'Pelas regras do estatuto, a idade mínima para votar é ' + minAge + ' anos.' })
    }
  }

  let attendee = null
  try {
    attendee = $app.findFirstRecordByFilter(
      'assembly_attendees',
      'assembly_id = {:a} && person_id = {:p}',
      { a: a.id, p: person.id },
    )
  } catch (_) {}
  if (a.getBool('vote_only_present') && (!attendee || !attendee.getBool('voter'))) {
    return e.json(403, {
      message: 'Seu nome não está na lista de presença desta assembleia. Procure a secretaria da igreja.',
    })
  }

  try {
    $app.findFirstRecordByFilter(
      'assembly_online_voters',
      'assembly_id = {:a} && person_id = {:p}',
      { a: a.id, p: person.id },
    )
    return e.json(409, { message: 'Seu voto já foi registrado. Cada membro vota uma vez só.' })
  } catch (_) {}

  try {
    $app.runInTransaction((tx) => {
      const voter = new Record(tx.findCollectionByNameOrId('assembly_online_voters'))
      voter.set('church_id', churchId)
      voter.set('assembly_id', a.id)
      voter.set('person_id', person.id)
      tx.save(voter)

      const ballot = new Record(tx.findCollectionByNameOrId('assembly_online_ballots'))
      ballot.set('church_id', churchId)
      ballot.set('assembly_id', a.id)
      ballot.set('choice', choice)
      tx.save(ballot)

      if (!attendee) {
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
    return e.json(409, { message: 'Seu voto já foi registrado. Cada membro vota uma vez só.' })
  }
  const first = person.getString('name').trim().split(/\s+/)[0]
  return e.json(200, { ok: true, first_name: first })
})
