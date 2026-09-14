migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const churchesCol = app.findCollectionByNameOrId('churches')
    const rolesCol = app.findCollectionByNameOrId('roles')
    const membersCol = app.findCollectionByNameOrId('church_members')
    const memberRolesCol = app.findCollectionByNameOrId('member_roles')
    const songsCol = app.findCollectionByNameOrId('songs')
    const eventsCol = app.findCollectionByNameOrId('events')
    const eventSongsCol = app.findCollectionByNameOrId('event_songs')
    const eventMembersCol = app.findCollectionByNameOrId('event_members')

    // 1. Admin User: pedro_baade@hotmail.com
    let adminUser
    try {
      adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'pedro_baade@hotmail.com')
      adminUser.setPassword('Skip@Pass')
      adminUser.setVerified(true)
      adminUser.set('name', 'Pedro Baade')
      app.save(adminUser)
    } catch (_) {
      adminUser = new Record(usersCol)
      adminUser.setEmail('pedro_baade@hotmail.com')
      adminUser.setPassword('Skip@Pass')
      adminUser.setVerified(true)
      adminUser.set('name', 'Pedro Baade')
      app.save(adminUser)
    }

    // 2. Demo Church: Igreja Nova Aliança
    let demoChurch
    try {
      demoChurch = app.findFirstRecordByData('churches', 'slug', 'nova-alianca')
    } catch (_) {
      demoChurch = new Record(churchesCol)
      demoChurch.set('name', 'Igreja Nova Aliança')
      demoChurch.set('slug', 'nova-alianca')
      demoChurch.set('is_active', true)
      demoChurch.set('subscription_plan', 'PRO')
      app.save(demoChurch)
    }

    // 3. Roles (10 standard roles)
    const defaultRoles = [
      { name: 'VOCAL', color: '#3B82F6', description: 'Voz principal' },
      { name: 'BACKING VOCAL', color: '#60A5FA', description: 'Harmonia e vocais de apoio' },
      { name: 'VIOLÃO', color: '#F59E0B', description: 'Violão acústico / aço / nylon' },
      { name: 'GUITARRA', color: '#EF4444', description: 'Guitarra elétrica / solo / base' },
      { name: 'BAIXO', color: '#8B5CF6', description: 'Contrabaixo elétrico / acústico' },
      { name: 'TECLADO', color: '#10B981', description: 'Teclado / sintetizador / pads' },
      { name: 'PIANO', color: '#059669', description: 'Piano acústico / digital' },
      { name: 'BATERIA', color: '#EC4899', description: 'Bateria acústica / eletrônica' },
      { name: 'CAJÓN', color: '#D97706', description: 'Cajón e percussão acústica' },
      { name: 'OUTRO', color: '#6B7280', description: 'Outros instrumentos ou apoio' },
    ]

    const roleMap = {}
    for (let i = 0; i < defaultRoles.length; i++) {
      const rData = defaultRoles[i]
      let rRecord
      try {
        const records = app.findRecordsByFilter(
          'roles',
          `church_id = '${demoChurch.id}' && name = '${rData.name}'`,
          '',
          1,
          0,
        )
        if (records && records.length > 0) {
          rRecord = records[0]
        } else {
          throw new Error('not found')
        }
      } catch (_) {
        rRecord = new Record(rolesCol)
        rRecord.set('church_id', demoChurch.id)
        rRecord.set('name', rData.name)
        rRecord.set('description', rData.description)
        rRecord.set('color', rData.color)
        app.save(rRecord)
      }
      roleMap[rData.name] = rRecord
    }

    // 4. Admin Church Member
    let adminMember
    try {
      const records = app.findRecordsByFilter(
        'church_members',
        `church_id = '${demoChurch.id}' && user_id = '${adminUser.id}'`,
        '',
        1,
        0,
      )
      if (records && records.length > 0) {
        adminMember = records[0]
      } else {
        throw new Error('not found')
      }
    } catch (_) {
      adminMember = new Record(membersCol)
      adminMember.set('church_id', demoChurch.id)
      adminMember.set('user_id', adminUser.id)
      adminMember.set('role', 'ADMIN')
      adminMember.set('phone', '(11) 98765-4321')
      adminMember.set('is_active', true)
      app.save(adminMember)

      // Give Pedro the GUITARRA role
      if (roleMap['GUITARRA']) {
        const mr = new Record(memberRolesCol)
        mr.set('church_id', demoChurch.id)
        mr.set('member_id', adminMember.id)
        mr.set('role_id', roleMap['GUITARRA'].id)
        app.save(mr)
      }
    }

    // 5. Representative Musicians (João, Pedro Silva, Lucas, André, Maria)
    const musiciansData = [
      {
        name: 'João Santos',
        email: 'joao.santos@demo.louvorflow.com',
        role: 'MUSICO',
        phone: '(11) 99123-4567',
        roles: ['VOCAL', 'VIOLÃO'],
      },
      {
        name: 'Pedro Silva',
        email: 'pedro.silva@demo.louvorflow.com',
        role: 'LIDER',
        phone: '(11) 99234-5678',
        roles: ['GUITARRA', 'VIOLÃO'],
      },
      {
        name: 'Lucas Lima',
        email: 'lucas.lima@demo.louvorflow.com',
        role: 'MUSICO',
        phone: '(11) 99345-6789',
        roles: ['BAIXO'],
      },
      {
        name: 'André Rocha',
        email: 'andre.rocha@demo.louvorflow.com',
        role: 'MUSICO',
        phone: '(11) 99456-7890',
        roles: ['TECLADO', 'PIANO'],
      },
      {
        name: 'Maria Ferreira',
        email: 'maria.ferreira@demo.louvorflow.com',
        role: 'MUSICO',
        phone: '(11) 99567-8901',
        roles: ['BACKING VOCAL', 'VOCAL'],
      },
    ]

    const memberMap = {}
    memberMap['Pedro Baade'] = adminMember

    for (let i = 0; i < musiciansData.length; i++) {
      const m = musiciansData[i]
      let u
      try {
        u = app.findAuthRecordByEmail('_pb_users_auth_', m.email)
      } catch (_) {
        u = new Record(usersCol)
        u.setEmail(m.email)
        u.setPassword('Skip@Pass')
        u.setVerified(true)
        u.set('name', m.name)
        app.save(u)
      }

      let cm
      try {
        const records = app.findRecordsByFilter(
          'church_members',
          `church_id = '${demoChurch.id}' && user_id = '${u.id}'`,
          '',
          1,
          0,
        )
        if (records && records.length > 0) {
          cm = records[0]
        } else {
          throw new Error('not found')
        }
      } catch (_) {
        cm = new Record(membersCol)
        cm.set('church_id', demoChurch.id)
        cm.set('user_id', u.id)
        cm.set('role', m.role)
        cm.set('phone', m.phone)
        cm.set('is_active', true)
        app.save(cm)

        for (let r = 0; r < m.roles.length; r++) {
          const roleName = m.roles[r]
          if (roleMap[roleName]) {
            const mr = new Record(memberRolesCol)
            mr.set('church_id', demoChurch.id)
            mr.set('member_id', cm.id)
            mr.set('role_id', roleMap[roleName].id)
            app.save(mr)
          }
        }
      }
      memberMap[m.name] = cm
    }

    // 6. Songs Library
    const demoSongs = [
      {
        title: 'Oceanos (Onde Meus Pés Podem Falhar)',
        artist: 'Hillsong United / Ana Nóbrega',
        composer: 'Matt Crocker, Joel Houston, Salomon Ligthelm',
        key: 'D',
        bpm: 64,
        youtube_url: 'https://www.youtube.com/watch?v=1V6s_UoE00E',
        lyrics: `Tua voz me chama sobre as águas
Onde os meus pés podem falhar
E ali Te encontro no mistério
Em meio ao mar, confiarei

Ao Teu nome clamarei
E além das ondas olharei
Se o mar crescer, somente em Ti descansarei
Pois eu sou Teu e Tu és meu

Guia-me pra que em tudo em Ti confie
Sobre as águas eu caminhe
Por onde quer que me chamares
Leva-me mais fundo do que já estive
E minha fé será mais firme
Senhor, em Tua presença`,
        chords: `[Intro] Bm  A/C#  D  A  G

[Primeira Parte]
Bm          A/C#               D
  Tua voz me chama sobre as águas
            A                G
Onde os meus pés podem falhar
Bm          A/C#            D
  E ali Te encontro no mistério
           A            G
Em meio ao mar, confiarei

[Refrão]
G           D        A
  Ao Teu nome clamarei
G            D         A
  E além das ondas olharei
             G
Se o mar crescer
        D              A
Somente em Ti descansarei
                G      A     Bm
Pois eu sou Teu   e Tu   és meu

[Ponte]
Bm                    G
  Guia-me pra que em tudo em Ti confie
         D                     A
Sobre as águas eu caminhe por onde quer que me chamares
Bm                   G
  Leva-me mais fundo do que já estive
         D                    A
E minha fé será mais firme, Senhor, em Tua presença`,
        notes:
          'Iniciar suave apenas no piano/teclado e pad. Bateria entra na ponte aumentando a intensidade.',
      },
      {
        title: 'Nada Além do Sangue',
        artist: 'Fernandinho',
        composer: 'Robert Lowry',
        key: 'G',
        bpm: 72,
        youtube_url: 'https://www.youtube.com/watch?v=F07yY5yP7g4',
        lyrics: `Teu sangue leva-me além
A todas as bênçãos que tens pra mim
Em Ti me alegrarei
Por tudo o que fizeste por mim

Nada além do sangue
Nada além do sangue de Jesus
Que nos lava de todo o pecado
E nos traz comunhão com o Pai`,
        chords: `[Intro] G  C9  Em7  D4

[Verso]
G           C9
  Teu sangue leva-me além
Em7              D4
  A todas as bênçãos que tens pra mim
G         C9
  Em Ti me alegrarei
Em7            D4
  Por tudo o que fizeste por mim

[Refrão]
C9             D4
  Nada além do sangue
Em7            G/B
  Nada além do sangue de Jesus
C9             D4
  Que nos lava de todo o pecado
Em7         D4          G
  E nos traz comunhão com o Pai`,
        notes: 'Tom vibrante, violão marcando o ritmo e bateria dinâmica no refrão.',
      },
      {
        title: 'Rendido Estou',
        artist: 'Aline Barros & Fernandinho',
        composer: 'Reuben Morgan',
        key: 'C',
        bpm: 76,
        youtube_url: 'https://www.youtube.com/watch?v=kYJv8y6bUqg',
        lyrics: `Toma-me, rendido estou
Aos Teus pés me prostro
Tudo o que sou, tudo o que tenho
Entrego a Ti

Eis-me aqui, Senhor
Usa-me pra Tua glória
Meu coração é Teu
Pra sempre Te amarei`,
        chords: `[Intro] C  G/B  Am7  F9

[Verso]
C            G/B
  Toma-me, rendido estou
Am7           F9
  Aos Teus pés me prostro
C                   G/B
  Tudo o que sou, tudo o que tenho
Am7        F9
  Entrego a Ti

[Refrão]
C          G
  Eis-me aqui, Senhor
Am7        F9
  Usa-me pra Tua glória
C             G
  Meu coração é Teu
Am7        F9        C
  Pra sempre Te amarei`,
        notes: 'Ministração congregacional com dinâmica crescente.',
      },
      {
        title: 'Bondade de Deus',
        artist: 'Isaías Saad',
        composer: 'Jenn Johnson, Ed Cash, Jason Ingram',
        key: 'G',
        bpm: 70,
        youtube_url: 'https://www.youtube.com/watch?v=u8K2zOq4t-4',
        lyrics: `Te amo, Deus, Tua graça nunca falha
Todos os dias eu seguro em Tuas mãos
Desde o amanhecer até o sol se pôr
Eu cantarei da bondade de Deus

Pois toda a minha vida Tu tens sido bom
E toda a minha vida Tu tens sido tão, tão fiel
Com cada fôlego que eu tenho
Eu cantarei da bondade de Deus`,
        chords: `[Intro] G  C  G  C

[Verso]
G                       C
  Te amo, Deus, Tua graça nunca falha
G                 D
  Todos os dias eu seguro em Tuas mãos
Em                     C
  Desde o amanhecer até o sol se pôr
G            D          G
  Eu cantarei da bondade de Deus

[Refrão]
C                          G
  Pois toda a minha vida Tu tens sido bom
C                          G             D
  E toda a minha vida Tu tens sido tão, tão fiel
C                      G         Em
  Com cada fôlego que eu tenho
C            D          G
  Eu cantarei da bondade de Deus`,
        notes: 'Violão dedilhado na primeira parte, refrão aberto e solene.',
      },
    ]

    const songRecords = []
    for (let i = 0; i < demoSongs.length; i++) {
      const s = demoSongs[i]
      let sRec
      try {
        const records = app.findRecordsByFilter(
          'songs',
          `church_id = '${demoChurch.id}' && title = '${s.title.replace(/'/g, "\\'")}'`,
          '',
          1,
          0,
        )
        if (records && records.length > 0) {
          sRec = records[0]
        } else {
          throw new Error('not found')
        }
      } catch (_) {
        sRec = new Record(songsCol)
        sRec.set('church_id', demoChurch.id)
        sRec.set('title', s.title)
        sRec.set('artist', s.artist)
        sRec.set('composer', s.composer)
        sRec.set('key', s.key)
        sRec.set('bpm', s.bpm)
        sRec.set('youtube_url', s.youtube_url)
        sRec.set('lyrics', s.lyrics)
        sRec.set('chords', s.chords)
        sRec.set('notes', s.notes)
        app.save(sRec)
      }
      songRecords.push(sRec)
    }

    // 7. Event: "Culto de Celebração" on 20/09/2026 at 19:00
    let demoEvent
    try {
      const records = app.findRecordsByFilter(
        'events',
        `church_id = '${demoChurch.id}' && title = 'Culto de Celebração'`,
        '',
        1,
        0,
      )
      if (records && records.length > 0) {
        demoEvent = records[0]
      } else {
        throw new Error('not found')
      }
    } catch (_) {
      demoEvent = new Record(eventsCol)
      demoEvent.set('church_id', demoChurch.id)
      demoEvent.set('title', 'Culto de Celebração')
      // date stored in PocketBase date field (ISO format)
      demoEvent.set('date', '2026-09-20 19:00:00.000Z')
      demoEvent.set('start_time', '19:00')
      demoEvent.set('end_time', '21:00')
      demoEvent.set(
        'description',
        'Culto dominical da família com louvor congregacional e ceia do Senhor.',
      )
      demoEvent.set('status', 'Confirmado')
      app.save(demoEvent)
    }

    // 8. Event Songs (Repertoire)
    if (songRecords.length >= 3) {
      const repertoire = [
        {
          song: songRecords[0],
          order: 1,
          custom_key: 'D',
          notes: 'Abertura do louvor, dinâmica suave para intensa.',
        },
        {
          song: songRecords[1],
          order: 2,
          custom_key: 'A',
          notes: 'Transpor para A para facilitar o dueto vocal.',
        },
        {
          song: songRecords[2],
          order: 3,
          custom_key: 'C',
          notes: 'Momento de oração e consagração.',
        },
      ]

      for (let i = 0; i < repertoire.length; i++) {
        const rep = repertoire[i]
        try {
          const records = app.findRecordsByFilter(
            'event_songs',
            `event_id = '${demoEvent.id}' && song_id = '${rep.song.id}'`,
            '',
            1,
            0,
          )
          if (!records || records.length === 0) {
            throw new Error('not found')
          }
        } catch (_) {
          const es = new Record(eventSongsCol)
          es.set('church_id', demoChurch.id)
          es.set('event_id', demoEvent.id)
          es.set('song_id', rep.song.id)
          es.set('order', rep.order)
          es.set('custom_key', rep.custom_key)
          es.set('notes', rep.notes)
          app.save(es)
        }
      }
    }

    // 9. Event Scale (Escala com VOCAL - João - CONFIRMADO / GUITARRA - Pedro - CONFIRMADO / BAIXO - Lucas - PENDENTE / TECLADO - André - RECUSADO)
    const scaleAssignments = [
      {
        member: memberMap['João Santos'],
        role: roleMap['VOCAL'],
        status: 'CONFIRMADO',
        response_at: '2026-09-14 10:30:00.000Z',
        notes: 'Escala principal de voz',
      },
      {
        member: memberMap['Pedro Baade'],
        role: roleMap['GUITARRA'],
        status: 'CONFIRMADO',
        response_at: '2026-09-14 09:15:00.000Z',
        notes: 'Guitarra base e arranjos',
      },
      {
        member: memberMap['Lucas Lima'],
        role: roleMap['BAIXO'],
        status: 'PENDENTE',
        notes: 'Aguardando confirmação do músico',
      },
      {
        member: memberMap['André Rocha'],
        role: roleMap['TECLADO'],
        status: 'RECUSADO',
        response_at: '2026-09-14 11:45:00.000Z',
        decline_reason: 'Viagem de trabalho fora da cidade neste fim de semana',
        notes: 'Precisará de substituto se necessário',
      },
      {
        member: memberMap['Maria Ferreira'],
        role: roleMap['BACKING VOCAL'],
        status: 'CONFIRMADO',
        response_at: '2026-09-14 12:00:00.000Z',
        notes: 'Backing vocal e harmonia',
      },
    ]

    for (let i = 0; i < scaleAssignments.length; i++) {
      const s = scaleAssignments[i]
      if (s.member && s.role) {
        try {
          const records = app.findRecordsByFilter(
            'event_members',
            `event_id = '${demoEvent.id}' && member_id = '${s.member.id}' && role_id = '${s.role.id}'`,
            '',
            1,
            0,
          )
          if (!records || records.length === 0) {
            throw new Error('not found')
          }
        } catch (_) {
          const em = new Record(eventMembersCol)
          em.set('church_id', demoChurch.id)
          em.set('event_id', demoEvent.id)
          em.set('member_id', s.member.id)
          em.set('role_id', s.role.id)
          em.set('status', s.status)
          if (s.response_at) em.set('response_at', s.response_at)
          if (s.decline_reason) em.set('decline_reason', s.decline_reason)
          if (s.notes) em.set('notes', s.notes)
          app.save(em)
        }
      }
    }
  },
  (app) => {
    // down: optionally clean seed records
  },
)
