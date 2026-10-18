// Validação dos registros do Financeiro antes de salvar (criação e edição)
// As regras da API só enxergam os valores antigos numa edição; aqui conferimos os valores
// novos: tudo o que um lançamento ou uma contagem aponta precisa ser da mesma igreja, e a
// transferência precisa de uma conta de destino diferente da origem.

onRecordValidate(
  (e) => {
    const rec = e.record
    const churchId = rec.getString('church_id')
    const relations = {
      fin_transactions: {
        account_id: 'fin_accounts',
        to_account_id: 'fin_accounts',
        category_id: 'fin_categories',
        cost_center_id: 'fin_cost_centers',
        person_id: 'people',
        supplier_id: 'fin_suppliers',
        event_id: 'events',
        count_id: 'fin_counts',
      },
      fin_counts: {
        account_id: 'fin_accounts',
        offering_category_id: 'fin_categories',
        event_id: 'events',
      },
    }[rec.collection().name]

    for (const field in relations) {
      const id = rec.getString(field)
      if (!id) continue
      let other = null
      try {
        other = e.app.findRecordById(relations[field], id)
      } catch (_) {}
      if (!other || other.getString('church_id') !== churchId) {
        throw new BadRequestError('Cadastro de outra igreja: ' + field)
      }
    }

    if (rec.collection().name === 'fin_counts' && rec.getString('counted_by')) {
      try {
        const user = e.app.findRecordById('_pb_users_auth_', rec.getString('counted_by'))
        rec.set('counted_by_name', user.getString('name') || user.getString('email'))
      } catch (_) {}
    }

    if (rec.collection().name === 'fin_transactions') {
      const isTransfer = rec.getString('type') === 'TRANSFERENCIA'
      const to = rec.getString('to_account_id')
      if (isTransfer && (!to || to === rec.getString('account_id'))) {
        throw new BadRequestError('Escolha uma conta de destino diferente da de origem.')
      }
      if (!isTransfer && to) {
        rec.set('to_account_id', '')
      }
    }

    e.next()
  },
  'fin_transactions',
  'fin_counts',
)
