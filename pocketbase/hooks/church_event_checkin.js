// Código do comprovante de inscrição (QR de check-in).
//
// Toda inscrição nova em evento da igreja ganha um checkin_code aleatório de 12 letras e
// números. A equipe lê o QR do comprovante na entrada e o app abre /checkin/{código}, que
// busca a inscrição pela API normal (as regras da coleção dizem quem pode). O código é só do
// servidor: a API não deixa o navegador escolher (migração 0069).

onRecordCreate((e) => {
  if (!e.record.getString('checkin_code')) {
    e.record.set(
      'checkin_code',
      $security.randomStringWithAlphabet(12, 'abcdefghjkmnpqrstuvwxyz23456789'),
    )
  }
  e.next()
}, 'church_event_registrations')
