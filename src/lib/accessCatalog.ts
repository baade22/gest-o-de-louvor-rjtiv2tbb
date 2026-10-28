/**
 * Catálogo dos perfis de acesso (estilo Eklesia): módulo > tela > ação.
 *
 * Cada permissão é uma chave `modulo.tela.acao` (ex.: `financeiro.lancamentos.novo`).
 * Um perfil guarda uma lista dessas chaves; a pessoa recebe um ou mais perfis e os
 * acessos somam. O servidor calcula a lista efetiva e as regras das coleções conferem
 * cada chave (ver pocketbase/migrations/0072 e 0073).
 *
 * As chaves aqui precisam bater com as das regras do servidor. O teste
 * accessCatalog.test.ts confere os perfis prontos da migração 0072 contra este catálogo.
 */

export type AccessAction = 'ver' | 'novo' | 'alterar' | 'excluir'

export const ACTION_LABELS: Record<AccessAction, string> = {
  ver: 'Consultar',
  novo: 'Novo',
  alterar: 'Alterar',
  excluir: 'Excluir',
}

export const STANDARD_ACTIONS: AccessAction[] = ['ver', 'novo', 'alterar', 'excluir']

export interface AccessSpecial {
  key: string
  label: string
}

export interface AccessScreen {
  key: string
  label: string
  /** Ações padrão que existem nesta tela (as outras aparecem como "—"). */
  actions: AccessAction[]
  specials?: AccessSpecial[]
}

export interface AccessModule {
  key: string
  label: string
  /** Módulos cujos dados têm congregação (Aldeia/Diamante) e respeitam a trava por congregação. */
  scoped: boolean
  screens: AccessScreen[]
}

const ALL: AccessAction[] = ['ver', 'novo', 'alterar', 'excluir']

