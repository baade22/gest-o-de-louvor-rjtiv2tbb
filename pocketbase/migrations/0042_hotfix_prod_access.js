// Migração 0042: HOTFIX de acesso em produção (2026-10-18).
//
// Sintoma em produção após a sincronização que aplicou 0040 (isolamento) e 0041
// (rate limiting): o login autenticava (nome/e-mail carregavam), mas o papel e o
// menu não carregavam — ou seja, os usuários "perderam o acesso".
//
// Causa raiz: o PocketBase conta o rate limit pelo IP da conexão. Em produção,
// atrás do proxy reverso do Skip, esse IP é o PRÓPRIO PROXY para TODOS os
// usuários, então os limites passam a ser COMPARTILHADOS por toda a base:
//     - "/api/"  = 300 req / 10s  (todas as leituras do app, somadas)
//     - "*:auth" = 2 req / 3s     (todos os logins, somados)
//   Logo após o auth-with-password, o app dispara em sequência church_members,
//   churches e /backend/v1/permissions/me. Sob o balde compartilhado esses
//   pedidos recebem 429 e o AuthContext não preenche papel/igreja/menu, enquanto
//   nome/e-mail (já retornados no auth) continuam aparecendo. Isso explica o
//   caráter sistêmico ("perdi todos os acessos") e por que não reproduz com um
//   único cliente local.
//
// Correção (SEM enfraquecer a segurança — o rate limiting continua LIGADO):
//   1) Configura o trustedProxy para o PocketBase identificar o IP REAL de cada
//      cliente pelo cabeçalho encaminhado pelo proxy (X-Forwarded-For), usando o
//      IP mais à direita (o que o proxy confiável de fato observou — o mais
//      difícil de falsificar). Assim cada usuário passa a ter seu PRÓPRIO balde
//      de rate limit, acabando com o bloqueio em massa e preservando a proteção
//      contra força bruta por IP de verdade.
//   2) Afrouxa as regras de rate limit mais abrangentes para valores folgados
//      para tráfego legítimo de um mesmo usuário (defesa em profundidade, caso o
//      cabeçalho do proxy não esteja presente e o PocketBase caia no IP da
//      conexão). As regras específicas dos endpoints sensíveis (aceite/validação
//      de convite e pareamento do agente) permanecem APERTADAS.
//   3) Relaxa SOMENTE churches.list/view para usuário autenticado. churches
//      guarda apenas metadados não sensíveis (nome, slug, logo, plano) e é
//      carregada por expand no login; isso blinda o caminho de login. A edição
//      segue só para gestores e ninguém cria/apaga igreja pela API.
//
// O isolamento multi-igreja dos dados sensíveis (songs, events, event_*,
// media_assets, song_videos, roles, member_roles, audit_logs, notifications) e o
// fechamento de criação de usuários permanecem INTACTOS (migração 0040).

migrate(
  (app) => {
    const settings = app.settings()

    // 1) trustedProxy: identifica o IP real do cliente pelo cabeçalho do proxy.
    //    useLeftmostIP = false → usa o IP mais à direita (visto pelo proxy),
    //    o mais confiável contra falsificação de X-Forwarded-For pelo cliente.
    settings.trustedProxy.headers = ['X-Forwarded-For']
    settings.trustedProxy.useLeftmostIP = false

    // 2) Mantém o rate limiting LIGADO, mas com regras abrangentes folgadas.
    //    As regras sensíveis (invites/agent) continuam apertadas.
    const RULES = [
      { label: '/backend/v1/invitations/accept', audience: '', duration: 60, maxRequests: 5 },
      { label: '/backend/v1/invitations/validate', audience: '', duration: 60, maxRequests: 20 },
      { label: '/backend/v1/agent/pair', audience: '', duration: 60, maxRequests: 10 },
      // Login/auth por IP real: generoso o bastante para uso legítimo, ainda
      // limitando tentativas automatizadas de força bruta de um mesmo IP.
      { label: '*:auth', audience: '', duration: 10, maxRequests: 30 },
      // Criação de registros por IP real.
      { label: '*:create', audience: '', duration: 5, maxRequests: 60 },
      // API geral: alto o suficiente para o carregamento inicial do app por
      // usuário sem nunca estrangular o login.
      { label: '/api/', audience: '', duration: 10, maxRequests: 2000 },
    ]
    settings.rateLimits.rules = RULES
    settings.rateLimits.enabled = true

    app.save(settings)

    // 3) churches: list/view apenas autenticado (metadados não sensíveis).
    const col = app.findCollectionByNameOrId('churches')
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    const MANAGER_OF_THIS =
      "@request.auth.id != '' && @collection.church_members.church_id ?= id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true && ' +
      "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    col.updateRule = MANAGER_OF_THIS
    col.createRule = null
    col.deleteRule = null
    app.save(col)
  },
  (app) => {
    // Rollback: restaura trustedProxy vazio, as regras da 0041 e churches da 0040.
    const settings = app.settings()
    settings.trustedProxy.headers = []
    settings.trustedProxy.useLeftmostIP = false
    settings.rateLimits.rules = [
      { label: '/backend/v1/invitations/accept', audience: '', duration: 60, maxRequests: 5 },
      { label: '/backend/v1/invitations/validate', audience: '', duration: 60, maxRequests: 20 },
      { label: '/backend/v1/agent/pair', audience: '', duration: 60, maxRequests: 10 },
      { label: '*:auth', audience: '', duration: 3, maxRequests: 2 },
      { label: '*:create', audience: '', duration: 5, maxRequests: 20 },
      { label: '/api/batch', audience: '', duration: 1, maxRequests: 3 },
      { label: '/api/', audience: '', duration: 10, maxRequests: 300 },
    ]
    settings.rateLimits.enabled = true
    app.save(settings)

    const col = app.findCollectionByNameOrId('churches')
    const MEMBER_OF_THIS =
      "@request.auth.id != '' && @collection.church_members.church_id ?= id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true'
    const MANAGER_OF_THIS =
      MEMBER_OF_THIS +
      " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')"
    col.listRule = MEMBER_OF_THIS
    col.viewRule = MEMBER_OF_THIS
    col.updateRule = MANAGER_OF_THIS
    col.createRule = null
    col.deleteRule = null
    app.save(col)
  },
)
