// Migração 0033: Roteiro do culto (event_moments) + voz principal por música
// - event_moments: os momentos do culto (abertura, louvor, avisos, palavra...) em ordem.
// - event_songs.lead_vocal: quem puxa a música neste culto.
// - event_songs.moment_id / media_assets.moment_id: em qual momento do roteiro o item entra.
// Tudo aditivo e opcional: cultos antigos continuam funcionando sem roteiro.

const MEMBER_OF_CHURCH =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && @collection.church_members.user_id ?= @request.auth.id && @collection.church_members.is_active ?= true"
const MANAGER_OF_CHURCH =
  MEMBER_OF_CHURCH +
  " && (@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')"

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const events = app.findCollectionByNameOrId('events')
    const churchMembers = app.findCollectionByNameOrId('church_members')

    // 1. Collection event_moments
    let momentsCol
    try {
      momentsCol = app.findCollectionByNameOrId('event_moments')
    } catch (_) {
      momentsCol = new Collection({
        name: 'event_moments',
        type: 'base',
        listRule: MEMBER_OF_CHURCH,
        viewRule: MEMBER_OF_CHURCH,
        createRule: MANAGER_OF_CHURCH,
        updateRule: MANAGER_OF_CHURCH,
        deleteRule: MANAGER_OF_CHURCH,
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
          { name: 'title', type: 'text', required: true },
          {
            name: 'kind',
            type: 'select',
            required: true,
            values: [
              'ABERTURA',
              'LOUVOR',
              'AVISOS',
              'OFERTA',
              'PALAVRA',
              'MINISTRACAO',
              'ENCERRAMENTO',
              'OUTRO',
            ],
            maxSelect: 1,
          },
          { name: 'start_time', type: 'text' },
          { name: 'duration_min', type: 'number', onlyInt: true, min: 0 },
          { name: 'responsible', type: 'text' },
          { name: 'notes', type: 'text' },
          { name: 'order', type: 'number', onlyInt: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_event_moments_event ON event_moments (event_id)'],
      })
      app.save(momentsCol)
    }

    // 2. event_songs: voz principal e momento do roteiro
    const songsCol = app.findCollectionByNameOrId('event_songs')
    if (!songsCol.fields.getByName('lead_vocal')) {
      songsCol.fields.add(
        new RelationField({
          name: 'lead_vocal',
          collectionId: churchMembers.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    if (!songsCol.fields.getByName('moment_id')) {
      songsCol.fields.add(
        new RelationField({
          name: 'moment_id',
          collectionId: momentsCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(songsCol)

    // 3. media_assets: momento do roteiro
    const mediaCol = app.findCollectionByNameOrId('media_assets')
    if (!mediaCol.fields.getByName('moment_id')) {
      mediaCol.fields.add(
        new RelationField({
          name: 'moment_id',
          collectionId: momentsCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      app.save(mediaCol)
    }
  },
  (app) => {
    try {
      const songsCol = app.findCollectionByNameOrId('event_songs')
      if (songsCol.fields.getByName('lead_vocal')) songsCol.fields.removeByName('lead_vocal')
      if (songsCol.fields.getByName('moment_id')) songsCol.fields.removeByName('moment_id')
      app.save(songsCol)
    } catch (_) {}

    try {
      const mediaCol = app.findCollectionByNameOrId('media_assets')
      if (mediaCol.fields.getByName('moment_id')) {
        mediaCol.fields.removeByName('moment_id')
        app.save(mediaCol)
      }
    } catch (_) {}

    try {
      const momentsCol = app.findCollectionByNameOrId('event_moments')
      app.delete(momentsCol)
    } catch (_) {}
  },
)
