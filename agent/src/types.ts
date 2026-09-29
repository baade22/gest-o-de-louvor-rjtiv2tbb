export interface AgentConfig {
  saasUrl: string
  agentId: string
  agentToken: string
  churchId?: string
  churchName?: string
  machineName?: string
  holyricsHost: string
  holyricsPort: number
  holyricsToken: string
  agentWebPort: number
  pollIntervalMs: number
  heartbeatIntervalMs: number
}

export interface HolyricsSongItem {
  id: string
  title: string
  artist?: string
  author?: string
  key?: string
  bpm?: number
  note?: string
  groups?: Array<{ name: string }>
  archived?: boolean
}

export interface HolyricsApiResponse<T = any> {
  status: 'ok' | 'error'
  data?: T
  error?: string | { message?: string; [key: string]: any }
}

export interface HolyricsTokenInfo {
  version: string
  permissions: string
}

export interface AgentCommand {
  id: string
  command_id: string
  action: 'TEST_CONNECTION' | 'SEARCH_SONG' | 'ADD_TO_PLAYLIST'
  payload: Record<string, any>
  created_at: string
}

export interface AgentStatusInfo {
  agentStatus: 'CONNECTED' | 'DISCONNECTED' | 'PAIRING_REQUIRED'
  holyricsStatus: 'DETECTED' | 'NOT_DETECTED' | 'UNAUTHORIZED' | 'ERROR'
  holyricsVersion?: string
  holyricsHost: string
  holyricsPort: number
  holyricsHasToken: boolean
  saasUrl: string
  churchName?: string
  machineName: string
  lastHeartbeat?: string
  lastPoll?: string
  lastError?: string
}
