// Página pública de doação de uma campanha (sem login)
//
// GET /backend/v1/public/campaign/{id}
// Só responde para campanha ATIVA marcada como pública (is_public). Devolve o necessário para a
// página: nome, descrição, meta, quanto já entrou, quantas contribuições, prazo, cor, nome da
// igreja e a chave PIX dos dados da igreja. Nunca devolve nomes de quem contribuiu nem valores
// individuais. Limite de requisições pela regra "/backend/v1/public/" (migração 0064).

routerAdd('GET', '/backend/v1/public/campaign/{id}', (e) => {
  const id = String(e.request.pathValue('id') || '')
  const notFound = () => e.json(404, { message: 'Campanha não encontrada ou encerrada.' })
  if (!/^[a-z0-9]{15}$/.test(id)) return notFound()

  let campaign = null
  try {
    campaign = $app.findRecordById('fin_campaigns', id)
  } catch (_) {}
  if (!campaign || !campaign.getBool('is_public') || campaign.getString('status') !== 'ATIVA') {
    return notFound()
  }
  const churchId = campaign.getString('church_id')

  let raised = 0
  let anonymous = 0
  const people = {}
  const txs = $app.findRecordsByFilter(
    'fin_transactions',
    "campaign_id = {:id} && type = 'ENTRADA' && status != 'ESTORNADO'",
    '',
    20000,
    0,
    { id: id },
  )
  for (const tx of txs) {
    if (tx.getString('church_id') !== churchId) continue
    raised += tx.getInt('amount_cents')
    const person = tx.getString('person_id')
    if (person) people[person] = true
    else anonymous++
  }

  let churchName = ''
  try {
    churchName = $app.findRecordById('churches', churchId).getString('name')
  } catch (_) {}

  let pix = null
  try {
    const s = $app.findFirstRecordByFilter('fin_settings', 'church_id = {:c}', { c: churchId })
    if (s.getString('pix_key')) {
      pix = {
        key: s.getString('pix_key'),
        key_type: s.getString('pix_key_type'),
        name: s.getString('pix_name') || s.getString('legal_name') || churchName,
        city: s.getString('pix_city') || s.getString('city'),
      }
      if (!churchName) churchName = s.getString('legal_name')
    }
  } catch (_) {}

  return e.json(200, {
    id: id,
    name: campaign.getString('name'),
    description: campaign.getString('description'),
    goal_cents: campaign.getInt('goal_cents'),
    raised_cents: raised,
    participants: Object.keys(people).length + anonymous,
    end_date: campaign.getString('end_date'),
    color: campaign.getString('color'),
    church_name: churchName,
    pix: pix,
  })
})