export const ACCESS_MODULES: AccessModule[] = [
  {
    key: 'louvor',
    label: 'Louvor',
    scoped: false,
    screens: [
      { key: 'musicas', label: 'Músicas', actions: ALL },
      { key: 'cultos', label: 'Cultos e eventos do louvor', actions: ALL },
      { key: 'escalas', label: 'Escalas', actions: ALL },
      { key: 'repertorio', label: 'Repertório e roteiro do culto', actions: ALL },
      {
        key: 'minhas_escalas',
        label: 'Minhas escalas',
        actions: ['ver'],
        specials: [{ key: 'confirmar', label: 'Confirmar / recusar' }],
      },
      { key: 'tarefas', label: 'Tarefas', actions: ALL },
    ],
  },
  {
    key: 'culto',
    label: 'Equipes do culto',
    scoped: false,
    screens: [
      { key: 'som', label: 'Som', actions: ['ver', 'alterar'] },
      { key: 'projecao', label: 'Projeção', actions: ['ver', 'alterar'] },
      {
        key: 'midias',
        label: 'Mídias',
        actions: ALL,
        specials: [{ key: 'enviar', label: 'Enviar ao Holyrics' }],
      },
      { key: 'iluminacao', label: 'Iluminação', actions: ['ver', 'alterar'] },
      {
        key: 'computadores',
        label: 'Computadores conectados (Holyrics)',
        actions: ['ver', 'excluir'],
        specials: [
          { key: 'enviar', label: 'Enviar repertório ao telão' },
          { key: 'parear', label: 'Parear, renomear e testar' },
        ],
      },
    ],
  },
  {
    key: 'membresia',
    label: 'Membresia',
    scoped: true,
    screens: [
      {
        key: 'pessoas',
        label: 'Pessoas',
        actions: ALL,
        specials: [{ key: 'situacao', label: 'Mudar situação' }],
      },
      { key: 'familias', label: 'Famílias', actions: ALL },
      {
        key: 'painel',
        label: 'Painel e aniversariantes',
        actions: ['ver'],
        specials: [{ key: 'parabens', label: 'Enviar parabéns' }],
      },
      {
        key: 'cadastros',
        label: 'Cadastro por QR code',
        actions: ['ver', 'novo', 'excluir'],
        specials: [{ key: 'aprovar', label: 'Aprovar cadastro' }],
      },
      { key: 'acompanhamento', label: 'Acompanhamento de visitantes', actions: ['ver', 'alterar'] },
      { key: 'grupos', label: 'Grupos', actions: ALL },
      {
        key: 'documentos',
        label: 'Documentos e carteirinhas',
        actions: ['ver'],
        specials: [{ key: 'emitir', label: 'Emitir' }],
      },
      {
        key: 'relatorios',
        label: 'Relatórios',
        actions: ['ver'],
        specials: [{ key: 'exportar', label: 'Exportar CSV' }],
      },
    ],
  },
  {
    key: 'eventos',
    label: 'Eventos da igreja',
    scoped: true,
    screens: [
      { key: 'eventos', label: 'Eventos', actions: ALL },
      { key: 'inscricoes', label: 'Inscrições', actions: ALL },
      {
        key: 'pagamentos',
        label: 'Pagamentos',
        actions: ['ver'],
        specials: [{ key: 'baixa', label: 'Dar baixa' }],
      },
      {
        key: 'checkin',
        label: 'Check-in',
        actions: ['ver'],
        specials: [{ key: 'fazer', label: 'Fazer check-in' }],
      },
    ],
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    scoped: true,
    screens: [
      { key: 'painel', label: 'Painel', actions: ['ver'] },
      { key: 'lancamentos', label: 'Lançamentos', actions: ['ver', 'novo', 'alterar'] },
      {
        key: 'contagem',
        label: 'Contagem do culto',
        actions: ['ver', 'novo', 'alterar'],
        specials: [{ key: 'aprovar', label: 'Aprovar contagem' }],
      },
      {
        key: 'contas_pagar',
        label: 'Contas a pagar',
        actions: ['ver', 'novo', 'alterar'],
        specials: [{ key: 'baixa', label: 'Dar baixa' }],
      },
      { key: 'conciliacao', label: 'Saldos, bancos e conciliação', actions: ['ver', 'alterar'] },
      { key: 'fluxo', label: 'Fluxo de caixa', actions: ['ver'] },
      { key: 'campanhas', label: 'Campanhas', actions: ['ver', 'novo', 'alterar'] },
      { key: 'orcamento', label: 'Orçamento', actions: ['ver', 'alterar'] },
      {
        key: 'fechamento',
        label: 'Fechamento do mês',
        actions: ['ver'],
        specials: [{ key: 'fechar', label: 'Fechar o mês' }],
      },
      {
        key: 'auditoria',
        label: 'Auditoria',
        actions: ['ver'],
        specials: [
          { key: 'auditar', label: 'Auditar (aprovar e ressalvar)' },
          { key: 'responder', label: 'Responder ressalvas' },
        ],
      },
      {
        key: 'relatorios',
        label: 'Relatórios e informes',
        actions: ['ver'],
        specials: [{ key: 'exportar', label: 'Exportar para o contador' }],
      },
      {
        key: 'contribuintes',
        label: 'Contribuintes (pessoas no financeiro)',
        actions: ['ver', 'novo', 'alterar'],
      },
      {
        key: 'cadastros',
        label: 'Cadastros (contas, categorias, fornecedores, PIX)',
        actions: ALL,
      },
    ],
  },
  {
    key: 'admin',
    label: 'Administração',
    scoped: false,
    screens: [
      { key: 'pessoas', label: 'Pessoas com acesso e convites', actions: ALL },
      { key: 'funcoes', label: 'Funções e instrumentos', actions: ALL },
      { key: 'integracoes', label: 'Integrações', actions: ['ver', 'alterar'] },
      { key: 'configuracoes', label: 'Configurações da igreja', actions: ['ver', 'alterar'] },
    ],
  },
]

/** Todas as chaves de uma tela (ações padrão + especiais). */
export function screenKeys(mod: AccessModule, screen: AccessScreen): string[] {
  const base = `${mod.key}.${screen.key}`
  return [
    ...screen.actions.map((a) => `${base}.${a}`),
    ...(screen.specials || []).map((s) => `${base}.${s.key}`),
  ]
}

export function moduleKeys(mod: AccessModule): string[] {
  return mod.screens.flatMap((s) => screenKeys(mod, s))
}

