// Migração 0065: RBAC de edição do conteúdo (fecha o achado M3 da auditoria 2026-10-25).
//
// Até aqui, QUALQUER membro ativo da igreja podia criar/editar/apagar songs, events,
// event_songs, event_members, event_tasks, media_assets, song_videos, roles e
// member_roles pela API (regra MEMBER_OF_CHURCH da migração 0040). A interface já
// esconde esses botões de quem não é gestor, mas o dado NÃO estava protegido no
// servidor — ou seja, "só visualizar" não valia via API (um membro comum podia, por
// fora da tela, apagar o repertório, eventos, escalas, etc.).
//
// Esta migração alinha a ESCRITA ao que a própria UI já permite (canManageContent =
// MASTER/ADMIN/LIDER), sem mexer na LEITURA:
//   - Conteúdo de louvor/culto (songs, song_videos, events, event_songs, event_tasks):
//     criar/editar/apagar só por GESTOR (MASTER/ADMIN/LIDER).
//   - media_assets: GESTOR ou quem tem a função MIDIA (incluir/excluir mídia).
//   - event_members (escala): criar/apagar só GESTOR; ATUALIZAR por GESTOR ou pelo
//     próprio membro da escala (confirmar/recusar a própria presença — isMe || canEdit).
//   - roles / member_roles (taxonomia de funções): só GESTOR.
// Leitura (list/view) continua para qualquer membro ativo da MESMA igreja (inalterada).
// O isolamento entre igrejas da 0040 é preservado. O rollback volta ao estado da 0040.

migrate(
  (app) => {
    const MEMBER_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true'

    const MANAGER_ROLE =
      " && (@collection.church_members.role ?= 'MASTER' || " +
      "@collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"

    const MANAGER_OF_CHURCH = MEMBER_OF_CHURCH + MANAGER_ROLE

    // Gestor OU quem tem a função operacional MIDIA (para mídia do culto).
    const MIDIA_OR_MANAGER =
      MEMBER_OF_CHURCH +
      " && (@collection.church_members.role ?= 'MASTER' || " +
      "@collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER' || " +
      '@collection.church_members.operational_roles ?~ \'"MIDIA"\')'

    // Atualização de escala: gestor OU o próprio membro dono da linha (confirma/recusa).
    const MEMBERS_UPDATE =
      MEMBER_OF_CHURCH +
      " && (@collection.church_members.role ?= 'MASTER' || " +
      "@collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER' || " +
      'member_id.user_id ?= @request.auth.id)'

    // Conteúdo cuja edição é de gestor (igual ao canManageContent da UI).
    const MANAGER_WRITE = ['songs', 'song_videos', 'events', 'event_songs', 'event_tasks']
    for (const name of MANAGER_WRITE) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = MEMBER_OF_CHURCH
      col.viewRule = MEMBER_OF_CHURCH
      col.createRule = MANAGER_OF_CHURCH
      col.updateRule = MANAGER_OF_CHURCH
      col.deleteRule = MANAGER_OF_CHURCH
      app.save(col)
    }

    // media_assets: gestor ou função MIDIA.
    {
      const col = app.findCollectionByNameOrId('media_assets')
      col.listRule = MEMBER_OF_CHURCH
      col.viewRule = MEMBER_OF_CHURCH
      col.createRule = MIDIA_OR_MANAGER
      col.updateRule = MIDIA_OR_MANAGER
      col.deleteRule = MIDIA_OR_MANAGER
      app.save(col)
    }

    // event_members: só gestor cria/apaga; o próprio membro pode atualizar a sua escala.
    {
      const col = app.findCollectionByNameOrId('event_members')
      col.listRule = MEMBER_OF_CHURCH
      col.viewRule = MEMBER_OF_CHURCH
      col.createRule = MANAGER_OF_CHURCH
      col.updateRule = MEMBERS_UPDATE
      col.deleteRule = MANAGER_OF_CHURCH
      app.save(col)
    }

    // roles / member_roles: taxonomia de funções, só gestor escreve.
    for (const name of ['roles', 'member_roles']) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = MEMBER_OF_CHURCH
      col.viewRule = MEMBER_OF_CHURCH
      col.createRule = MANAGER_OF_CHURCH
      col.updateRule = MANAGER_OF_CHURCH
      col.deleteRule = MANAGER_OF_CHURCH
      app.save(col)
    }
  },
  (app) => {
    // Rollback: volta ao estado da 0040 (qualquer membro ativo da própria igreja escreve).
    const MEMBER_OF_CHURCH =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
      '@collection.church_members.user_id ?= @request.auth.id && ' +
      '@collection.church_members.is_active ?= true'
    const COLLECTIONS = [
      'songs',
      'song_videos',
      'events',
      'event_songs',
      'event_tasks',
      'media_assets',
      'event_members',
      'roles',
      'member_roles',
    ]
    for (const name of COLLECTIONS) {
      try {
        const col = app.findCollectionByNameOrId(name)
        col.listRule = MEMBER_OF_CHURCH
        col.viewRule = MEMBER_OF_CHURCH
        col.createRule = MEMBER_OF_CHURCH
        col.updateRule = MEMBER_OF_CHURCH
        col.deleteRule = MEMBER_OF_CHURCH
        app.save(col)
      } catch (_) {}
    }
  },
)
