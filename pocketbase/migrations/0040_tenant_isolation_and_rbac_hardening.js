// Migração 0040: isolamento multi-igreja (multi-tenant) e reforço de RBAC.
//
// Motivação (auditoria de segurança 2026-10-18):
//   - A maioria das collections de dados usava apenas "@request.auth.id != ''",
//     o que permitia que QUALQUER usuário autenticado de QUALQUER igreja lesse,
//     editasse e apagasse os dados de TODAS as igrejas (vazamento multi-tenant +
//     exposição de dados pessoais de membros / LGPD).
//   - church_members.updateRule tinha o ramo "user_id = @request.auth.id", que
//     deixava o próprio membro alterar seu papel (MUSICO -> MASTER) e o church_id,
//     quebrando todo o controle de acesso. A edição legítima do próprio perfil
//     (telefone) continua permitida e é protegida por um hook de guarda
//     (profile_guard.js) que impede a alteração de campos sensíveis.
//   - audit_logs e notifications ficavam legíveis por qualquer igreja.
//
// Estratégia de baixo risco: as novas regras só REMOVEM o acesso entre igrejas.
// Todo acesso legítimo (dentro da própria igreja do usuário) continua funcionando,
// pois o app sempre opera dentro da igreja ativa do usuário.

migrate(
  (app) => {
    // Membro ativo da MESMA igreja do registro (list/view/escrita de conteúdo).
    const MEMBER_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true'

    // Gestor (MASTER/ADMIN/LIDER) ativo da MESMA igreja do registro.
    const MANAGER_OF_CHURCH =
      MEMBER_OF_CHURCH +
      " && (@collection.church_members.role ?= 'MASTER' || " +
      "@collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"

    // Collections de conteúdo: leitura/escrita para qualquer membro ativo da
    // própria igreja (preserva o comportamento atual do app, só fecha o acesso
    // entre igrejas). deleteRule segue o mesmo princípio.
    const CONTENT_COLLECTIONS = [
      'songs',
      'events',
      'event_songs',
      'event_members',
      'event_tasks',
      'media_assets',
      'song_videos',
      'roles',
      'member_roles',
    ]
    for (const name of CONTENT_COLLECTIONS) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = MEMBER_OF_CHURCH
      col.viewRule = MEMBER_OF_CHURCH
      col.createRule = MEMBER_OF_CHURCH
      col.updateRule = MEMBER_OF_CHURCH
      col.deleteRule = MEMBER_OF_CHURCH
      app.save(col)
    }

    // audit_logs: visíveis só para gestores da própria igreja; ninguém cria/edita
    // pela API (gravação só via hooks com contexto de superusuário). Mantém imutável.
    {
      const col = app.findCollectionByNameOrId('audit_logs')
      col.listRule = MANAGER_OF_CHURCH
      col.viewRule = MANAGER_OF_CHURCH
      col.createRule = null
      col.updateRule = null
      col.deleteRule = null
      app.save(col)
    }

    // notifications: cada usuário só enxerga/gerencia as próprias notificações,
    // e já não pode criar para terceiros (criação passa a ser só via hook).
    {
      const col = app.findCollectionByNameOrId('notifications')
      const OWN = "@request.auth.id != '' && user_id = @request.auth.id"
      col.listRule = OWN
      col.viewRule = OWN
      col.createRule = null
      col.updateRule = OWN
      col.deleteRule = OWN
      app.save(col)
    }

    // users: o cadastro acontece SOMENTE via convite (hook invitations/accept, que
    // grava com contexto de superusuário). Não há tela de auto-cadastro, então a
    // criação direta pela API (createRule público "") é fechada para impedir
    // registro anônimo não autorizado.
    {
      const col = app.findCollectionByNameOrId('_pb_users_auth_')
      col.createRule = null
      app.save(col)
    }

    // churches: um usuário só vê/edita a(s) igreja(s) em que é membro ativo;
    // só gestores alteram; ninguém cria/apaga igreja pela API.
    {
      const col = app.findCollectionByNameOrId('churches')
      const MEMBER_OF_THIS =
        "@request.auth.id != '' && @collection.church_members.church_id ?= id && " +
        '@collection.church_members.user_id ?= @request.auth.id && ' +
        '@collection.church_members.is_active ?= true'
      const MANAGER_OF_THIS =
        MEMBER_OF_THIS +
        " && (@collection.church_members.role ?= 'MASTER' || " +
        "@collection.church_members.role ?= 'ADMIN')"
      col.listRule = MEMBER_OF_THIS
      col.viewRule = MEMBER_OF_THIS
      col.createRule = null
      col.updateRule = MANAGER_OF_THIS
      col.deleteRule = null
      app.save(col)
    }
  },
  (app) => {
    // Rollback: restaura as regras anteriores (apenas autenticação).
    const OLD = "@request.auth.id != ''"
    const BASIC = [
      'songs',
      'events',
      'event_songs',
      'event_members',
      'event_tasks',
      'media_assets',
      'song_videos',
      'roles',
      'member_roles',
      'audit_logs',
    ]
    for (const name of BASIC) {
      try {
        const col = app.findCollectionByNameOrId(name)
        col.listRule = OLD
        col.viewRule = OLD
        col.createRule = OLD
        col.updateRule = name === 'audit_logs' ? null : OLD
        col.deleteRule = name === 'audit_logs' ? null : OLD
        app.save(col)
      } catch (_) {}
    }
    try {
      const col = app.findCollectionByNameOrId('notifications')
      col.listRule = "@request.auth.id != '' && user_id = @request.auth.id"
      col.viewRule = "@request.auth.id != '' && user_id = @request.auth.id"
      col.createRule = OLD
      col.updateRule = "@request.auth.id != '' && user_id = @request.auth.id"
      col.deleteRule = "@request.auth.id != '' && user_id = @request.auth.id"
      app.save(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('churches')
      col.listRule = OLD
      col.viewRule = OLD
      col.createRule = OLD
      col.updateRule = OLD
      col.deleteRule = null
      app.save(col)
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId('_pb_users_auth_')
      col.createRule = ''
      app.save(col)
    } catch (_) {}
  },
)
