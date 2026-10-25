export type AppRole = 'MASTER' | 'ADMIN' | 'LIDER' | 'MUSICO'
export type OperationalRole = 'MUSICO' | 'SOM' | 'PROJECAO' | 'MIDIA' | 'ILUMINACAO'

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
  operational_roles?: OperationalRole[]
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

export interface UserPermissions {
  church_id: string
  role: AppRole
  operational_roles: OperationalRole[]
  is_master: boolean
  is_admin: boolean
  is_leader: boolean
  permissions: string[]
  modules: string[]
}

export interface Invitation {
  id: string
  church_id: string
  email: string
  name: string
  token: string
  role: AppRole
  operational_roles?: OperationalRole[]
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED'
  expires_at: string
  accepted_at?: string | null
  created: string
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
  holyrics_song_id?: string
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
  | 'holyrics'
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
  holyrics_event_id?: string
  created: string
  updated: string
}

export type HolyricsEventLinkStatus =
  | 'LINKED'
  | 'EVENT_NOT_FOUND'
  | 'AMBIGUOUS_MATCH'
  | 'SYNC_PENDING'
  | 'INVALID_EVENT_DATE'
  | 'GET_SCHEDULES_FAILED'

export interface ResolveHolyricsEventResponse {
  success: boolean
  status: HolyricsEventLinkStatus | string
  linked: boolean
  holyrics_event_id: string
  event_id?: string
  matched_count?: number
  candidates_found?: number
  candidate_ids?: string[]
  schedule_name?: string
  error_code?: string
  agent_online?: boolean
  holyrics_detected?: boolean
  message: string
}

export type TeamArea = 'LOUVOR' | 'SOM' | 'PROJECAO' | 'MIDIA' | 'ILUMINACAO'

export type TaskStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
export type TaskPriority = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE'

export interface EventTask {
  id: string
  church_id: string
  event_id: string
  title: string
  description?: string
  team_area: TeamArea
  assigned_to?: string
  created_by?: string
  due_date?: string
  status: TaskStatus
  priority: TaskPriority
  completed_at?: string
  notes?: string
  created: string
  updated: string
  assigned_user?: {
    member_id: string
    user_id: string
    name: string
    email: string
  } | null
  created_user?: {
    member_id: string
    user_id: string
    name: string
    email: string
  } | null
}

export type MediaType = 'VIDEO' | 'IMAGEM' | 'AUDIO' | 'DOCUMENTO'
export type MediaCategory =
  | 'AGENDA'
  | 'ANIVERSARIANTES'
  | 'AVISOS'
  | 'CULTOS'
  | 'EVENTOS'
  | 'VIDEO_ESPECIAL'
  | 'OUTROS'

export type MediaStatus = 'ENVIADA' | 'RECEBIDA' | 'BAIXADA' | 'IMPORTADA_HOLYRICS' | 'CONCLUIDA'

export interface MediaAsset {
  id: string
  church_id: string
  event_id: string
  name: string
  original_filename?: string
  holyrics_filename?: string
  presentation_order?: number
  file: string
  media_type: MediaType
  category: MediaCategory
  size?: number
  duration?: number
  uploaded_by?: string
  assigned_operator?: string
  status: MediaStatus
  holyrics_status?: string
  downloaded_at?: string
  downloaded_by?: string
  imported_at?: string
  imported_by?: string
  /** Momento do roteiro em que a mídia entra. */
  moment_id?: string
  created: string
  updated: string
  expand?: {
    uploaded_by?: ChurchMember & { expand?: { user_id?: User } }
    assigned_operator?: ChurchMember & { expand?: { user_id?: User } }
    downloaded_by?: ChurchMember & { expand?: { user_id?: User } }
    imported_by?: ChurchMember & { expand?: { user_id?: User } }
    event_id?: EventItem
  }
}

export interface InternalNotification {
  id: string
  church_id: string
  user_id: string
  title: string
  message: string
  type: string
  source: string
  event_id?: string
  link?: string
  read: boolean
  read_at?: string
  created: string
}

export type HolyricsSyncStatus =
  | 'NOT_SYNCED'
  | 'CHECKING'
  | 'CREATING'
  | 'CREATED'
  | 'VERIFYING_CREATED_SONG'
  | 'CHECKING_PLAYLIST'
  | 'ADDING_TO_PLAYLIST'
  | 'VERIFYING_PLAYLIST'
  | 'ADDED_TO_PLAYLIST'
  | 'ALREADY_IN_PLAYLIST'
  | 'ERROR'

export interface EventSong {
  id: string
  church_id: string
  event_id: string
  song_id: string
  order: number
  custom_key?: string
  notes?: string
  holyrics_status?: HolyricsSyncStatus
  holyrics_synced_at?: string
  holyrics_error?: string
  holyrics_playlist_order?: number
  /** Membro (church_members) que puxa a música neste culto. */
  lead_vocal?: string
  /** Momento do roteiro em que a música entra. */
  moment_id?: string
  created: string
  updated: string
  expand?: {
    song_id?: Song
    lead_vocal?: ChurchMember & { expand?: { user_id?: User } }
  }
}

export type EventMomentKind =
  | 'ABERTURA'
  | 'LOUVOR'
  | 'AVISOS'
  | 'OFERTA'
  | 'PALAVRA'
  | 'MINISTRACAO'
  | 'ENCERRAMENTO'
  | 'OUTRO'

