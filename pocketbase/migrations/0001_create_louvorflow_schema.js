migrate(
  (app) => {
    // 1. churches
    const churches = new Collection({
      name: 'churches',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: null, // soft delete via is_active = false
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true },
        {
          name: 'logo',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
        },
        { name: 'is_active', type: 'bool' },
        { name: 'subscription_plan', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_churches_slug ON churches (slug)'],
    })
    app.save(churches)

    // 2. roles (instrument/worship functions per church)
    const roles = new Collection({
      name: 'roles',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'color', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_roles_church ON roles (church_id)'],
    })
    app.save(roles)

    // 3. church_members (user <-> church junction + permissions role)
    const churchMembers = new Collection({
      name: 'church_members',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'user_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'role',
          type: 'select',
          required: true,
          values: ['ADMIN', 'LIDER', 'MUSICO'],
          maxSelect: 1,
        },
        { name: 'phone', type: 'text' },
        { name: 'is_active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_church_members_church ON church_members (church_id)',
        'CREATE INDEX idx_church_members_user ON church_members (user_id)',
      ],
    })
    app.save(churchMembers)

    // 4. member_roles (church_member <-> roles)
    const memberRoles = new Collection({
      name: 'member_roles',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'member_id',
          type: 'relation',
          required: true,
          collectionId: churchMembers.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'role_id',
          type: 'relation',
          required: true,
          collectionId: roles.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_member_roles_church ON member_roles (church_id)',
        'CREATE INDEX idx_member_roles_member ON member_roles (member_id)',
        'CREATE INDEX idx_member_roles_role ON member_roles (role_id)',
      ],
    })
    app.save(memberRoles)

    // 5. songs (repertory library for church)
    const songs = new Collection({
      name: 'songs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'title', type: 'text', required: true },
        { name: 'artist', type: 'text', required: true },
        { name: 'composer', type: 'text' },
        { name: 'key', type: 'text', required: true }, // e.g. G, Em, C, D#
        { name: 'bpm', type: 'number', min: 20, max: 300, onlyInt: true },
        { name: 'youtube_url', type: 'text' },
        { name: 'lyrics', type: 'text' },
        { name: 'chords', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_songs_church ON songs (church_id)',
        'CREATE INDEX idx_songs_created ON songs (church_id, created DESC)',
      ],
    })
    app.save(songs)

    // 6. events (services/rehearsals)
    const events = new Collection({
      name: 'events',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'title', type: 'text', required: true },
        { name: 'date', type: 'date', required: true }, // YYYY-MM-DD
        { name: 'start_time', type: 'text' }, // HH:mm
        { name: 'end_time', type: 'text' }, // HH:mm
        { name: 'description', type: 'text' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Planejado', 'Confirmado', 'Realizado', 'Cancelado'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_events_church ON events (church_id)',
        'CREATE INDEX idx_events_date ON events (church_id, date ASC)',
        'CREATE INDEX idx_events_status ON events (status)',
      ],
    })
    app.save(events)

    // 7. event_songs (junction event <-> songs with custom order & key)
    const eventSongs = new Collection({
      name: 'event_songs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'event_id',
          type: 'relation',
          required: true,
          collectionId: events.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'song_id',
          type: 'relation',
          required: true,
          collectionId: songs.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'order', type: 'number', onlyInt: true },
        { name: 'custom_key', type: 'text' }, // event-specific key, doesn't touch song.key
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_event_songs_church ON event_songs (church_id)',
        'CREATE INDEX idx_event_songs_event ON event_songs (event_id, "order" ASC)',
      ],
    })
    app.save(eventSongs)

    // 8. event_members (schedule assignment: event <-> member with role & status)
    const eventMembers = new Collection({
      name: 'event_members',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'church_id',
          type: 'relation',
          required: true,
          collectionId: churches.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'event_id',
          type: 'relation',
          required: true,
          collectionId: events.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'member_id',
          type: 'relation',
          required: true,
          collectionId: churchMembers.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'role_id',
          type: 'relation',
          required: true,
          collectionId: roles.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['PENDENTE', 'CONFIRMADO', 'RECUSADO'],
          maxSelect: 1,
        },
        { name: 'response_at', type: 'date' },
        { name: 'decline_reason', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_event_members_church ON event_members (church_id)',
        'CREATE INDEX idx_event_members_event ON event_members (event_id)',
        'CREATE INDEX idx_event_members_member ON event_members (member_id)',
        'CREATE INDEX idx_event_members_status ON event_members (status)',
      ],
    })
    app.save(eventMembers)
  },
  (app) => {
    const toDelete = [
      'event_members',
      'event_songs',
      'events',
      'songs',
      'member_roles',
      'church_members',
      'roles',
      'churches',
    ]
    for (let i = 0; i < toDelete.length; i++) {
      try {
        const col = app.findCollectionByNameOrId(toDelete[i])
        app.delete(col)
      } catch (_) {}
    }
  },
)
