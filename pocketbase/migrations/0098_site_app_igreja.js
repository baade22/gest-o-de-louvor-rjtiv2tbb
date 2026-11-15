// Migração 0098: Site e App da igreja (pedido do Pedro, 2026-11-15).
//
// O site público da igreja também é um "app" sem download (PWA): abre por link ou QR e pode ir
// para a tela de início do celular. Tudo o que ele mostra é público; nenhum dado de membro.
//
// - site_settings: um por igreja. Publicado ou não, nome, cores, logo, ícone do app, endereço,
//   contatos, redes, canal do YouTube, horários dos cultos (service_times) e seções ligadas
//   (sections). Quem lê/grava: chaves admin.site.ver / admin.site.alterar.
// - site_highlights: banners do topo (imagem, título, botão com link, período no ar, ordem).
// - site_pages: páginas simples (Quem somos, Ministérios...) com texto.
// - site_notices: avisos da semana (título, texto curto, período).
// - site_prayer_requests: pedidos de oração e "fale conosco". Só o servidor cria (rota pública
//   com anti-robô e limite por IP); quem lê/trata: admin.oracao.ver / admin.oracao.alterar.
//   Nunca aparecem no site.
// - church_events.show_on_site: o evento só entra na agenda do site quando marcado.
// - Limite próprio para o envio de pedidos: 5 a cada 10 minutos por IP.
//
// As rotas públicas ficam no hook site_public.js; as do painel em site_admin.js.

const PRAYER_RATE = {
  label: 'POST /backend/v1/public/site/prayer',
  audience: '',
  duration: 600,
  maxRequests: 5,
}

const MEMBER =
  "@request.auth.id != '' && @collection.church_members.church_id ?= church_id && " +
  '@collection.church_members.user_id ?= @request.auth.id && ' +
  '@collection.church_members.is_active ?= true'
const M = "@collection.church_members.role ?= 'MASTER'"
const P = (k) => '@collection.church_members.permissions ?~ \'"' + k + '"\''
const allow = (k) => MEMBER + ' && (' + M + ' || ' + P(k) + ')'
const LOCK = ' && (@request.body.church_id:isset = false || @request.body.church_id = church_id)'

const SITE_READ = allow('admin.site.ver')
const SITE_WRITE = allow('admin.site.alterar')

const IMG = ['image/jpeg', 'image/png', 'image/webp']

