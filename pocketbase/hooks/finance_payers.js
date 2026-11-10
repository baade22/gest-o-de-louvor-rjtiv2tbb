// Quem pagou (Financeiro): CPF/CNPJ do extrato levado para a entrada e vínculo com o cadastro.
//
// - Entrada conciliada com um movimento do extrato ganha payer_doc/payer_name do movimento
//   (CPF/CNPJ e nome que o banco mandou; sem documento, o nome que o extrato traz).
// - Se a entrada não tem pessoa, não é anônima e já existe alguém em Membros com esse CPF/CNPJ,
//   a entrada passa a ser dessa pessoa.
// - Quando alguém é cadastrado (ou ganha CPF no cadastro), as entradas de antes com esse
//   CPF/CNPJ e sem pessoa passam a ser dela.
// Nada aqui cria pessoa: quem não tem cadastro só aparece nos relatórios do Financeiro.

// Antes de gravar a entrada: completa o pagador e a pessoa
onRecordCreate((e) => {
  const tx = e.record
  if (tx.getString('type') !== 'ENTRADA') return e.next()
  const lineId = tx.getString('bank_line_id')
  if (lineId && !tx.getString('payer_doc') && !tx.getString('payer_name')) {
    try {
      const line = e.app.findRecordById('fin_bank_lines', lineId)
      const doc = line.getString('counterparty_doc')
      tx.set('payer_doc', doc)
      tx.set(
        'payer_name',
        (doc ? line.getString('counterparty_name') : '') || line.getString('counterparty'),
      )
    } catch (_) {}
  }
  const doc = tx.getString('payer_doc')
  if (doc && !tx.getString('person_id') && !tx.getBool('is_anonymous')) {
    try {
      const match = e.app
        .findRecordsByFilter('people', "church_id = {:c} && document != ''", '', 0, 0, {
          c: tx.getString('church_id'),
        })
        .filter((p) => String(p.getString('document')).replace(/\D/g, '') === doc)
      if (match.length === 1) tx.set('person_id', match[0].id)
    } catch (_) {}
  }
  return e.next()
}, 'fin_transactions')

onRecordUpdate((e) => {
  const tx = e.record
  if (tx.getString('type') !== 'ENTRADA') return e.next()
  const lineId = tx.getString('bank_line_id')
  if (lineId && !tx.getString('payer_doc') && !tx.getString('payer_name')) {
    try {
      const line = e.app.findRecordById('fin_bank_lines', lineId)
      const doc = line.getString('counterparty_doc')
      tx.set('payer_doc', doc)
      tx.set(
        'payer_name',
        (doc ? line.getString('counterparty_name') : '') || line.getString('counterparty'),
      )
    } catch (_) {}
  }
  const doc = tx.getString('payer_doc')
  if (doc && !tx.getString('person_id') && !tx.getBool('is_anonymous')) {
    try {
      const match = e.app
        .findRecordsByFilter('people', "church_id = {:c} && document != ''", '', 0, 0, {
          c: tx.getString('church_id'),
        })
        .filter((p) => String(p.getString('document')).replace(/\D/g, '') === doc)
      if (match.length === 1) tx.set('person_id', match[0].id)
    } catch (_) {}
  }
  return e.next()
}, 'fin_transactions')

// O banco mandou o CPF/CNPJ depois (movimento gravado antes): leva para a entrada já conciliada
onRecordAfterUpdateSuccess((e) => {
  const line = e.record
  const doc = line.getString('counterparty_doc')
  const before = line.original() ? line.original().getString('counterparty_doc') : ''
  const txId = line.getString('transaction_id')
  if (doc && doc !== before && txId) {
    try {
      const tx = e.app.findRecordById('fin_transactions', txId)
      if (tx.getString('type') === 'ENTRADA' && !tx.getString('payer_doc')) {
        tx.set('payer_doc', doc)
        tx.set('payer_name', line.getString('counterparty_name'))
        e.app.save(tx)
      }
    } catch (err) {
      console.log('finance_payers: ' + err)
    }
  }
  e.next()
}, 'fin_bank_lines')

// Pessoa cadastrada (ou que ganhou CPF/CNPJ): as entradas de antes com esse documento são dela
onRecordAfterCreateSuccess((e) => {
  const person = e.record
  const doc = String(person.getString('document')).replace(/\D/g, '')
  const before = person.original()
    ? String(person.original().getString('document')).replace(/\D/g, '')
    : ''
  if ((doc.length === 11 || doc.length === 14) && doc !== before) {
    try {
      const txs = e.app.findRecordsByFilter(
        'fin_transactions',
        "church_id = {:c} && payer_doc = {:d} && person_id = '' && is_anonymous = false && type = 'ENTRADA'",
        '',
        0,
        0,
        { c: person.getString('church_id'), d: doc },
      )
      for (const tx of txs) {
        tx.set('person_id', person.id)
        e.app.save(tx)
      }
    } catch (err) {
      console.log('finance_payers: ' + err)
    }
  }
  e.next()
}, 'people')

onRecordAfterUpdateSuccess((e) => {
  const person = e.record
  const doc = String(person.getString('document')).replace(/\D/g, '')
  const before = person.original()
    ? String(person.original().getString('document')).replace(/\D/g, '')
    : ''
  if ((doc.length === 11 || doc.length === 14) && doc !== before) {
    try {
      const txs = e.app.findRecordsByFilter(
        'fin_transactions',
        "church_id = {:c} && payer_doc = {:d} && person_id = '' && is_anonymous = false && type = 'ENTRADA'",
        '',
        0,
        0,
        { c: person.getString('church_id'), d: doc },
      )
      for (const tx of txs) {
        tx.set('person_id', person.id)
        e.app.save(tx)
      }
    } catch (err) {
      console.log('finance_payers: ' + err)
    }
  }
  e.next()
}, 'people')
