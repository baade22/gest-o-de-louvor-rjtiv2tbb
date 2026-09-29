migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const songs = app.findCollectionByNameOrId('songs')
    const events = app.findCollectionByNameOrId('events')

    // 1. Collection holyrics_agents
    // church_id, name, machine_name, platform, version, status (ONLINE/OFFLINE),
    // last_seen_at, paired_at, pairing_code, pairing_expires_at, agent_token,
    // holyrics_detected, holyrics_version, api_port
    let holyricsAgentsCol
    try {
      holyricsAgentsCol = app.findCollectionByNameOrId('holyrics_agents')
    } catch (_) {
      holyricsAgentsCol = new Collection({
        name: 'holyrics_agents',
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
          { name: 'machine_name', type: 'text' },
          { name: 'platform', type: 'text' },
          { name: 'version', type: 'text' },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['ONLINE', 'OFFLINE'],
            maxSelect: 1,
          },
          { name: 'last_seen_at', type: 'date' },
          { name: 'paired_at', type: 'date' },
          { name: 'pairing_code', type: 'text' },
          { name: 'pairing_expires_at', type: 'date' },
          { name: 'agent_token', type: 'text' }, // hash do token para autenticação segura
          { name: 'holyrics_detected', type: 'bool' },
          { name: 'holyrics_version', type: 'text' },
          { name: 'api_port', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_holyrics_agents_church ON holyrics_agents (church_id)',
          'CREATE INDEX idx_holyrics_agents_code ON holyrics_agents (pairing_code)',
          'CREATE INDEX idx_holyrics_agents_token ON holyrics_agents (agent_token)',
          'CREATE INDEX idx_holyrics_agents_status ON holyrics_agents (status)',
        ],
      })
      app.save(holyricsAgentsCol)
    }

    // 2. Collection holyrics_commands
    // command_id (único), church_id, agent_id, action (TEST_CONNECTION, SEARCH_SONG, ADD_TO_PLAYLIST),
    // payload (json), status (PENDING/SENT/DONE/FAILED/EXPIRED), result (json), error (text), created_at (date), executed_at (date)
    let holyricsCommandsCol
    try {
      holyricsCommandsCol = app.findCollectionByNameOrId('holyrics_commands')
    } catch (_) {
      const agentsColId = app.findCollectionByNameOrId('holyrics_agents').id
      holyricsCommandsCol = new Collection({
        name: 'holyrics_commands',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'command_id', type: 'text', required: true },
          {
            name: 'church_id',
            type: 'relation',
            required: true,
            collectionId: churches.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'agent_id',
            type: 'relation',
            required: true,
            collectionId: agentsColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'action',
            type: 'select',
            required: true,
            values: ['TEST_CONNECTION', 'SEARCH_SONG', 'ADD_TO_PLAYLIST'],
            maxSelect: 1,
          },
          { name: 'payload', type: 'json' },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['PENDING', 'SENT', 'DONE', 'FAILED', 'EXPIRED'],
            maxSelect: 1,
          },
          { name: 'result', type: 'json' },
          { name: 'error', type: 'text' },
          { name: 'created_at', type: 'date' },
          { name: 'executed_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_holyrics_commands_id ON holyrics_commands (command_id)',
          'CREATE INDEX idx_holyrics_commands_agent ON holyrics_commands (agent_id, status)',
          'CREATE INDEX idx_holyrics_commands_church ON holyrics_commands (church_id)',
        ],
      })
      app.save(holyricsCommandsCol)
    }

    // 3. Collection holyrics_sync_logs
    // event_id, agent_id, song_id, holyrics_song_id, action, status (SUCCESS/ERROR), error, created_at
    let holyricsLogsCol
    try {
      holyricsLogsCol = app.findCollectionByNameOrId('holyrics_sync_logs')
    } catch (_) {
      const agentsColId = app.findCollectionByNameOrId('holyrics_agents').id
      holyricsLogsCol = new Collection({
        name: 'holyrics_sync_logs',
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
            name: 'agent_id',
            type: 'relation',
            required: true,
            collectionId: agentsColId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'event_id',
            type: 'relation',
            collectionId: events.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'song_id',
            type: 'relation',
            collectionId: songs.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'holyrics_song_id', type: 'text' },
          { name: 'action', type: 'text', required: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['SUCCESS', 'ERROR'],
            maxSelect: 1,
          },
          { name: 'error', type: 'text' },
          { name: 'created_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_holyrics_sync_logs_church ON holyrics_sync_logs (church_id)',
          'CREATE INDEX idx_holyrics_sync_logs_agent ON holyrics_sync_logs (agent_id)',
          'CREATE INDEX idx_holyrics_sync_logs_song ON holyrics_sync_logs (song_id)',
        ],
      })
      app.save(holyricsLogsCol)
    }
  },
  (app) => {
    try {
      const logs = app.findCollectionByNameOrId('holyrics_sync_logs')
      app.delete(logs)
    } catch (_) {}
    try {
      const cmds = app.findCollectionByNameOrId('holyrics_commands')
      app.delete(cmds)
    } catch (_) {}
    try {
      const agents = app.findCollectionByNameOrId('holyrics_agents')
      app.delete(agents)
    } catch (_) {}
  },
)
