// Migração 0073: as regras das coleções passam a conferir os perfis de acesso (0072).
//
// Cada regra tem um "bloco de autorização" logo depois do vínculo ativo da pessoa
// (`... is_active ?= true && ( ... )`). Até aqui ele conferia papel (MASTER/ADMIN/LIDER)
// e funções (FINANCEIRO, MEMBRESIA...). Agora confere a chave da tela e da ação, por
// exemplo `financeiro.lancamentos.novo`, que o hook church_members_access.js grava em
// church_members.permissions. O MASTER continua com tudo. Tudo o mais em cada regra
// (igreja travada, campos que só o servidor grava, relações da mesma igreja) fica igual:
// a migração troca só o bloco de autorização.
//
// Congregação (Aldeia/Diamante): nas coleções com congregação (pessoas, grupos, eventos
// da igreja, contas, lançamentos, contagens, campanhas e orçamento) a pessoa só alcança o
// que é das congregações do perfil (cong_* = '*' quando o perfil vale para todas). Registro
// sem congregação continua visível para todos que têm a tela.
//
// Leitura do louvor (músicas, cultos, escalas, repertório, mídias): quem tem qualquer
// permissão do louvor ou das equipes do culto. Quem só tem, por exemplo, o financeiro ou a
// membresia não lê mais o louvor pela API.
//
// O self-update de church_members (telefone no perfil) passa a recusar access_profiles.
// Rollback: volta os blocos de autorização exatamente como estavam (OLD_GROUPS).
//
// JSVM: as regras lidas da coleção passam por ('' + r) antes de mexer na string (ver
// nota da migração 0066 sobre o rollback silencioso).

const MARK = '@collection.church_members.is_active ?= true && ('

// Blocos de autorização como estavam na 0069 (para o rollback)
const OLD_GROUPS = [
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER')",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER' || member_id.user_id ?= @request.auth.id)",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.role ?= 'LIDER' || @collection.church_members.operational_roles ?~ '\"MIDIA\"')",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN')",
  "(@collection.church_members.role ?= 'MASTER' || (@collection.church_members.role ?= 'ADMIN' && @request.body.role != 'MASTER'))",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"MEMBRESIA\"' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"' || @collection.church_members.operational_roles ?~ '\"AUDITOR\"')",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"MEMBRESIA\"' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"MEMBRESIA\"')",
  "(@collection.church_members.role ?= 'MASTER' || (@collection.church_members.operational_roles ?~ '\"MEMBRESIA\"' || @collection.church_members.operational_roles ?~ '\"EVENTOS\"'))",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"' || @collection.church_members.operational_roles ?~ '\"AUDITOR\"')",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"')",
  "(@collection.church_members.role ?= 'MASTER' || @collection.church_members.role ?= 'ADMIN' || @collection.church_members.operational_roles ?~ '\"FINANCEIRO\"' || @collection.church_members.operational_roles ?~ '\"AUDITOR\"')",
]
// coleção -> [list, view, create, update, delete]: índice em OLD_GROUPS; -1 = a regra não
// tinha bloco (só o vínculo); null = regra vazia (só o servidor)
const OLD_TABLE = {
  songs: [-1, -1, 0, 0, 0],
  song_videos: [-1, -1, 0, 0, 0],
  events: [-1, -1, 0, 0, 0],
  event_moments: [-1, -1, 0, 0, 0],
  event_songs: [-1, -1, 0, 0, 0],
  event_tasks: [-1, -1, 0, 0, 0],
  event_members: [-1, -1, 0, 1, 0],
  media_assets: [-1, -1, 2, 2, 2],
  roles: [-1, -1, 0, 0, 0],
  member_roles: [-1, -1, 0, 0, 0],
  audit_logs: [0, 0, null, null, null],
  invitations: [3, 3, null, null, null],
  churches: [-1, -1, null, 3, null],
  church_members: [-1, -1, 4, 4, 0],
  people: [5, 5, 6, 6, 7],
  people_events: [7, 7, 7, 7, 7],
  people_relations: [7, 7, 7, 7, 7],
  people_signup_links: [7, 7, 7, 7, 7],
  people_signups: [7, 7, null, 7, 7],
  church_groups: [7, 7, 7, 7, 7],
  church_group_members: [7, 7, 7, 7, 7],
  church_events: [8, 8, 8, 8, 8],
  church_event_registrations: [8, 8, 8, 8, 8],
  fin_accounts: [9, 9, 10, 10, null],
  fin_transactions: [9, 9, 10, 10, null],
  fin_counts: [11, 11, 10, 10, null],
  fin_bills: [11, 11, 10, 10, null],
  fin_budgets: [9, 9, null, null, null],
  fin_campaigns: [9, 9, 10, 10, null],
  fin_categories: [9, 9, 10, 10, null],
  fin_cost_centers: [9, 9, 10, 10, null],
  fin_suppliers: [9, 9, 10, 10, null],
  fin_settings: [11, 11, 10, 10, null],
  fin_signers: [11, 11, 10, 10, 10],
  fin_audits: [11, 11, null, null, null],
  fin_audit_comments: [11, 11, null, null, null],
  fin_closings: [11, 11, null, null, null],
  fin_bank_imports: [9, 9, null, null, null],
  fin_bank_connections: [9, 9, 10, 10, 10],
  fin_bank_lines: [9, 9, null, 10, null],
}

