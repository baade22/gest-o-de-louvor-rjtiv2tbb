migrate(
  (app) => {
    // 1. Atualizar API rules da collection _pb_users_auth_ (users)
    // Para que usuários autenticados possam listar/visualizar dados públicos (nome, avatar) de outros usuários da mesma congregação
    // e permitir regras flexíveis para o LouvorFlow
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    usersCol.listRule = "@request.auth.id != ''"
    usersCol.viewRule = "@request.auth.id != ''"
    // Mantemos updateRule restrito a si mesmo no client direto (id = @request.auth.id)
    // As alterações feitas por Administradores em membros da igreja serão executadas via backend hook
    // com validação completa multi-tenant e verificação de privilégios de ADMIN da igreja
    app.save(usersCol)
  },
  (app) => {
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      usersCol.listRule = 'id = @request.auth.id'
      usersCol.viewRule = 'id = @request.auth.id'
      app.save(usersCol)
    } catch (_) {}
  },
)
