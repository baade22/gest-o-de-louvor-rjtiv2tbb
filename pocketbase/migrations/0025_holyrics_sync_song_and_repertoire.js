migrate(
  (app) => {
    // 1. Adicionar holyrics_song_id na collection songs
    const songsCol = app.findCollectionByNameOrId('songs')
    if (!songsCol.fields.getByName('holyrics_song_id')) {
      songsCol.fields.add(
        new TextField({
          name: 'holyrics_song_id',
          required: false,
        }),
      )
      app.save(songsCol)
    }

    // 2. Adicionar campos em event_songs:
    // holyrics_status, holyrics_synced_at, holyrics_error, holyrics_playlist_order
    const eventSongsCol = app.findCollectionByNameOrId('event_songs')
    let eventSongsModified = false

    if (!eventSongsCol.fields.getByName('holyrics_status')) {
      eventSongsCol.fields.add(
        new SelectField({
          name: 'holyrics_status',
          required: false,
          values: [
            'NOT_SYNCED',
            'CREATING',
            'CREATED',
            'ADDING_TO_PLAYLIST',
            'ADDED_TO_PLAYLIST',
            'ALREADY_IN_PLAYLIST',
            'ERROR',
          ],
          maxSelect: 1,
        }),
      )
      eventSongsModified = true
    }

    if (!eventSongsCol.fields.getByName('holyrics_synced_at')) {
      eventSongsCol.fields.add(
        new DateField({
          name: 'holyrics_synced_at',
          required: false,
        }),
      )
      eventSongsModified = true
    }

    if (!eventSongsCol.fields.getByName('holyrics_error')) {
      eventSongsCol.fields.add(
        new TextField({
          name: 'holyrics_error',
          required: false,
        }),
      )
      eventSongsModified = true
    }

    if (!eventSongsCol.fields.getByName('holyrics_playlist_order')) {
      eventSongsCol.fields.add(
        new NumberField({
          name: 'holyrics_playlist_order',
          required: false,
        }),
      )
      eventSongsModified = true
    }

    if (eventSongsModified) {
      app.save(eventSongsCol)
    }

    // 3. Atualizar collection holyrics_commands para aceitar novas ações:
    // CREATE_SONG, GET_LYRICS_PLAYLIST, ADD_LYRICS_TO_PLAYLIST
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
  },
  (app) => {
    try {
      const songsCol = app.findCollectionByNameOrId('songs')
      songsCol.fields.removeByName('holyrics_song_id')
      app.save(songsCol)
    } catch (_) {}

    try {
      const eventSongsCol = app.findCollectionByNameOrId('event_songs')
      eventSongsCol.fields.removeByName('holyrics_status')
      eventSongsCol.fields.removeByName('holyrics_synced_at')
      eventSongsCol.fields.removeByName('holyrics_error')
      eventSongsCol.fields.removeByName('holyrics_playlist_order')
      app.save(eventSongsCol)
    } catch (_) {}

    try {
      const commandsCol = app.findCollectionByNameOrId('holyrics_commands')
      const actionField = commandsCol.fields.getByName('action')
      if (actionField) {
        actionField.values = ['TEST_CONNECTION', 'SEARCH_SONG', 'ADD_TO_PLAYLIST']
        app.save(commandsCol)
      }
    } catch (_) {}
  },
)
