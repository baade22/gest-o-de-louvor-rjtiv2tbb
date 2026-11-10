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
        campaign_id: 'fin_campaigns',
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
        campaign_id: 'fin_campaigns',
      },
      fin_bank_lines: {
        account_id: 'fin_accounts',
        import_id: 'fin_bank_imports',
        transaction_id: 'fin_transactions',
      },
      fin_bank_connections: {
        account_id: 'fin_accounts',
        invest_account_id: 'fin_accounts',
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

    // Grupo totalizador do plano de contas só soma: lançamento escolhe uma categoria de baixo
    const catFields = {
      fin_transactions: ['category_id'],
      fin_bills: ['category_id'],
      fin_counts: ['offering_category_id'],
    }[rec.collection().name]
    for (const field of catFields || []) {
      const id = rec.getString(field)
      if (!id) continue
      let isGroup = false
      try {
        isGroup = e.app.findRecordById('fin_categories', id).getBool('is_group')
      } catch (_) {}
      if (isGroup) throw new BadRequestError('Escolha uma categoria, não um grupo.')
    }

    if (rec.collection().name === 'fin_counts' && rec.getString('counted_by')) {
      try {
        const user = e.app.findRecordById('_pb_users_auth_', rec.getString('counted_by'))
        rec.set('counted_by_name', user.getString('name') || user.getString('email'))
      } catch (_) {}
    }

    if (rec.collection().name === 'fin_bank_connections') {
      if (
        rec.getString('provider') === 'BRADESCO' &&
        (!rec.getString('branch') || !rec.getString('account_number'))
      ) {
        throw new BadRequestError('Informe a agência e a conta do Bradesco, sem o dígito.')
      }
      // Conta de aplicação (Invest Fácil): só no Bradesco, outra conta, sem conexão própria
      const inv = rec.getString('invest_account_id')
      if (inv) {
        if (rec.getString('provider') !== 'BRADESCO') rec.set('invest_account_id', '')
        else {
          if (inv === rec.getString('account_id')) {
            throw new BadRequestError('A conta da aplicação precisa ser outra conta.')
          }
          const taken = e.app.findRecordsByFilter(
            'fin_bank_connections',
            'id != {:id} && (account_id = {:a} || invest_account_id = {:a})',
            '',
            1,
            0,
            { id: rec.id || '-', a: inv },
          )
          if (taken.length) {
            throw new BadRequestError('A conta da aplicação já está ligada a outra conexão.')
          }
        }
      }
      // Uma conta usada como aplicação de outra conexão não ganha conexão própria
      const own = e.app.findRecordsByFilter(
        'fin_bank_connections',
        'id != {:id} && invest_account_id = {:a}',
        '',
        1,
        0,
        { id: rec.id || '-', a: rec.getString('account_id') },
      )
      if (own.length) {
        throw new BadRequestError('Esta conta já recebe a aplicação de outra conexão.')
      }
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
      // (transferência: o lado de destino fica em to_bank_line_id)
      const lineId = rec.getString('bank_line_id') || rec.getString('to_bank_line_id')
      if (lineId && !rec.isNew()) {
        const old = rec.original()
        if (
          (old.getString('bank_line_id') === lineId ||
            old.getString('to_bank_line_id') === lineId) &&
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
  'fin_bank_connections',
)

// Plano de contas em árvore: o nível pai é sempre um grupo da mesma igreja e do mesmo tipo
// (entrada/saída), sem voltas; grupo com categorias dentro, ou categoria já usada, não troca de
// papel.
onRecordValidate((e) => {
  const rec = e.record
  const churchId = rec.getString('church_id')
  const parentId = rec.getString('parent_id')
  if (parentId) {
    if (parentId === rec.id) throw new BadRequestError('O nível pai não pode ser ele mesmo.')
    let p = null
    try {
      p = e.app.findRecordById('fin_categories', parentId)
    } catch (_) {}
    if (!p || p.getString('church_id') !== churchId) {
      throw new BadRequestError('Nível pai não encontrado.')
    }
    if (!p.getBool('is_group')) throw new BadRequestError('O nível pai precisa ser um grupo.')
    if (p.getString('direction') !== rec.getString('direction')) {
      throw new BadRequestError('O nível pai precisa ser do mesmo tipo (entrada ou saída).')
    }
    // Sem voltas: subir pelos pais não pode chegar nele mesmo
    let cur = p
    for (let i = 0; i < 20 && cur; i++) {
      if (cur.id === rec.id) throw new BadRequestError('Esse nível pai criaria uma volta.')
      const up = cur.getString('parent_id')
      if (!up) break
      try {
        cur = e.app.findRecordById('fin_categories', up)
      } catch (_) {
        cur = null
      }
    }
  }
  if (!rec.isNew()) {
    const old = rec.original()
    if (old.getBool('is_group') && !rec.getBool('is_group')) {
      const kids = e.app.findRecordsByFilter('fin_categories', 'parent_id = {:id}', '', 1, 0, {
        id: rec.id,
      })
      if (kids.length) {
        throw new BadRequestError('Tire as categorias de dentro do grupo antes.')
      }
    }
    if (!old.getBool('is_group') && rec.getBool('is_group')) {
      const used = e.app.findRecordsByFilter('fin_transactions', 'category_id = {:id}', '', 1, 0, {
        id: rec.id,
      })
      if (used.length) {
        throw new BadRequestError('Esta categoria já tem lançamentos e não pode virar grupo.')
      }
    }
    if (old.getString('direction') !== rec.getString('direction')) {
      const kids = e.app.findRecordsByFilter('fin_categories', 'parent_id = {:id}', '', 1, 0, {
        id: rec.id,
      })
      if (kids.length) throw new BadRequestError('Grupo com categorias não muda de tipo.')
    }
  }
  e.next()
}, 'fin_categories')
