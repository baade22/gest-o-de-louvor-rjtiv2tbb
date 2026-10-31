// Recuperação de acesso ao painel /_/: cria (ou redefine a senha de) um
// super-admin a partir de variáveis de ambiente, sem precisar de terminal no
// servidor nem do e-mail de "esqueci a senha".
//
// Quando as DUAS variáveis existem no ambiente (segredos do Skip):
//   SUPERUSER_BOOTSTRAP_EMAIL
//   SUPERUSER_BOOTSTRAP_PASSWORD
// este hook, a cada inicialização do PocketBase, garante um super-admin com
// esse e-mail e essa senha. Sem as duas variáveis, não faz absolutamente nada.
//
// Segurança: NENHUMA senha fica no repositório — tudo vem dos segredos do Skip
// (o repositório é público). Depois de recuperar o acesso, REMOVA os dois
// segredos no Skip; o hook volta a ser inócuo. Só quem tem acesso aos segredos
// do Skip consegue acioná-lo.
//
// JSVM: todo helper/constante precisa ficar DENTRO do handler (runtime isolado).

onBootstrap((e) => {
  e.next() // deixa o PocketBase terminar de subir (banco pronto) antes de mexer

  try {
    const email = String($os.getenv('SUPERUSER_BOOTSTRAP_EMAIL') || '')
      .trim()
      .toLowerCase()
    const pass = String($os.getenv('SUPERUSER_BOOTSTRAP_PASSWORD') || '')
    if (!email || !pass) return // nada configurado: não faz nada

    const superusers = $app.findCollectionByNameOrId('_superusers')
    let rec = null
    try {
      rec = $app.findAuthRecordByEmail('_superusers', email)
    } catch (_) {
      rec = null
    }
    const criando = !rec
    if (!rec) {
      rec = new Record(superusers)
      rec.setEmail(email)
    }
    rec.setPassword(pass)
    $app.save(rec)
    console.log(
      '[bootstrap_superuser] super-admin ' +
        (criando ? 'criado' : 'senha redefinida') +
        ': ' +
        email,
    )
  } catch (err) {
    console.log('[bootstrap_superuser] ERRO ao configurar super-admin:', err)
  }
})
