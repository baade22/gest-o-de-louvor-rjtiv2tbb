// Migração 0031: Adiciona action GET_SCHEDULES aos valores permitidos de holyrics_commands
migrate(
  (app) => {
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
        'GET_SCHEDULES',
      ]
      app.save(commandsCol)
    }
  },
  (app) => {
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
          'SYNC_MEDIA_PLAYLIST',
        ]
        app.save(commandsCol)
      }
    } catch (_) {}
  },
)
