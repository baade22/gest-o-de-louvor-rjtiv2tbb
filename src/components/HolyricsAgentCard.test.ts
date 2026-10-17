import { describe, expect, it } from 'vitest'
import { agentState, isOutdatedVersion, isStaleAgent } from './HolyricsAgentCard'
import type { HolyricsAgentInfo } from '@/services/holyricsAgent'

const NOW = new Date('2026-10-17T12:00:00Z').getTime()
const agent = (over: Partial<HolyricsAgentInfo> = {}): HolyricsAgentInfo => ({
  id: 'a1',
  name: 'Projeção',
  status: 'OFFLINE',
  ...over,
})

describe('agentState', () => {
  it('online vence tudo', () => {
    expect(agentState(agent({ status: 'ONLINE' }), NOW).key).toBe('online')
  })
  it('pareado e parado é offline', () => {
    expect(agentState(agent({ paired_at: '2026-10-01 10:00:00.000Z' }), NOW).key).toBe('offline')
  })
  it('código ainda válido aguarda pareamento', () => {
    const a = agent({ has_pairing_code: true, pairing_expires_at: '2026-10-17 12:05:00.000Z' })
    expect(agentState(a, NOW).key).toBe('pairing')
  })
  it('código vencido sem pareamento nunca conectou', () => {
    const a = agent({ has_pairing_code: true, pairing_expires_at: '2026-10-17 11:00:00' })
    expect(agentState(a, NOW).key).toBe('never')
  })
})

describe('isStaleAgent', () => {
  it('sem contato há mais de 30 dias', () => {
    expect(isStaleAgent(agent({ last_seen_at: '2026-09-01 10:00:00.000Z' }), NOW)).toBe(true)
    expect(isStaleAgent(agent({ last_seen_at: '2026-10-14 10:00:00.000Z' }), NOW)).toBe(false)
  })
  it('nunca conectou conta como sem uso, código pendente não', () => {
    expect(isStaleAgent(agent(), NOW)).toBe(true)
    const pending = agent({ has_pairing_code: true, pairing_expires_at: '2026-10-17 12:05:00Z' })
    expect(isStaleAgent(pending, NOW)).toBe(false)
  })
  it('online nunca é sem uso', () => {
    expect(isStaleAgent(agent({ status: 'ONLINE' }), NOW)).toBe(false)
  })
})

describe('isOutdatedVersion', () => {
  it('compara por número, não por texto', () => {
    expect(isOutdatedVersion('0.0.9', '0.0.37')).toBe(true)
    expect(isOutdatedVersion('0.0.37', '0.0.37')).toBe(false)
    expect(isOutdatedVersion('0.1.0', '0.0.37')).toBe(false)
    expect(isOutdatedVersion(undefined)).toBe(false)
  })
})
