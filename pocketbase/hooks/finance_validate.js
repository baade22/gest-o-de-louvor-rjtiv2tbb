// Validação dos registros do Financeiro antes de salvar (criação e edição)
// As regras da API só enxergam os valores antigos numa edição; aqui conferimos os valores
// novos: tudo o que um lançamento, uma contagem, uma conta a pagar/receber
// ou um movimento do extrato aponta precisa ser da mesma igreja, e a
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
        bill_id: 'fin_bills',
        bank_line_id: 'fin_bank_lines',
      },
      fin_counts: {
        account_id: 'fin_accounts',
        offering_category_id: 'fin_categories',
        event_id: 'events',
      },
      fin_bills: {
        category_id: 'fin_categories',
        cost_center_id: 'fin_cost_centers',
        supplier_id: 'fin_suppliers',
        person_id: 'people',
        account_id: 'fin_accounts',
        paid_account_id: 'fin_accounts',
        transaction_id: 'fin_transactions',
      },
      fin_bank_lines: {
        account_id: 'fin_accounts',
        import_id: 'fin_bank_imports',
        transaction_id: 'fin_transactions',
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
      // Lançamento conciliado com o extrato: valor, conta e tipo só mudam depois de desfazer
      const lineId = rec.getString('bank_line_id')
      if (lineId && !rec.isNew()) {
        const old = rec.original()
        if (
          old.getString('bank_line_id') === lineId &&
          (old.getInt('amount_cents') !== rec.getInt('amount_cents') ||
            old.getString('account_id') !== rec.getString('account_id') ||
            old.getString('to_account_id') !== rec.getString('to_account_id') ||
            old.getString('type') !== rec.getString('type'))
        ) {
          throw new BadRequestError(
            'Lançamento conciliado com o extrato: desfaça a conciliação para mudar valor ou conta.',
          )
        }
      }
    }

    e.next()
  },
  'fin_transactions',
  'fin_counts',
  'fin_bills',
  'fin_bank_lines',
)
