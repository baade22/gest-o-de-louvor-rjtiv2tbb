migrate(
  (app) => {
    // 1. Atualizar SelectField role de church_members para incluir MASTER
    const churchMembersCol = app.findCollectionByNameOrId('church_members')
    const roleField = churchMembersCol.fields.getByName('role')
    if (roleField) {
      roleField.values = ['MASTER', 'ADMIN', 'LIDER', 'MUSICO']
    }

    // 2. Adicionar campo operational_roles (JSON array com as funções operacionais: MUSICO, SOM, PROJECAO, MIDIA, ILUMINACAO)
    if (!churchMembersCol.fields.getByName('operational_roles')) {
      churchMembersCol.fields.add(
        new JSONField({
          name: 'operational_roles',
          required: false,
          maxSize: 20000,
        }),
      )
    }

    // Atualizar regras de church_members para permitir que MASTER faça o mesmo que ADMIN
    churchMembersCol.createRule =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"

    churchMembersCol.updateRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || (@collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')))"

    churchMembersCol.deleteRule =
      "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"

    app.save(churchMembersCol)

    // 3. Atualizar event_members para adicionar team_area (SOM, PROJECAO, MIDIA, ILUMINACAO, MUSICA, etc.)
    const eventMembersCol = app.findCollectionByNameOrId('event_members')
    if (!eventMembersCol.fields.getByName('team_area')) {
      eventMembersCol.fields.add(
        new TextField({
          name: 'team_area',
          required: false,
        }),
      )
      app.save(eventMembersCol)
    }

    // 4. Criar collection 'invitations' para convite de usuários secundários
    try {
      app.findCollectionByNameOrId('invitations')
    } catch (_) {
      const churchesCol = app.findCollectionByNameOrId('churches')
      const invitationsCol = new Collection({
        name: 'invitations',
        type: 'base',
        // Apenas MASTER/ADMIN da igreja vê convites da igreja; o endpoint de aceitação usará superuser interno
        listRule:
          "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')",
        viewRule:
          "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churchesCol.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { name: 'email', type: 'email', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'token', type: 'text', required: true },
          {
            name: 'role',
            type: 'select',
            required: true,
            values: ['MASTER', 'ADMIN', 'LIDER', 'MUSICO'],
            maxSelect: 1,
          },
          { name: 'operational_roles', type: 'json', required: false, maxSize: 20000 },
          { name: 'role_ids', type: 'json', required: false, maxSize: 20000 },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED'],
            maxSelect: 1,
          },
          { name: 'expires_at', type: 'date', required: true },
          { name: 'accepted_at', type: 'date', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_invitations_token ON invitations (token)',
          'CREATE INDEX idx_invitations_church ON invitations (church_id)',
          'CREATE INDEX idx_invitations_email ON invitations (email)',
        ],
      })
      app.save(invitationsCol)
    }

    // 5. Promover pedro_baade@hotmail.com da congregação demo para MASTER
    try {
      const demoUser = app.findAuthRecordByEmail('_pb_users_auth_', 'pedro_baade@hotmail.com')
      const demoMemberships = app.findRecordsByFilter(
        'church_members',
        'user_id = {:uid}',
        '',
        10,
        0,
        { uid: demoUser.id },
      )

      for (let i = 0; i < demoMemberships.length; i++) {
        const mem = demoMemberships[i]
        mem.set('role', 'MASTER')
        // Atribui todas as funções operacionais por padrão para teste total
        mem.set('operational_roles', ['MUSICO', 'SOM', 'PROJECAO', 'MIDIA', 'ILUMINACAO'])
        app.save(mem)
        console.log('[MIGRATION 0019] Promovido membro ' + mem.id + ' para MASTER com sucesso.')
      }
    } catch (e) {
      console.log('[MIGRATION 0019] Aviso ao promover demoUser: ' + e.message)
    }
  },
  (app) => {
    try {
      const invitations = app.findCollectionByNameOrId('invitations')
      app.delete(invitations)
    } catch (_) {}
  },
)
