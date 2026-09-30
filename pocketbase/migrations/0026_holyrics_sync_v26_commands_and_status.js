migrate(
  (app) => {
    // 1. Atualizar valores do campo action em holyrics_commands para incluir GET_SONGS e GET_SONG_PLAYLIST
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
      ]
      app.save(commandsCol)
    }

    // 2. Atualizar valores do campo holyrics_status em event_songs para incluir novos estados técnicos
    // NOT_SYNCED, CHECKING, CREATING, CREATED, CHECKING_PLAYLIST, ADDING_TO_PLAYLIST, ADDED_TO_PLAYLIST, ALREADY_IN_PLAYLIST, ERROR
    const eventSongsCol = app.findCollectionByNameOrId('event_songs')
    const statusField = eventSongsCol.fields.getByName('holyrics_status')
    if (statusField) {
      statusField.values = [
        'NOT_SYNCED',
        'CHECKING',
        'CREATING',
        'CREATED',
        'CHECKING_PLAYLIST',
        'ADDING_TO_PLAYLIST',
        'ADDED_TO_PLAYLIST',
        'ALREADY_IN_PLAYLIST',
        'ERROR',
      ]
      app.save(eventSongsCol)
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
          'GET_LYRICS_PLAYLIST',
          'ADD_LYRICS_TO_PLAYLIST',
        ]
        app.save(commandsCol)
      }
    } catch (_) {}

    try {
      const eventSongsCol = app.findCollectionByNameOrId('event_songs')
      const statusField = eventSongsCol.fields.getByName('holyrics_status')
      if (statusField) {
        statusField.values = [
          'NOT_SYNCED',
          'CREATING',
          'CREATED',
          'ADDING_TO_PLAYLIST',
          'ADDED_TO_PLAYLIST',
          'ALREADY_IN_PLAYLIST',
          'ERROR',
        ]
        app.save(eventSongsCol)
      }
    } catch (_) {}
  },
)
