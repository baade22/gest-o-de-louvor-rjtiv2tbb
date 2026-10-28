import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACCESS_MODULES,
  ALL_ACCESS_KEYS,
  canGrantProfile,
  computeEffectiveAccess,
  isKnownKey,
  summarizeProfile,
  withImpliedView,
} from './accessCatalog'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const MIGRATION = 'pocketbase/migrations/0072_access_profiles.js'
const RULES = 'pocketbase/migrations/0073_access_profiles_rules.js'
const HOOK = 'pocketbase/hooks/church_members_access.js'

interface SystemProfile {
  system_key: string
  name: string
  is_system: boolean
  permissions: string[]
}

function systemProfiles(): SystemProfile[] {
  const src = read(MIGRATION)
  const start = src.indexOf('const SYSTEM_PROFILES =')
  const end = src.indexOf('// END SYSTEM_PROFILES')
  const body = src.slice(start, end).replace('const SYSTEM_PROFILES =', 'return ')
  return new Function(body)() as SystemProfile[]
}

/** Texto da função applyAccessProfiles, sem a indentação (as duas cópias ficam em níveis diferentes) */
function applyFn(path: string): string {
  const src = read(path)
  const start = src.indexOf('function applyAccessProfiles(')
  let depth = 0
  let i = src.indexOf('{', start)
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) break
  }
  return src
    .slice(start, i + 1)
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
}

const KEY_RE = /'((?:louvor|culto|membresia|eventos|financeiro|admin)\.[a-z_]+\.[a-z_]+)'/g

describe('catálogo dos perfis de acesso', () => {
  it('não tem chave repetida e toda chave tem o formato modulo.tela.acao', () => {
    expect(new Set(ALL_ACCESS_KEYS).size).toBe(ALL_ACCESS_KEYS.length)
    for (const k of ALL_ACCESS_KEYS) expect(k).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/)
  })

  it('toda tela tem Consultar', () => {
    for (const mod of ACCESS_MODULES) {
      for (const s of mod.screens) expect(s.actions).toContain('ver')
    }
  })

  it('os perfis prontos da migração 0072 só usam chaves do catálogo', () => {
    const profiles = systemProfiles()
    expect(profiles.length).toBeGreaterThanOrEqual(11)
    for (const p of profiles) {
      const unknown = p.permissions.filter((k) => !isKnownKey(k))
      expect(unknown, p.system_key).toEqual([])
    }
  })

  it('cada perfil pronto tem as funções antigas que ele substitui', () => {
    const keys = new Set(systemProfiles().map((p) => p.system_key))
    for (const k of [
      'ADMIN',
      'LIDER',
      'MUSICO',
      'SOM',
      'PROJECAO',
      'MIDIA',
      'ILUMINACAO',
      'FINANCEIRO',
      'AUDITOR',
      'MEMBRESIA',
      'EVENTOS',
    ]) {
      expect(keys.has(k), k).toBe(true)
    }
  })

  it('a conta do acesso é igual na migração e no hook', () => {
    expect(applyFn(MIGRATION)).toBe(applyFn(HOOK))
  })

  it('as regras (0073) e os hooks só conferem chaves que existem', () => {
    const files = [
      RULES,
      ...readdirSync(join(root, 'pocketbase/hooks'))
        .filter((f) => f.endsWith('.js'))
        .map((f) => `pocketbase/hooks/${f}`),
    ]
    const unknown: string[] = []
    for (const f of files) {
      for (const m of read(f).matchAll(KEY_RE)) {
        if (!isKnownKey(m[1])) unknown.push(`${f}: ${m[1]}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('as telas do site só pedem chaves que existem', () => {
    const files = ['src/App.tsx', 'src/components/Layout.tsx', 'src/pages/EventScaleDetail.tsx']
    const unknown: string[] = []
    for (const f of files) {
      for (const m of read(f).matchAll(KEY_RE)) {
        if (!isKnownKey(m[1])) unknown.push(`${f}: ${m[1]}`)
      }
      for (const m of read(f).matchAll(/requirePermission="([^"]+)"/g)) {
        if (!isKnownKey(m[1])) unknown.push(`${f}: ${m[1]}`)
      }
    }
    expect(unknown).toEqual([])
  })
})

describe('soma dos perfis', () => {
  const musico = {
    id: 'm',
    name: 'Músico',
    permissions: ['louvor.musicas.ver', 'louvor.minhas_escalas.ver'],
    congregations: [],
    is_active: true,
  }
  const finAldeia = {
    id: 'f',
    name: 'Financeiro',
    permissions: ['financeiro.painel.ver', 'financeiro.lancamentos.novo'],
    congregations: ['Aldeia'],
    is_active: true,
  }

  it('soma as chaves e guarda de qual perfil veio cada uma', () => {
    const eff = computeEffectiveAccess([musico, finAldeia])
    expect(eff.permissions).toContain('louvor.musicas.ver')
    expect(eff.permissions).toContain('financeiro.lancamentos.novo')
    expect(eff.sources['financeiro.painel.ver']).toEqual(['Financeiro'])
  })

  it('a congregação vale por módulo; perfil sem congregação vale para todas', () => {
    const eff = computeEffectiveAccess([musico, finAldeia])
    expect(eff.congregations.financeiro).toEqual(['Aldeia'])
    expect(eff.congregations.membresia).toEqual([])
    const both = computeEffectiveAccess([
      finAldeia,
      { ...finAldeia, id: 'g', name: 'Fin geral', congregations: [] },
    ])
    expect(both.congregations.financeiro).toEqual(['*'])
  })

  it('perfil inativo não conta', () => {
    const eff = computeEffectiveAccess([{ ...finAldeia, is_active: false }])
    expect(eff.permissions).toEqual([])
  })

  it('ninguém dá mais do que tem', () => {
    expect(
      canGrantProfile(['louvor.musicas.ver', 'louvor.minhas_escalas.ver'], musico.permissions),
    ).toBe(true)
    expect(canGrantProfile(['louvor.musicas.ver'], musico.permissions)).toBe(false)
  })

  it('marcar uma ação liga o Consultar da tela', () => {
    expect(withImpliedView(['financeiro.lancamentos.novo'])).toEqual([
      'financeiro.lancamentos.ver',
      'financeiro.lancamentos.novo',
    ])
  })

  it('resume o perfil por módulo', () => {
    expect(summarizeProfile(musico.permissions)).toEqual([
      { module: 'louvor', label: 'Louvor', level: 'ver' },
    ])
  })
})