migrate(
  (app) => {
    const churches = app.findCollectionByNameOrId('churches')
    const churchField = {
      name: 'church_id',
      type: 'relation',
      required: true,
      collectionId: churches.id,
      cascadeDelete: true,
      maxSelect: 1,
    }
    const stamps = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const ensure = (name, def) => {
      try {
        return app.findCollectionByNameOrId(name)
      } catch (_) {}
      const col = new Collection(def)
      app.save(col)
      return col
    }
    const siteRules = {
      listRule: SITE_READ,
      viewRule: SITE_READ,
      createRule: SITE_WRITE,
      updateRule: SITE_WRITE + LOCK,
      deleteRule: SITE_WRITE,
    }

    ensure('site_settings', {
      name: 'site_settings',
      type: 'base',
      listRule: SITE_READ,
      viewRule: SITE_READ,
      createRule: SITE_WRITE,
      updateRule: SITE_WRITE + LOCK,
      deleteRule: null,
      fields: [
        churchField,
        { name: 'published', type: 'bool' },
        { name: 'slug', type: 'text', max: 40, pattern: '^[a-z0-9-]*$' },
        { name: 'title', type: 'text', max: 160 },
        { name: 'short_name', type: 'text', max: 30 },
        { name: 'tagline', type: 'text', max: 200 },
        { name: 'about', type: 'text', max: 8000 },
        { name: 'primary_color', type: 'text', max: 7, pattern: '^(#[0-9a-fA-F]{6})?$' },
        { name: 'accent_color', type: 'text', max: 7, pattern: '^(#[0-9a-fA-F]{6})?$' },
        { name: 'logo', type: 'file', maxSelect: 1, maxSize: 2097152, mimeTypes: IMG },
        {
          name: 'app_icon',
          type: 'file',
          maxSelect: 1,
          maxSize: 1048576,
          mimeTypes: ['image/png'],
        },
        { name: 'address', type: 'text', max: 300 },
        { name: 'maps_url', type: 'url' },
        { name: 'phone', type: 'text', max: 40 },
        { name: 'whatsapp', type: 'text', max: 40 },
        { name: 'email', type: 'email' },
        { name: 'instagram', type: 'text', max: 100 },
        { name: 'facebook', type: 'text', max: 100 },
        { name: 'youtube', type: 'text', max: 200 },
        { name: 'youtube_channel_id', type: 'text', max: 40, pattern: '^(UC[A-Za-z0-9_-]{22})?$' },
        { name: 'service_times', type: 'json', maxSize: 5000 },
        { name: 'sections', type: 'json', maxSize: 2000 },
        { name: 'signup_link_id', type: 'text', max: 40 },
        { name: 'footer_text', type: 'text', max: 300 },
      ].concat(stamps),
      indexes: [
        'CREATE UNIQUE INDEX idx_site_settings_church ON site_settings (church_id)',
        "CREATE UNIQUE INDEX idx_site_settings_slug ON site_settings (slug) WHERE slug != ''",
      ],
    })

    ensure(
      'site_highlights',
      Object.assign({ name: 'site_highlights', type: 'base' }, siteRules, {
        fields: [
          churchField,
          { name: 'title', type: 'text', required: true, max: 120 },
          { name: 'subtitle', type: 'text', max: 240 },
          { name: 'image', type: 'file', maxSelect: 1, maxSize: 3145728, mimeTypes: IMG },
          { name: 'button_label', type: 'text', max: 40 },
          { name: 'link', type: 'text', max: 500 },
          { name: 'church_event_id', type: 'text', max: 40 },
          { name: 'starts_on', type: 'date' },
          { name: 'ends_on', type: 'date' },
          { name: 'order', type: 'number', onlyInt: true },
          { name: 'active', type: 'bool' },
        ].concat(stamps),
        indexes: ['CREATE INDEX idx_site_highlights_church ON site_highlights (church_id, active)'],
      }),
    )

    ensure(
      'site_pages',
      Object.assign({ name: 'site_pages', type: 'base' }, siteRules, {
        fields: [
          churchField,
          { name: 'title', type: 'text', required: true, max: 120 },
          { name: 'slug', type: 'text', required: true, max: 80, pattern: '^[a-z0-9-]+$' },
          { name: 'body', type: 'text', max: 20000 },
          { name: 'order', type: 'number', onlyInt: true },
          { name: 'active', type: 'bool' },
        ].concat(stamps),
        indexes: ['CREATE UNIQUE INDEX idx_site_pages_slug ON site_pages (church_id, slug)'],
      }),
    )

    ensure(
      'site_notices',
      Object.assign({ name: 'site_notices', type: 'base' }, siteRules, {
        fields: [
          churchField,
          { name: 'title', type: 'text', required: true, max: 160 },
          { name: 'body', type: 'text', max: 1000 },
          { name: 'starts_on', type: 'date' },
          { name: 'ends_on', type: 'date' },
          { name: 'order', type: 'number', onlyInt: true },
          { name: 'active', type: 'bool' },
        ].concat(stamps),
        indexes: ['CREATE INDEX idx_site_notices_church ON site_notices (church_id, active)'],
      }),
    )

    ensure('site_prayer_requests', {
      name: 'site_prayer_requests',
      type: 'base',
      listRule: allow('admin.oracao.ver'),
      viewRule: allow('admin.oracao.ver'),
      createRule: null,
      updateRule: allow('admin.oracao.alterar') + LOCK,
      deleteRule: allow('admin.oracao.alterar'),
      fields: [
        churchField,
        { name: 'kind', type: 'select', values: ['ORACAO', 'CONTATO'], maxSelect: 1 },
        { name: 'name', type: 'text', max: 120 },
        { name: 'contact', type: 'text', max: 120 },
        { name: 'wants_contact', type: 'bool' },
        { name: 'message', type: 'text', required: true, max: 3000 },
        {
          name: 'status',
          type: 'select',
          values: ['NOVO', 'ACOMPANHANDO', 'CONCLUIDO'],
          maxSelect: 1,
        },
        { name: 'note', type: 'text', max: 1000 },
        { name: 'consent_at', type: 'date' },
      ].concat(stamps),
      indexes: ['CREATE INDEX idx_site_prayer_church ON site_prayer_requests (church_id, status)'],
    })

    const events = app.findCollectionByNameOrId('church_events')
    if (!events.fields.getByName('show_on_site')) {
      events.fields.add(new BoolField({ name: 'show_on_site' }))
      app.save(events)
    }

    const s = app.settings()
    const rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    if (!rules.some((r) => r.label === PRAYER_RATE.label)) {
      s.rateLimits.rules = [PRAYER_RATE].concat(rules)
      app.save(s)
    }
  },
  (app) => {
    for (const name of [
      'site_prayer_requests',
      'site_notices',
      'site_pages',
      'site_highlights',
      'site_settings',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      const events = app.findCollectionByNameOrId('church_events')
      if (events.fields.getByName('show_on_site')) {
        events.fields.removeByName('show_on_site')
        app.save(events)
      }
    } catch (_) {}
    const s = app.settings()
    const rules = Array.isArray(s.rateLimits.rules) ? s.rateLimits.rules : []
    s.rateLimits.rules = rules.filter((r) => r.label !== PRAYER_RATE.label)
    app.save(s)
  },
)