// Acha o bloco "( ... )" que vem logo depois de MARK. Devolve [início, fim] ou null.
function findGroup(rule) {
  const i = rule.indexOf(MARK)
  if (i === -1) return null
  const start = i + MARK.length - 1
  let depth = 0
  for (let j = start; j < rule.length; j++) {
    const ch = rule.charAt(j)
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return [start, j + 1]
    }
  }
  return null
}

function newGroups() {
  const M = "@collection.church_members.role ?= 'MASTER'"
  const P = (k) => '@collection.church_members.permissions ?~ \'"' + k + '"\''
  const ANY = (m) => '@collection.church_members.permissions ?~ \'"' + m + ".'"
  const CONG = (m, field) =>
    '(@collection.church_members.cong_' +
    m +
    ' ?~ \'"*"\' || @collection.church_members.cong_' +
    m +
    ' ?~ ' +
    field +
    ')'
  const or = (...xs) => '(' + [M].concat(xs).join(' || ') + ')'
  const anyOf = (keys) => (keys.length === 1 ? P(keys[0]) : '(' + keys.map(P).join(' || ') + ')')
  const scoped = (keys, m, field) => '(' + anyOf(keys) + ' && ' + CONG(m, field) + ')'

  const READ_LOUVOR = or(ANY('louvor'), ANY('culto'))
  const crud = (base) => [
    null,
    null,
    or(P(base + '.novo')),
    or(P(base + '.alterar')),
    or(P(base + '.excluir')),
  ]
  const withRead = (read, base) => {
    const r = crud(base)
    r[0] = read
    r[1] = read
    return r
  }
  const FREAD = ANY('financeiro')
  const finScoped = (field) => or('(' + FREAD + ' && ' + CONG('financeiro', field) + ')')
  const F = (k, field) => or(scoped([k], 'financeiro', field))
  const MEM_ = (keys, field) => or(scoped(keys, 'membresia', field))
  const EV = (keys, field) => or(scoped(keys, 'eventos', field))

  const g = {}
  g.songs = withRead(READ_LOUVOR, 'louvor.musicas')
  g.song_videos = withRead(READ_LOUVOR, 'louvor.musicas')
  g.events = withRead(READ_LOUVOR, 'louvor.cultos')
  g.event_moments = withRead(READ_LOUVOR, 'louvor.repertorio')
  g.event_songs = withRead(READ_LOUVOR, 'louvor.repertorio')
  g.event_tasks = withRead(READ_LOUVOR, 'louvor.tarefas')
  g.event_members = withRead(READ_LOUVOR, 'louvor.escalas')
  g.event_members[3] = or(
    P('louvor.escalas.alterar'),
    '(member_id.user_id ?= @request.auth.id && ' + P('louvor.minhas_escalas.confirmar') + ')',
  )
  g.media_assets = withRead(READ_LOUVOR, 'culto.midias')
  const READ_ROLES = or(ANY('louvor'), ANY('culto'), ANY('admin'))
  g.roles = withRead(READ_ROLES, 'admin.funcoes')
  g.member_roles = withRead(READ_ROLES, 'admin.funcoes')
  g.audit_logs = [or(P('admin.pessoas.ver'), P('admin.configuracoes.ver')), null, null, null, null]
  g.audit_logs[1] = g.audit_logs[0]
  g.invitations = [or(P('admin.pessoas.ver')), or(P('admin.pessoas.ver')), null, null, null]
  g.churches = [null, null, null, or(P('admin.configuracoes.alterar')), null]
  g.church_members = [
    null,
    null,
    or('(' + P('admin.pessoas.novo') + " && @request.body.role != 'MASTER')"),
    or(
      '(' + P('admin.pessoas.alterar') + " && @request.body.role != 'MASTER' && role != 'MASTER')",
    ),
    or('(' + P('admin.pessoas.excluir') + " && role != 'MASTER')"),
  ]

  // Membresia
  const PEOPLE_READ = or(
    '(' + ANY('membresia') + ' && ' + CONG('membresia', 'congregation') + ')',
    P('financeiro.contribuintes.ver'),
  )
  g.people = [
    PEOPLE_READ,
    PEOPLE_READ,
    or(
      scoped(
        ['membresia.pessoas.novo', 'membresia.cadastros.aprovar'],
        'membresia',
        'congregation',
      ),
      P('financeiro.contribuintes.novo'),
    ),
    or(
      scoped(
        [
          'membresia.pessoas.alterar',
          'membresia.pessoas.situacao',
          'membresia.acompanhamento.alterar',
        ],
        'membresia',
        'congregation',
      ),
      P('financeiro.contribuintes.alterar'),
    ),
    MEM_(['membresia.pessoas.excluir'], 'congregation'),
  ]
  const PE_WRITE = MEM_(
    [
      'membresia.pessoas.alterar',
      'membresia.pessoas.situacao',
      'membresia.acompanhamento.alterar',
      'membresia.painel.parabens',
    ],
    'person_id.congregation',
  )
  g.people_events = [
    MEM_(['membresia.pessoas.ver'], 'person_id.congregation'),
    MEM_(['membresia.pessoas.ver'], 'person_id.congregation'),
    PE_WRITE,
    PE_WRITE,
    PE_WRITE,
  ]
  const fam = (a) => MEM_(['membresia.familias.' + a], 'person_id.congregation')
  g.people_relations = [fam('ver'), fam('ver'), fam('novo'), fam('alterar'), fam('excluir')]
  const cad = (a) => MEM_(['membresia.cadastros.' + a], 'congregation')
  g.people_signup_links = [cad('ver'), cad('ver'), cad('novo'), cad('novo'), cad('excluir')]
  g.people_signups = [cad('ver'), cad('ver'), null, cad('aprovar'), cad('excluir')]
  const grp = (a) => MEM_(['membresia.grupos.' + a], 'congregation')
  g.church_groups = [grp('ver'), grp('ver'), grp('novo'), grp('alterar'), grp('excluir')]
  const grpm = (a) => MEM_(['membresia.grupos.' + a], 'group_id.congregation')
  g.church_group_members = [
    grpm('ver'),
    grpm('ver'),
    grpm('alterar'),
    grpm('alterar'),
    grpm('alterar'),
  ]

  // Eventos da igreja
  const CE_READ = or(
    '(' + ANY('eventos') + ' && ' + CONG('eventos', 'congregation') + ')',
    '(' + ANY('membresia') + ' && ' + CONG('membresia', 'congregation') + ')',
  )
  const ev = (a) => EV(['eventos.eventos.' + a], 'congregation')
  g.church_events = [CE_READ, CE_READ, ev('novo'), ev('alterar'), ev('excluir')]
  const REG_READ = or(
    scoped(
      ['eventos.inscricoes.ver', 'eventos.pagamentos.ver', 'eventos.checkin.ver'],
      'eventos',
      'event_id.congregation',
    ),
    scoped(['membresia.pessoas.ver'], 'membresia', 'event_id.congregation'),
  )
  g.church_event_registrations = [
    REG_READ,
    REG_READ,
    EV(['eventos.inscricoes.novo'], 'event_id.congregation'),
    // Quem só dá baixa ou faz check-in muda só esses campos (access_field_guards.js)
    EV(
      ['eventos.inscricoes.alterar', 'eventos.pagamentos.baixa', 'eventos.checkin.fazer'],
      'event_id.congregation',
    ),
    EV(['eventos.inscricoes.excluir'], 'event_id.congregation'),
  ]

  // Financeiro: ler = qualquer tela do financeiro; mudar = a chave da tela
  const FIN_READ = or(FREAD)
  const finFlat = (base, extraCreate) => [
    FIN_READ,
    FIN_READ,
    extraCreate ? or(P(base + '.novo'), P(extraCreate)) : or(P(base + '.novo')),
    or(P(base + '.alterar')),
    or(P(base + '.excluir')),
  ]
  g.fin_accounts = [
    finScoped('congregation'),
    finScoped('congregation'),
    F('financeiro.cadastros.novo', 'congregation'),
    F('financeiro.cadastros.alterar', 'congregation'),
    null,
  ]
  g.fin_transactions = [
    finScoped('account_id.congregation'),
    finScoped('account_id.congregation'),
    F('financeiro.lancamentos.novo', 'account_id.congregation'),
    F('financeiro.lancamentos.alterar', 'account_id.congregation'),
    null,
  ]
  g.fin_counts = [
    finScoped('account_id.congregation'),
    finScoped('account_id.congregation'),
    F('financeiro.contagem.novo', 'account_id.congregation'),
    F('financeiro.contagem.alterar', 'account_id.congregation'),
    null,
  ]
  g.fin_bills = [
    FIN_READ,
    FIN_READ,
    or(P('financeiro.contas_pagar.novo')),
    or(P('financeiro.contas_pagar.alterar')),
    null,
  ]
  g.fin_budgets = [finScoped('congregation'), finScoped('congregation'), null, null, null]
  g.fin_campaigns = [
    finScoped('congregation'),
    finScoped('congregation'),
    F('financeiro.campanhas.novo', 'congregation'),
    F('financeiro.campanhas.alterar', 'congregation'),
    null,
  ]
  g.fin_categories = finFlat('financeiro.cadastros')
  g.fin_cost_centers = finFlat('financeiro.cadastros')
  g.fin_suppliers = finFlat('financeiro.cadastros', 'financeiro.contas_pagar.novo')
  g.fin_settings = finFlat('financeiro.cadastros')
  g.fin_signers = finFlat('financeiro.cadastros')
  for (const name of ['fin_audits', 'fin_audit_comments', 'fin_closings', 'fin_bank_imports']) {
    g[name] = [FIN_READ, FIN_READ, null, null, null]
  }
  const CONC = or(P('financeiro.conciliacao.alterar'))
  g.fin_bank_connections = [FIN_READ, FIN_READ, CONC, CONC, CONC]
  g.fin_bank_lines = [FIN_READ, FIN_READ, null, CONC, null]
  return g
}

