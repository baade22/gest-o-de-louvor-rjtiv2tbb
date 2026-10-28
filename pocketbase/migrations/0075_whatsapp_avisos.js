// Migração 0075: Avisos pelo WhatsApp, feitos pela equipe de Mídia (pedido do Pedro, 2026-10-28).
//
// - whatsapp_campaigns: cada aviso. type:
//     AVULSO      aviso montado na tela (agora ou em dia e hora marcados);
//     REGRA_CULTO regra que gera um aviso para cada culto da agenda que combina com ela
//                 (dia da semana + parte do nome), N dias antes, num horário;
//     CULTO       o aviso de um culto específico, criado pela regra (guarda a arte da semana).
//   O conteúdo pode ser só texto, imagem, vídeo, documento ou áudio, com ou sem texto. O envio
//   em massa é devagar: uma mensagem a cada pace_min a pace_max minutos, só dentro da janela
//   (window_start a window_end, horário de Brasília). A arte fica no campo media e a Evolution
//   baixa por um link com media_token (rota /backend/v1/whatsapp/media/{token}).
// - whatsapp_messages ganha campaign_id, mídia e janela, o tipo AVISO e a situação PAUSADO.
// - Perfis de acesso: tela culto.avisos (Consultar, Novo, Alterar, Excluir e "Programar e
//   disparar envios"). Só o perfil pronto Mídia recebe; para outros, o MASTER libera no perfil.
//
// Sem regra de API (só o servidor mexe): a tela usa a rota /backend/v1/whatsapp/avisos, que
// confere as chaves culto.avisos.*.

