// Perfis de acesso: travas por campo, onde a regra da coleção não basta.
//
// A regra deixa passar quem tem uma ação "estreita" e este hook confere que a pessoa só
// mudou os campos dessa ação:
// - inscrições de evento: quem só dá baixa (eventos.pagamentos.baixa) muda só o pagamento;
//   quem só faz check-in (eventos.checkin.fazer) muda só a presença;
// - escala (event_members): quem só confirma a própria escala muda só a resposta;
// - pessoas: quem só muda a situação (membresia.pessoas.situacao) ou só acompanha
//   visitantes (membresia.acompanhamento.alterar) muda só esses campos.
// MASTER e as gravações internas dos hooks passam direto.

function accessFieldGuard(e) {
  const auth = e.auth
  if (!auth || auth.collection().name !== 'users') {
    e.next()
    return
  }
  const rec = e.record
  const orig = rec.original()
  const name = rec.collection().name
  let caller = null
  try {
    caller = e.app.findFirstRecordByFilter(
      'church_members',
      'church_id = {:c} && user_id = {:u} && is_active = true',
      { c: rec.getString('church_id'), u: auth.id },
    )
  } catch (_) {}
  if (!caller || caller.getString('role') === 'MASTER') {
    e.next()
    return
  }
  let perms = []
  try {
    perms = JSON.parse(caller.getString('permissions') || '[]') || []
  } catch (_) {}
  const has = (k) => perms.indexOf(k) !== -1

  // Campos que a pessoa pode mudar; null = todos
  let allowed = null
  if (name === 'church_event_registrations') {
    if (!has('eventos.inscricoes.alterar')) {
      allowed = []
      if (has('eventos.pagamentos.baixa')) allowed.push('paid', 'paid_amount', 'payment_method')
      if (has('eventos.checkin.fazer')) allowed.push('attended', 'attended_at', 'checked_out_at')
    }
  } else if (name === 'event_members') {
    if (!has('louvor.escalas.alterar')) allowed = ['status', 'response_at', 'decline_reason']
  } else if (name === 'people') {
    if (!has('membresia.pessoas.alterar') && !has('financeiro.contribuintes.alterar')) {
      allowed = []
      if (has('membresia.pessoas.situacao')) allowed.push('status', 'is_active')
      if (has('membresia.acompanhamento.alterar')) {
        allowed.push('followup_stage', 'followup_owner', 'followup_since')
      }
    }
  }

  if (allowed !== null) {
    const fields = rec.collection().fields.fieldNames()
    for (const f of fields) {
      if (f === 'id' || f === 'created' || f === 'updated' || allowed.indexOf(f) !== -1) continue
      if (rec.getString(f) !== orig.getString(f)) {
        throw new ForbiddenError('Seu perfil de acesso não permite mudar este campo (' + f + ').')
      }
    }
  }
  e.next()
}

onRecordUpdateRequest(accessFieldGuard, 'church_event_registrations', 'event_members', 'people')