const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']
const SELF_OLD = '@request.body.operational_roles:isset = false'
const SELF_NEW =
  '@request.body.operational_roles:isset = false && @request.body.access_profiles:isset = false'

migrate(
  (app) => {
    const groups = newGroups()
    for (const name of Object.keys(OLD_TABLE)) {
      const col = app.findCollectionByNameOrId(name)
      const g = groups[name]
      for (let i = 0; i < RULES.length; i++) {
        const raw = col[RULES[i]]
        if (raw === null || raw === undefined || !g || !g[i]) continue
        let s = '' + raw
        const pos = findGroup(s)
        if (pos) s = s.slice(0, pos[0]) + g[i] + s.slice(pos[1])
        else if (s.indexOf(MARK.slice(0, -5)) !== -1) s = s + ' && ' + g[i]
        else throw new Error('0073: regra sem vínculo em ' + name + '.' + RULES[i])
        if (name === 'church_members' && i === 3) s = s.split(SELF_OLD).join(SELF_NEW)
        col[RULES[i]] = s
      }
      app.save(col)
    }
  },
  (app) => {
    for (const name of Object.keys(OLD_TABLE)) {
      const col = app.findCollectionByNameOrId(name)
      const row = OLD_TABLE[name]
      for (let i = 0; i < RULES.length; i++) {
        const raw = col[RULES[i]]
        if (raw === null || raw === undefined || row[i] === null) continue
        let s = '' + raw
        if (name === 'church_members' && i === 3) s = s.split(SELF_NEW).join(SELF_OLD)
        const pos = findGroup(s)
        if (!pos) continue
        if (row[i] === -1) s = s.slice(0, pos[0] - 4) + s.slice(pos[1])
        else s = s.slice(0, pos[0]) + OLD_GROUPS[row[i]] + s.slice(pos[1])
        col[RULES[i]] = s
      }
      app.save(col)
    }
  },
)
