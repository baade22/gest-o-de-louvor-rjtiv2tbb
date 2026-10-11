// Migração 0027: Adiciona novos estados e actions para máquina de estados segura do Holyrics Sync
// Estados: NOT_SYNCED, CHECKING, CREATING, CREATED, VERIFYING_CREATED_SONG, CHECKING_PLAYLIST, ADDING_TO_PLAYLIST, VERIFYING_PLAYLIST, ADDED_TO_PLAYLIST, ALREADY_IN_PLAYLIST, ERROR

migrate(
  (app) => {
    // 1. Atualizar valores do campo holyrics_status em event_songs
    const eventSongsCol = app.findCollectionByNameOrId('event_songs')
    const statusField = eventSongsCol.fields.getByName('holyrics_status')
    if (statusField) {
      statusField.values = [
        'NOT_SYNCED',
        'CHECKING',
        'CREATING',
        'CREATED',
        'VERIFYING_CREATED_SONG',
        'CHECKING_PLAYLIST',
        'ADDING_TO_PLAYLIST',
        'VERIFYING_PLAYLIST',
        'ADDED_TO_PLAYLIST',
        'ALREADY_IN_PLAYLIST',
        'ERROR',
      ]
      app.save(eventSongsCol)
    }

    // 2. Garantir actions em holyrics_commands
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
  },
  (app) => {
    try {
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
    } catch (_) {}
  },
)
