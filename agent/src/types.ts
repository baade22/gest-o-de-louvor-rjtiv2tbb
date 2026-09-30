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
  httpStatus?: number
  durationMs?: number
  rawText?: string
}

export interface DiagnosticStep {
  name: string
  label: string
  status: 'OK' | 'TIMEOUT' | 'ERROR' | 'SKIPPED'
  durationMs: number
  detail?: string
  technicalCause?: string
}

export interface SearchSongDiagnosticResult {
  endpoint: string
  method: string
  payloadSent: Record<string, any>
  httpStatus: number
  durationMs: number
  count: number
  rawResponse: string
  status: 'ok' | 'error'
  error?: string
  matches?: HolyricsSongItem[]
  checklist?: DiagnosticStep[]
  technicalCause?: string
  parsedJson?: any
  firstMatch?: {
    id: string
    title: string
    artist?: string
    author?: string
  }
}

export interface HolyricsTokenInfo {
  version: string
  permissions: string
}

export interface AgentCommand {
  id: string
  command_id: string
  action:
    | 'TEST_CONNECTION'
    | 'SEARCH_SONG'
    | 'ADD_TO_PLAYLIST'
    | 'CREATE_SONG'
    | 'GET_SONGS'
    | 'GET_SONG_PLAYLIST'
    | 'GET_LYRICS_PLAYLIST'
    | 'ADD_LYRICS_TO_PLAYLIST'
  payload: Record<string, any>
  created_at: string
}

export interface HolyricsSlideInput {
  text: string
  slide_description?: string
}

export interface HolyricsCreateSongPayload {
  title: string
  artist?: string
  author?: string
  note?: string
  copyright?: string
  slides: HolyricsSlideInput[]
  formatting_type?: string
  order?: string
  key?: string
  bpm?: number
  time_sig?: string
}

export interface HolyricsPlaylistItem {
  id: string
  title?: string
  artist?: string
  type?: string
  name?: string
  [key: string]: any
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
