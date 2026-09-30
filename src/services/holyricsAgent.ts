import pb from '@/lib/pocketbase/client'

export interface HolyricsAgentInfo {
  id: string
  name: string
  machine_name?: string
  platform?: string
  version?: string
  status: 'ONLINE' | 'OFFLINE'
  last_seen_at?: string
  paired_at?: string
  holyrics_detected?: boolean
  holyrics_version?: string
  api_port?: number
  has_pairing_code?: boolean
  pairing_code?: string
  pairing_expires_at?: string
}

export interface PairingCodeResponse {
  success: boolean
  agent_id: string
  pairing_code: string
  raw_code: string
  expires_at: string
  message: string
}

export interface HolyricsTestResponse {
  success: boolean
  agent_online: boolean
  holyrics_connected: boolean
  result?: any
  error?: string
  error_code?: string
  message: string
  pending?: boolean
}

export interface HolyricsMatchSong {
  id: string
  title: string
  artist?: string
  key?: string
  bpm?: number
}

export interface SendToPlaylistResponse {
  success: boolean
  action?: string
  added?: boolean
  requires_selection?: boolean
  song_title?: string
  matches_count?: number
  matches?: HolyricsMatchSong[]
  holyrics_song_id?: string
  agent_id?: string
  command_id?: string
  poll_url?: string
  result?: any
  error?: string
  error_code?: string
  message: string
  pending?: boolean
}

export interface HolyricsCommandStatusResponse {
  success: boolean
  command_id: string
  action: string
  status: 'PENDING' | 'SENT' | 'DONE' | 'FAILED'
  result?: any
  error?: string
  created_at?: string
  executed_at?: string
  message?: string
}

export interface SyncEventSongItemResult {
  order: number
  event_song_id: string
  song_id: string
  song_title: string
  holyrics_song_id?: string | null
  action: string
  status: 'SUCCESS' | 'ERROR'
  error?: string
  detail: string
}

export interface SyncEventRepertoireSummary {
  total: number
  created: number
  already_existed: number
  added: number
  already_in_playlist: number
  errors: number
}

export interface SyncEventRepertoireResponse {
  success: boolean
  has_errors?: boolean
  event_id?: string
  agent_id?: string
  items?: SyncEventSongItemResult[]
  summary?: SyncEventRepertoireSummary
  error_code?: string
  agent_online?: boolean
  holyrics_detected?: boolean
  message: string
}

/**
 * Gera código temporário de pareamento de 6 dígitos no SaaS
 */
export async function generateHolyricsPairingCode(
  churchId: string,
  agentName = 'PC Projeção Holyrics',
): Promise<PairingCodeResponse> {
  return pb.send<PairingCodeResponse>('/backend/v1/saas/holyrics/pairing-code', {
    method: 'POST',
    body: { church_id: churchId, agent_name: agentName },
  })
}

/**
 * Lista agentes registrados para a igreja
 */
export async function listHolyricsAgents(churchId: string): Promise<HolyricsAgentInfo[]> {
  const res = await pb.send<{ success: boolean; agents: HolyricsAgentInfo[] }>(
    `/backend/v1/saas/holyrics/agents?church_id=${encodeURIComponent(churchId)}`,
    { method: 'GET' },
  )
  return res.agents || []
}

/**
 * Testa a conexão real entre SaaS -> Agent -> Holyrics Local API (sem mock)
 */
export async function testHolyricsAgent(
  churchId: string,
  agentId: string,
): Promise<HolyricsTestResponse> {
  return pb.send<HolyricsTestResponse>('/backend/v1/saas/holyrics/test', {
    method: 'POST',
    body: { church_id: churchId, agent_id: agentId },
  })
}

/**
 * Envia música para a playlist do Holyrics via LouvorFlow Agent
 */
export async function sendSongToHolyricsPlaylist(params: {
  churchId: string
  songId: string
  agentId?: string
  chosenHolyricsId?: string
}): Promise<SendToPlaylistResponse> {
  return pb.send<SendToPlaylistResponse>('/backend/v1/saas/holyrics/send-to-playlist', {
    method: 'POST',
    body: {
      church_id: params.churchId,
      song_id: params.songId,
      agent_id: params.agentId,
      chosen_holyrics_id: params.chosenHolyricsId,
    },
  })
}

/**
 * Consulta o status atual de um comando do Holyrics (polling)
 */
export async function getHolyricsCommandStatus(
  commandId: string,
): Promise<HolyricsCommandStatusResponse> {
  return pb.send<HolyricsCommandStatusResponse>(
    `/backend/v1/holyrics/commands/${encodeURIComponent(commandId)}/status`,
    {
      method: 'GET',
    },
  )
}

/**
 * Sincroniza o repertório de um evento/culto com o Holyrics via LouvorFlow Agent.
 * Processa as músicas na ordem exata do culto:
 * 1. Se songs.holyrics_song_id existe -> usa o ID
 * 2. Se não existe -> executa CreateSong, salva o ID na música do LouvorFlow
 * 3. Consulta GetLyricsPlaylist para evitar duplicação (idempotência)
 * 4. Adiciona à playlist (AddLyricsToPlaylist)
 */
export async function syncEventRepertoireWithHolyrics(params: {
  churchId: string
  eventId: string
  agentId?: string
}): Promise<SyncEventRepertoireResponse> {
  return pb.send<SyncEventRepertoireResponse>('/backend/v1/saas/holyrics/sync-event', {
    method: 'POST',
    body: {
      church_id: params.churchId,
      event_id: params.eventId,
      agent_id: params.agentId,
    },
  })
}
