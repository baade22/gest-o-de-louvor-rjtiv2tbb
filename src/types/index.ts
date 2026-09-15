export type AppRole = 'ADMIN' | 'LIDER' | 'MUSICO'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  created: string
  updated: string
}

export interface Church {
  id: string
  name: string
  slug: string
  logo?: string
  is_active: boolean
  subscription_plan?: string
  created: string
  updated: string
}

export interface Role {
  id: string
  church_id: string
  name: string
  description?: string
  color?: string
  created: string
  updated: string
}

export interface ChurchMember {
  id: string
  church_id: string
  user_id: string
  role: AppRole
  phone?: string
  is_active: boolean
  created: string
  updated: string
  // Expansões
  expand?: {
    user_id?: User
    church_id?: Church
  }
}

export interface MemberRole {
  id: string
  church_id: string
  member_id: string
  role_id: string
  created: string
  updated: string
  expand?: {
    role_id?: Role
    member_id?: ChurchMember
  }
}

export interface Song {
  id: string
  church_id: string
  title: string
  artist: string
  composer?: string
  key: string
  bpm?: number
  youtube_url?: string
  lyrics?: string
  chords?: string
  raw_content?: string
  cifra_club_url?: string
  source?: 'CIFRA_CLUB' | 'MANUAL' | string
  notes?: string
  created: string
  updated: string
}

export interface SongVideo {
  id: string
  church_id: string
  song_id: string
  youtube_video_id: string
  title?: string
  channel_name?: string
  thumbnail_url?: string
  is_primary: boolean
  created: string
  updated: string
}

export type IntegrationProvider =
  | 'youtube'
  | 'whatsapp'
  | 'email'
  | 'google'
  | 'push'
  | 'sms'
  | 'storage'
export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR'

export interface IntegrationItem {
  id?: string
  church_id: string
  provider: IntegrationProvider | string
  name: string
  enabled: boolean
  status: IntegrationStatus
  last_tested_at?: string | null
  last_error_message?: string
  configuration?: Record<string, unknown>
  has_credentials?: boolean
  masked_key?: string
  created?: string
  updated?: string
}

export interface TestIntegrationResult {
  success: boolean
  status: IntegrationStatus
  message: string
  last_tested_at?: string
}

export interface EventItem {
  id: string
  church_id: string
  title: string
  date: string
  start_time?: string
  end_time?: string
  description?: string
  status: 'Planejado' | 'Confirmado' | 'Realizado' | 'Cancelado'
  created: string
  updated: string
}

export interface EventSong {
  id: string
  church_id: string
  event_id: string
  song_id: string
  order: number
  custom_key?: string
  notes?: string
  created: string
  updated: string
  expand?: {
    song_id?: Song
  }
}

export type EventMemberStatus = 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO'

export interface EventMember {
  id: string
  church_id: string
  event_id: string
  member_id: string
  role_id: string
  status: EventMemberStatus
  response_at?: string
  decline_reason?: string
  notes?: string
  created: string
  updated: string
  expand?: {
    event_id?: EventItem
    member_id?: ChurchMember & {
      expand?: {
        user_id?: User
      }
    }
    role_id?: Role
  }
}
