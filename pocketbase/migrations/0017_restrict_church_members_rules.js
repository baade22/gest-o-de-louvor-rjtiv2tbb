migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('church_members')

    // Regras de API reforçadas para multi-tenant estrito:
    // list/view: o próprio usuário vendo seu vínculo OU membros ativos da mesma igreja
    col.listRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true)"

    col.viewRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true)"

    // create: apenas ADMIN ou LIDER ativo da igreja do registro que está sendo criado
    col.createRule =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"

    // update: o próprio usuário atualizando dados pessoais (ex: perfil) OU ADMIN/LÍDER ativo da mesma igreja
    col.updateRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || (@collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')))"

    // delete: apenas ADMIN ou LIDER ativo da mesma igreja
    col.deleteRule =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('church_members')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    } catch (_) {}
  },
)
