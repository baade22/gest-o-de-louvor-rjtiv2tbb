migrate(
  (app) => {
    // 1. Atualizar a coleção songs adicionando campos: raw_content, cifra_club_url, source
    const songsCol = app.findCollectionByNameOrId('songs')
    const churchesCol = app.findCollectionByNameOrId('churches')

    if (!songsCol.fields.getByName('raw_content')) {
      songsCol.fields.add(new TextField({ name: 'raw_content' }))
    }
    if (!songsCol.fields.getByName('cifra_club_url')) {
      songsCol.fields.add(new TextField({ name: 'cifra_club_url' }))
    }
    if (!songsCol.fields.getByName('source')) {
      songsCol.fields.add(new TextField({ name: 'source' }))
    }
    app.save(songsCol)

    // 2. Criar coleção song_videos com relação a churches e songs
    let songVideosCol
    try {
      songVideosCol = app.findCollectionByNameOrId('song_videos')
    } catch (_) {
      songVideosCol = new Collection({
        name: 'song_videos',
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
            collectionId: churchesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'song_id',
            type: 'relation',
            required: true,
            collectionId: songsCol.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'youtube_video_id', type: 'text', required: true },
          { name: 'title', type: 'text' },
          { name: 'channel_name', type: 'text' },
          { name: 'thumbnail_url', type: 'text' },
          { name: 'is_primary', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_song_videos_church ON song_videos (church_id)',
          'CREATE INDEX idx_song_videos_song ON song_videos (song_id)',
        ],
      })
      app.save(songVideosCol)
    }

    // 3. Migrar youtube_url existentes de songs para a coleção song_videos como primary
    const songsWithYoutube = app.findRecordsByFilter(
      'songs',
      "youtube_url != ''",
      '-created',
      500,
      0,
    )
    for (let i = 0; i < songsWithYoutube.length; i++) {
      const s = songsWithYoutube[i]
      const url = s.getString('youtube_url')
      if (!url) continue

      let videoId = ''
      const match = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]{11})/)
      if (match && match[1]) {
        videoId = match[1]
      }

      if (videoId) {
        const existing = app.findRecordsByFilter(
          'song_videos',
          `song_id = "${s.id}" && youtube_video_id = "${videoId}"`,
          '',
          1,
          0,
        )
        if (existing.length === 0) {
          const videoRecord = new Record(songVideosCol)
          videoRecord.set('church_id', s.getString('church_id'))
          videoRecord.set('song_id', s.id)
          videoRecord.set('youtube_video_id', videoId)
          videoRecord.set('title', s.getString('title') + ' (Referência)')
          videoRecord.set('channel_name', s.getString('artist'))
          videoRecord.set(
            'thumbnail_url',
            'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg',
          )
          videoRecord.set('is_primary', true)
          app.save(videoRecord)
        }
      }
    }
  },
  (app) => {
    try {
      const songVideosCol = app.findCollectionByNameOrId('song_videos')
      app.delete(songVideosCol)
    } catch (_) {}

    try {
      const songsCol = app.findCollectionByNameOrId('songs')
      if (songsCol.fields.getByName('raw_content')) {
        songsCol.fields.removeByName('raw_content')
      }
      if (songsCol.fields.getByName('cifra_club_url')) {
        songsCol.fields.removeByName('cifra_club_url')
      }
      if (songsCol.fields.getByName('source')) {
        songsCol.fields.removeByName('source')
      }
      app.save(songsCol)
    } catch (_) {}
  },
)
