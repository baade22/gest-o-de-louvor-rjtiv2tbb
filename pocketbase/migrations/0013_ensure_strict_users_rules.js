migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    usersCol.listRule = 'id = @request.auth.id'
    usersCol.viewRule = 'id = @request.auth.id'
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
