// Migração 0030: Campos aditivos para nomenclatura e ordenação de mídias + action SYNC_MEDIA_PLAYLIST
migrate(
  (app) => {
    // 1. Atualizar media_assets com original_filename, holyrics_filename e presentation_order
    const mediaCol = app.findCollectionByNameOrId('media_assets')
    if (!mediaCol.fields.getByName('original_filename')) {
      mediaCol.fields.add(
        new TextField({
          name: 'original_filename',
          required: false,
        }),
      )
    }
    if (!mediaCol.fields.getByName('holyrics_filename')) {
      mediaCol.fields.add(
        new TextField({
          name: 'holyrics_filename',
          required: false,
        }),
      )
    }
    if (!mediaCol.fields.getByName('presentation_order')) {
      mediaCol.fields.add(
        new NumberField({
          name: 'presentation_order',
          onlyInt: true,
          min: 0,
          required: false,
        }),
      )
    }
    app.save(mediaCol)

    // 2. Atualizar holyrics_commands com action SYNC_MEDIA_PLAYLIST
    const commandsCol = app.findCollectionByNameOrId('holyrics_commands')
    const actionField = commandsCol.fields.getByName('action')
    if (actionField) {
      actionField.values = [
        'TEST_CONNECTION',
        'SEARCH_SONG',
        'ADD_TO_PLAYLIST',
        'CREATE_SONG',
        'GET_SONGS',
        'GET_SONG_PLAYLIST',
        'GET_LYRICS_PLAYLIST',
        'ADD_LYRICS_TO_PLAYLIST',
        'TRANSFER_MEDIA',
        'SYNC_MEDIA_PLAYLIST',
      ]
      app.save(commandsCol)
    }
  },
  (app) => {
    try {
      const mediaCol = app.findCollectionByNameOrId('media_assets')
      const f1 = mediaCol.fields.getByName('original_filename')
      if (f1) mediaCol.fields.removeByName('original_filename')
      const f2 = mediaCol.fields.getByName('holyrics_filename')
      if (f2) mediaCol.fields.removeByName('holyrics_filename')
      const f3 = mediaCol.fields.getByName('presentation_order')
      if (f3) mediaCol.fields.removeByName('presentation_order')
      app.save(mediaCol)
    } catch (_) {}

    try {
      const commandsCol = app.findCollectionByNameOrId('holyrics_commands')
      const actionField = commandsCol.fields.getByName('action')
      if (actionField) {
        actionField.values = [
          'TEST_CONNECTION',
          'SEARCH_SONG',
          'ADD_TO_PLAYLIST',
          'CREATE_SONG',
          'GET_SONGS',
          'GET_SONG_PLAYLIST',
          'GET_LYRICS_PLAYLIST',
          'ADD_LYRICS_TO_PLAYLIST',
          'TRANSFER_MEDIA',
        ]
        app.save(commandsCol)
      }
    } catch (_) {}
  },
)
