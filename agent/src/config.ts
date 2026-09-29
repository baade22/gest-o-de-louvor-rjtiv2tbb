import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { AgentConfig } from './types.js'

const CONFIG_FILE = path.join(process.cwd(), 'agent.config.json')

export const DEFAULT_CONFIG: AgentConfig = {
  saasUrl:
    process.env.LOUVORFLOW_URL || 'https://gestao-de-louvor-f51d5.shrd00.internal.goskip.dev',
  agentId: '',
  agentToken: '',
  churchId: '',
  churchName: '',
  machineName: os.hostname() || 'PC-Igreja',
  holyricsHost: '127.0.0.1',
  holyricsPort: 8091,
  holyricsToken: '',
  agentWebPort: 8765,
  pollIntervalMs: 2500,
  heartbeatIntervalMs: 15000,
}

export function loadConfig(): AgentConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch (err: any) {
    console.error('[AgentConfig] Erro ao carregar agent.config.json:', err.message)
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(updates: Partial<AgentConfig>): AgentConfig {
  const current = loadConfig()
  const merged: AgentConfig = { ...current, ...updates }
  try {
    // Permissão restrita (apenas o usuário local pode ler/escrever)
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    })
  } catch (err: any) {
    console.error('[AgentConfig] Erro ao salvar agent.config.json:', err.message)
  }
  return merged
}
