// Migração 0035: ações REMOVE_FROM_EVENT_PLAYLIST e REORDER_EVENT_SONGS (Agent 0.0.38) em holyrics_commands
const BASE_ACTIONS = [
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

migrate(
  (app) => {
    const commandsCol = app.findCollectionByNameOrId('holyrics_commands')
    const actionField = commandsCol.fields.getByName('action')
    if (actionField) {
      actionField.values = BASE_ACTIONS.concat([
        'REMOVE_FROM_EVENT_PLAYLIST',
        'REORDER_EVENT_SONGS',
      ])
      app.save(commandsCol)
    }
  },
  (app) => {
    try {
      const commandsCol = app.findCollectionByNameOrId('holyrics_commands')
      const actionField = commandsCol.fields.getByName('action')
      if (actionField) {
        actionField.values = BASE_ACTIONS
        app.save(commandsCol)
      }
    } catch (_) {}
  },
)
