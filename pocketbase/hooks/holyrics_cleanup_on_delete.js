// Hook: limpa a playlist do culto no Holyrics quando algo sai do LouvorFlow.
//
// - Música removida do repertório (event_songs): tira a música da playlist do culto.
// - Mídia excluída (media_assets): tira a mídia da playlist e apaga o arquivo que o Agent
//   gravou na biblioteca do Holyrics.
// - Culto excluído (events): tira da playlist todas as músicas e mídias do culto e apaga os
//   arquivos. (A exclusão em cascata das linhas filhas não passa por este hook.)
//
// Só vale para cultos vinculados ao Holyrics (events.holyrics_event_id). O comando
// REMOVE_FROM_EVENT_PLAYLIST fica na fila (holyrics_commands) até o Agent buscar; exige
// Agent 0.0.38 ou mais novo. Nunca bloqueia a exclusão no LouvorFlow.

onRecordDelete(
  (e) => {
    try {
      const app = e.app
      const rec = e.record
      const kind = rec.collection().name
      const churchId = rec.getString('church_id')
      const eventId = kind === 'events' ? rec.id : rec.getString('event_id')

      let event = kind === 'events' ? rec : null
      if (!event) {
        try {
          event = app.findRecordById('events', eventId)
        } catch (_) {}
      }
      const holyricsEventId = event ? event.getString('holyrics_event_id') : ''
      const dateMatch = event
        ? String(event.getString('date') || '').match(/^(\d{4})-(\d{2})/)
        : null

      // ID da música no acervo do Holyrics para uma linha do repertório
      const holyricsSongIdOf = (eventSong) => {
        try {
          return app
            .findRecordById('songs', eventSong.getString('song_id'))
            .getString('holyrics_song_id')
        } catch (_) {
          return ''
        }
      }

      // Arquivo que o Agent gravou na biblioteca para uma mídia, ou null se ela não chegou lá.
      // O nome final está no caminho salvo em holyrics_status
      // ("... em C:\...\video\Nome.mp4" ou "GRAVADO_BIBLIOTECA_LOCAL (C:\...\Nome.mp4)").
      const libraryFileOf = (media) => {
        const status = media.getString('status')
        if (status !== 'BAIXADA' && status !== 'IMPORTADA_HOLYRICS' && status !== 'CONCLUIDA') {
          return null
        }
        let fileName = ''
        const savedStatus = String(media.getString('holyrics_status') || '').trim()
        if (/[\\/]/.test(savedStatus)) {
          const parts = savedStatus.split(/[\\/]/)
          fileName = parts[parts.length - 1].trim()
          if (savedStatus.indexOf('GRAVADO_BIBLIOTECA_LOCAL (') === 0 && /\)$/.test(fileName)) {
            fileName = fileName.slice(0, -1)
          }
        }
        if (!fileName) fileName = media.getString('holyrics_filename')
        return fileName ? { media_type: media.getString('media_type'), file_name: fileName } : null
      }

      if (event && holyricsEventId && dateMatch) {
        const payload = {
          event_id: holyricsEventId,
          month: Number(dateMatch[2]),
          year: Number(dateMatch[1]),
          song_ids: [],
          media: [],
          delete_files: false,
        }

        if (kind === 'events') {
          // Culto excluído: tudo que o LouvorFlow levou para a playlist dele sai junto
          const eventSongs = app.findRecordsByFilter(
            'event_songs',
            'event_id = {:eventId}',
            '',
            0,
            0,
            {
              eventId: eventId,
            },
          )
          for (let i = 0; i < eventSongs.length; i++) {
            const hid = holyricsSongIdOf(eventSongs[i])
            if (hid && payload.song_ids.indexOf(hid) === -1) payload.song_ids.push(hid)
          }
          const medias = app.findRecordsByFilter(
            'media_assets',
            'event_id = {:eventId}',
            '',
            0,
            0,
            {
              eventId: eventId,
            },
          )
          for (let i = 0; i < medias.length; i++) {
            const file = libraryFileOf(medias[i])
            if (file) payload.media.push(file)
          }
        } else if (kind === 'event_songs') {
          // A mesma música pode estar duas vezes no repertório: só tira do Holyrics se esta era a última
          let sameSongLeft = 0
          try {
            sameSongLeft = app.findRecordsByFilter(
              'event_songs',
              'event_id = {:eventId} && song_id = {:songId} && id != {:id}',
              '',
              1,
              0,
              { eventId: eventId, songId: rec.getString('song_id'), id: rec.id },
            ).length
          } catch (_) {}
          const hid = holyricsSongIdOf(rec)
          if (hid && sameSongLeft === 0) payload.song_ids.push(hid)
        } else if (kind === 'media_assets') {
          const file = libraryFileOf(rec)
          if (file) payload.media.push(file)
        }
        payload.delete_files = payload.media.length > 0

        if (payload.song_ids.length > 0 || payload.media.length > 0) {
          let agent = null
          try {
            const agents = app.findRecordsByFilter(
              'holyrics_agents',
              "church_id = {:churchId} && paired_at != ''",
              '-last_seen_at',
              1,
              0,
              { churchId: churchId },
            )
            agent = agents.length > 0 ? agents[0] : null
          } catch (_) {}

          const versionParts = String((agent && agent.getString('version')) || '0')
            .split('.')
            .map((n) => parseInt(n, 10) || 0)
          const supportsRemove =
            versionParts[0] > 0 ||
            versionParts[1] > 0 ||
            (versionParts.length > 2 && versionParts[2] >= 38)

          if (agent && supportsRemove) {
            const cmd = new Record(app.findCollectionByNameOrId('holyrics_commands'))
            cmd.set(
              'command_id',
              'cmd_remove_from_event_playlist_' + Date.now() + '_' + $security.randomString(8),
            )
            cmd.set('church_id', churchId)
            cmd.set('agent_id', agent.id)
            cmd.set('action', 'REMOVE_FROM_EVENT_PLAYLIST')
            cmd.set('payload', payload)
            cmd.set('status', 'PENDING')
            cmd.set('created_at', new Date().toISOString().replace('T', ' ').substring(0, 19))
            app.save(cmd)
          } else {
            console.log(
              '[HOLYRICS_CLEANUP] ' +
                kind +
                ' ' +
                rec.id +
                ' excluído sem limpar o Holyrics: ' +
                (agent
                  ? 'Agent ' + agent.getString('version') + ' não suporta remoção'
                  : 'sem Agent'),
            )
          }
        }
      }
    } catch (err) {
      console.log('[HOLYRICS_CLEANUP_ERR]', err.message)
    }
    e.next()
  },
  'events',
  'event_songs',
  'media_assets',
)