const AVISO_KEYS = [
  'culto.avisos.ver',
  'culto.avisos.novo',
  'culto.avisos.alterar',
  'culto.avisos.excluir',
  'culto.avisos.enviar',
]

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')

    let campaigns = null
    try {
      campaigns = app.findCollectionByNameOrId('whatsapp_campaigns')
    } catch (_) {}
    if (!campaigns) {
      campaigns = new Collection({
        name: 'whatsapp_campaigns',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
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
            name: 'type',
            type: 'select',
            required: true,
            values: ['AVULSO', 'REGRA_CULTO', 'CULTO'],
            maxSelect: 1,
          },
          { name: 'title', type: 'text', required: true, max: 200 },
          {
            name: 'media_type',
            type: 'select',
            required: true,
            values: ['TEXTO', 'IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO'],
            maxSelect: 1,
          },
          {
            name: 'media',
            type: 'file',
            maxSelect: 1,
            maxSize: 16777216,
            mimeTypes: [],
          },
          { name: 'media_token', type: 'text', max: 64 },
          { name: 'media_base', type: 'text', max: 300 },
          { name: 'use_event_cover', type: 'bool' },
          { name: 'text', type: 'text', max: 4000 },
          { name: 'audience', type: 'json', maxSize: 200000 },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: [
              'RASCUNHO',
              'PROGRAMADO',
              'AGUARDANDO',
              'ENVIANDO',
              'PAUSADO',
              'CONCLUIDO',
              'CANCELADO',
              'ATIVA',
              'INATIVA',
            ],
            maxSelect: 1,
          },
          { name: 'starts_at', type: 'date' },
          { name: 'window_start', type: 'text', max: 5 },
          { name: 'window_end', type: 'text', max: 5 },
          { name: 'pace_min', type: 'number', onlyInt: true },
          { name: 'pace_max', type: 'number', onlyInt: true },
          { name: 'total', type: 'number', onlyInt: true },
          { name: 'eta', type: 'date' },
          { name: 'note', type: 'text', max: 500 },
          // Regra de culto
          { name: 'weekday', type: 'number', onlyInt: true },
          { name: 'title_match', type: 'text', max: 100 },
          { name: 'days_before', type: 'number', onlyInt: true },
          { name: 'send_time', type: 'text', max: 5 },
          {
            name: 'missing_media',
            type: 'select',
            values: ['SO_TEXTO', 'ESPERAR'],
            maxSelect: 1,
          },
          // Ligações (texto simples: o aviso continua no histórico se o culto/evento sumir)
          { name: 'rule_id', type: 'text', max: 40 },
          { name: 'event_id', type: 'text', max: 40 },
          { name: 'church_event_id', type: 'text', max: 40 },
          { name: 'created_by', type: 'text', max: 200 },
          { name: 'started_at', type: 'date' },
          { name: 'finished_at', type: 'date' },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_whatsapp_campaigns_church ON whatsapp_campaigns (church_id, type, status)',
          'CREATE INDEX idx_whatsapp_campaigns_rule ON whatsapp_campaigns (rule_id, event_id)',
          'CREATE INDEX idx_whatsapp_campaigns_token ON whatsapp_campaigns (media_token)',
        ],
      })
      app.save(campaigns)
    }

    const messages = app.findCollectionByNameOrId('whatsapp_messages')
    const kind = messages.fields.getByName('kind')
    if (kind) {
      kind.values = [
        'ESCALA',
        'LEMBRETE_ESCALA',
        'INSCRICAO',
        'PAGAMENTO',
        'ANIVERSARIO',
        'CASAMENTO',
        'TESTE',
        'AVISO',
      ]
    }
    const status = messages.fields.getByName('status')
    if (status) status.values = ['FILA', 'PAUSADO', 'ENVIADO', 'ERRO', 'CANCELADO']
    // Imagem, vídeo ou áudio podem ir sem texto
    const text = messages.fields.getByName('text')
    if (text) text.required = false
    if (!messages.fields.getByName('campaign_id')) {
      messages.fields.add(new TextField({ name: 'campaign_id', max: 40 }))
    }
    if (!messages.fields.getByName('media_type')) {
      messages.fields.add(new TextField({ name: 'media_type', max: 20 }))
    }
    if (!messages.fields.getByName('media_url')) {
      messages.fields.add(new TextField({ name: 'media_url', max: 600 }))
    }
    if (!messages.fields.getByName('file_name')) {
      messages.fields.add(new TextField({ name: 'file_name', max: 200 }))
    }
    if (!messages.fields.getByName('window')) {
      messages.fields.add(new TextField({ name: 'window', max: 11 }))
    }
    messages.addIndex('idx_whatsapp_messages_campaign', false, 'campaign_id, status', '')
    app.save(messages)

    // Perfil pronto Mídia ganha a tela de avisos. Quem já tem o
    // perfil recebe as chaves na hora (as chaves somam; o hook recalcula no próximo ajuste).
    const touched = {}
    let profiles = []
    try {
      profiles = app.findRecordsByFilter('access_profiles', "system_key = 'MIDIA'", '', 0, 0)
    } catch (_) {}
    for (const p of profiles) {
      let perms = []
      try {
        perms = JSON.parse(p.getString('permissions') || '[]') || []
      } catch (_) {}
      let changed = false
      for (const k of AVISO_KEYS) {
        if (perms.indexOf(k) === -1) {
          perms.push(k)
          changed = true
        }
      }
      if (changed) {
        p.set('permissions', perms)
        app.save(p)
      }
      touched[p.id] = true
    }
    let members = []
    try {
      members = app.findRecordsByFilter('church_members', "access_profiles != '[]'", '', 0, 0)
    } catch (_) {}
    for (const m of members) {
      let ids = []
      try {
        ids = JSON.parse(m.getString('access_profiles') || '[]') || []
      } catch (_) {}
      if (!ids.some((id) => touched[id])) continue
      let perms = []
      try {
        perms = JSON.parse(m.getString('permissions') || '[]') || []
      } catch (_) {}
      if (perms.indexOf('*') !== -1) continue
      let changed = false
      for (const k of AVISO_KEYS) {
        if (perms.indexOf(k) === -1) {
          perms.push(k)
          changed = true
        }
      }
      if (changed) {
        m.set('permissions', perms)
        app.saveNoValidate(m)
      }
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('whatsapp_campaigns'))
    } catch (_) {}
    try {
      const messages = app.findCollectionByNameOrId('whatsapp_messages')
      for (const n of ['campaign_id', 'media_type', 'media_url', 'file_name', 'window']) {
        messages.fields.removeByName(n)
      }
      messages.removeIndex('idx_whatsapp_messages_campaign')
      app.save(messages)
    } catch (_) {}
  },
)