export const ALL_ACCESS_KEYS: string[] = ACCESS_MODULES.flatMap(moduleKeys)

const KEY_SET = new Set(ALL_ACCESS_KEYS)

export function isKnownKey(key: string): boolean {
  return KEY_SET.has(key)
}

/** Mantém só chaves conhecidas, sem repetição, na ordem do catálogo. */
export function normalizeKeys(keys: string[]): string[] {
  const wanted = new Set(keys)
  return ALL_ACCESS_KEYS.filter((k) => wanted.has(k))
}

/**
 * Marcar uma ação de mudança (novo/alterar/excluir/especial) sem "Consultar" não faz
 * sentido: a pessoa não acharia a tela. Ao salvar, o Consultar da tela entra junto.
 */
export function withImpliedView(keys: string[]): string[] {
  const out = new Set(keys)
  for (const k of keys) {
    const parts = k.split('.')
    if (parts.length === 3 && parts[2] !== 'ver') {
      const view = `${parts[0]}.${parts[1]}.ver`
      if (KEY_SET.has(view)) out.add(view)
    }
  }
  return normalizeKeys([...out])
}

export type CheckState = 'on' | 'off' | 'partial'

export function groupState(keys: string[], selected: Set<string>): CheckState {
  if (keys.length === 0) return 'off'
  const n = keys.filter((k) => selected.has(k)).length
  if (n === 0) return 'off'
  return n === keys.length ? 'on' : 'partial'
}

/** Resumo curto de um perfil por módulo: "tudo", "ver" ou "parcial". */
export function summarizeProfile(
  keys: string[],
): { module: string; label: string; level: string }[] {
  const selected = new Set(keys)
  const out: { module: string; label: string; level: string }[] = []
  for (const mod of ACCESS_MODULES) {
    const all = moduleKeys(mod)
    const on = all.filter((k) => selected.has(k))
    if (on.length === 0) continue
    let level = 'parcial'
    if (on.length === all.length) level = 'tudo'
    else if (on.every((k) => k.endsWith('.ver'))) level = 'ver'
    out.push({ module: mod.key, label: mod.label, level })
  }
  return out
}

export interface AccessProfileLike {
  id: string
  name: string
  permissions: string[]
  congregations: string[]
  is_active: boolean
}

export interface EffectiveAccess {
  permissions: string[]
  /** Por módulo com congregação: ['*'] = todas; [] = nenhuma. */
  congregations: Record<string, string[]>
  /** De qual perfil veio cada chave (para a tela "o que ela pode fazer"). */
  sources: Record<string, string[]>
}

/**
 * Soma os perfis ativos. Mesma conta que o hook church_members_access.js faz no servidor.
 * Congregação é por módulo: se algum perfil que libera o módulo vale para todas, fica '*'.
 */
export function computeEffectiveAccess(profiles: AccessProfileLike[]): EffectiveAccess {
  const perms = new Set<string>()
  const sources: Record<string, string[]> = {}
  const congs: Record<string, Set<string>> = {}
  for (const mod of ACCESS_MODULES) if (mod.scoped) congs[mod.key] = new Set()
  for (const p of profiles) {
    if (!p.is_active) continue
    const touched = new Set<string>()
    for (const k of p.permissions) {
      if (!KEY_SET.has(k)) continue
      perms.add(k)
      ;(sources[k] = sources[k] || []).push(p.name)
      touched.add(k.split('.')[0])
    }
    for (const m of touched) {
      if (!congs[m]) continue
      if (!p.congregations || p.congregations.length === 0) congs[m].add('*')
      else p.congregations.forEach((c) => congs[m].add(c))
    }
  }
  const congregations: Record<string, string[]> = {}
  for (const [m, set] of Object.entries(congs)) {
    congregations[m] = set.has('*') ? ['*'] : [...set].sort()
  }
  return { permissions: normalizeKeys([...perms]), congregations, sources }
}

/** "Ninguém dá mais do que tem": um perfil só pode ser dado por quem já tem todas as chaves dele. */
export function canGrantProfile(granterPermissions: string[], profilePermissions: string[]) {
  const mine = new Set(granterPermissions)
  return profilePermissions.every((k) => mine.has(k))
}
