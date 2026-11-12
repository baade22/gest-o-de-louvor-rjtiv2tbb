// Migração 0094: Mídia, baixar vídeo ou áudio do YouTube pelo link.
// - holyrics_commands.action ganha YOUTUBE_DOWNLOAD (o computador do Holyrics baixa quando
//   o servidor não conseguiu).
// - media_assets ganha:
//   source_url     link do YouTube (canônico) de onde a mídia veio
//   youtube_stage  VPS (baixando no servidor) | AGENT (vai baixar no computador do Holyrics)
//                  | DONE | FAILED
//   youtube_job    dados internos do pedido (id e senha do arquivo no servidor). Oculto da API.

migrate(
  (app) => {
    const commands = app.findCollectionByNameOrId('holyrics_commands')
    const action = commands.fields.getByName('action')
    if (action && action.values.indexOf('YOUTUBE_DOWNLOAD') === -1) {
      action.values = action.values.concat(['YOUTUBE_DOWNLOAD'])
      app.save(commands)
    }

    const media = app.findCollectionByNameOrId('media_assets')
    if (!media.fields.getByName('source_url')) {
      media.fields.add(new TextField({ name: 'source_url', max: 300 }))
    }
    if (!media.fields.getByName('youtube_stage')) {
      media.fields.add(new TextField({ name: 'youtube_stage', max: 20 }))
    }
    if (!media.fields.getByName('youtube_job')) {
      media.fields.add(new JSONField({ name: 'youtube_job', maxSize: 20000, hidden: true }))
    }
    app.save(media)
  },
  (app) => {
    try {
      const commands = app.findCollectionByNameOrId('holyrics_commands')
      const action = commands.fields.getByName('action')
      if (action) {
        action.values = action.values.filter((v) => v !== 'YOUTUBE_DOWNLOAD')
        app.save(commands)
      }
    } catch (_) {}
    try {
      const media = app.findCollectionByNameOrId('media_assets')
      for (const name of ['source_url', 'youtube_stage', 'youtube_job']) {
        if (media.fields.getByName(name)) media.fields.removeByName(name)
      }
      app.save(media)
    } catch (_) {}
  },
)
