// Migração 0085: trava de login (defesa de aplicação contra força-bruta).
//
// Motivo (pentest 2026-10-31): uma rajada de 45 logins simultâneos com senha
// falsa NÃO foi bloqueada em produção — o rate limit por IP do PocketBase não
// isola os clientes atrás do proxy do Skip. Esta coleção guarda as tentativas
// erradas por IDENTIFICADOR (e-mail), e o hook login_throttle trava novas
// tentativas por alguns minutos quando passam do limite.
//
// A chave é sempre o e-mail, NUNCA o IP: se o proxy entregar um IP só para
// todos (ver 0042), travar por IP derrubaria o login de todo mundo junto.
//
// Sem acesso pela API (todas as regras null): só os hooks (superusuário) leem
// e escrevem aqui. Guarda datas como épocas em milissegundos (número) para a
// comparação no hook ser trivial e não depender de parse de data.
//
// Rollback: remove a coleção.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('login_attempts')
      return // já existe (Skip pode ter aplicado antes)
    } catch (_) {
      // segue e cria
    }

    const col = new Collection({
      name: 'login_attempts',
      type: 'base',
      // nenhum acesso pela API — só os hooks (superusuário)
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'ident', type: 'text', required: true, max: 255 },
        { name: 'fails', type: 'number', min: 0 },
        { name: 'locked_until', type: 'number' }, // época em ms; 0/ausente = não travado
        { name: 'last_fail', type: 'number' }, // época em ms da última falha
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_login_attempts_ident ON login_attempts (ident)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('login_attempts')
      app.delete(col)
    } catch (_) {
      // já não existe
    }
  },
)