/** Um momento do roteiro do culto (a ordem que todas as equipes seguem). */
export interface EventMoment {
  id: string
  church_id: string
  event_id: string
  title: string
  kind: EventMomentKind
  /** "HH:MM" */
  start_time?: string
  duration_min?: number
  responsible?: string
  notes?: string
  order: number
  created: string
  updated: string
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
  team_area?: string
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

// Membresia
export type PersonStatus =
  | 'MEMBRO'
  | 'CONGREGADO'
  | 'VISITANTE'
  | 'AFASTADO'
  | 'TRANSFERIDO'
  | 'FALECIDO'
export type PersonGender = 'M' | 'F'
export type MaritalStatus = 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO' | 'VIUVO' | 'UNIAO_ESTAVEL'
export type AdmissionType = 'BATISMO' | 'TRANSFERENCIA' | 'ACLAMACAO' | 'RECONCILIACAO'
export type PersonSkill =
  | 'CANTA'
  | 'VIOLAO'
  | 'GUITARRA'
  | 'BAIXO'
  | 'TECLADO'
  | 'BATERIA'
  | 'PERCUSSAO'
  | 'SOPRO'
  | 'SOM'
  | 'LUZ'
  | 'PROJECAO'
  | 'VIDEO_FOTO'
  | 'RECEPCAO'
  | 'INFANTIL'
  | 'ENSINO'
  | 'COZINHA'

export interface Person {
  id: string
  collectionId?: string
  collectionName?: string
  church_id: string
  name: string
  photo?: string
  birth_date?: string
  gender?: PersonGender | ''
  marital_status?: MaritalStatus | ''
  wedding_date?: string
  phone?: string
  email?: string
  address?: string
  neighborhood?: string
  city?: string
  state?: string
  zip_code?: string
  congregation?: string
  status: PersonStatus
  conversion_date?: string
  baptism_date?: string
  admission_date?: string
  admission_type?: AdmissionType | ''
  church_office?: string
  notes?: string
  roll_number?: string
  skills?: PersonSkill[]
  user_id?: string
  followup_stage?: FollowupStage | ''
  /** Ficha de quem acompanha esta pessoa. */
  followup_owner?: string
  followup_since?: string
  created: string
  updated: string
}

export type FollowupStage = 'PRIMEIRA_VISITA' | 'CONTATO' | 'RETORNO' | 'INTEGRADO' | 'ENCERRADO'

export type PersonEventKind = 'SITUACAO' | 'CARGO' | 'VISITA' | 'CONTATO' | 'NOTA'

/** Registro da linha do tempo da pessoa (people_events). */
export interface PersonEvent {
  id: string
  church_id: string
  person_id: string
  kind: PersonEventKind
  date: string
  title: string
  description?: string
  from_status?: PersonStatus | ''
  to_status?: PersonStatus | ''
  created_by?: string
  created: string
  updated: string
}

/** "relative_id é <kind> de person_id" (people_relations). */
export type RelationKind = 'CONJUGE' | 'FILHO' | 'PAI_MAE' | 'IRMAO' | 'OUTRO'

export interface PersonRelation {
  id: string
  church_id: string
  person_id: string
  relative_id: string
  kind: RelationKind
  lives_together: boolean
  created: string
  updated: string
}

/** Link de autocadastro (QR code) da igreja. */
export interface SignupLink {
  id: string
  church_id: string
  title: string
  congregation?: string
  key: string
  active: boolean
  created_by?: string
  created: string
  updated: string
}

export type SignupRelationship = 'VISITANTE' | 'FREQUENTA' | 'MEMBRO'
export type SignupStatus = 'PENDENTE' | 'APROVADO' | 'RECUSADO'

/** Ficha enviada pelo formulário público, aguardando aprovação (people_signups). */
export interface PersonSignup {
  id: string
  church_id: string
  link_id?: string
  name: string
  birth_date?: string
  gender?: PersonGender | ''
  marital_status?: MaritalStatus | ''
  phone?: string
  email?: string
  address?: string
  neighborhood?: string
  city?: string
  state?: string
  zip_code?: string
  congregation?: string
  relationship: SignupRelationship
  baptized?: boolean
  how_found?: string
  prayer_request?: string
  status: SignupStatus
  person_id?: string
  reviewed_by?: string
  reviewed_at?: string
  created: string
  updated: string
}

/** Evento da igreja com inscrição (retiro, curso, batismo) — church_events. */
export interface ChurchEvent {
  id: string
  church_id: string
  title: string
  description?: string
  starts_on: string
  ends_on?: string
  start_time?: string
  location?: string
  congregation?: string
  price?: number
  capacity?: number
  payment_info?: string
  registration_open: boolean
  public_key: string
  created_by?: string
  created: string
  updated: string
}

export type PaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO' | 'ISENTO' | 'OUTRO'

/** Inscrito em um evento da igreja — church_event_registrations. */
export interface EventRegistration {
  id: string
  church_id: string
  event_id: string
  person_id?: string
  name: string
  phone?: string
  email?: string
  notes?: string
  source?: 'SECRETARIA' | 'LINK' | ''
  paid: boolean
  paid_amount?: number
  payment_method?: PaymentMethod | ''
  attended: boolean
  created: string
  updated: string
}
