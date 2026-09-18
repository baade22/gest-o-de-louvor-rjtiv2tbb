import pb from '@/lib/pocketbase/client'
import type { Role } from '@/types'

export interface MusicianPayload {
  church_id: string
  member_id?: string
  name: string
  email: string
  phone?: string
  role: 'ADMIN' | 'LIDER' | 'MUSICO'
  is_active: boolean
  role_ids: string[]
}

export interface MusicianDetailResponse {
  id: string
  church_id: string
  user_id: string
  role: 'ADMIN' | 'LIDER' | 'MUSICO'
  phone?: string
  is_active: boolean
  created: string
  updated: string
  name: string
  email: string
  role_ids: string[]
  roles: Role[]
  expand?: {
    user_id?: {
      id: string
      name: string
      email: string
    }
  }
}

export interface MusiciansListResponse {
  items: MusicianDetailResponse[]
  totalItems: number
}

/**
 * Salva (cria ou edita) um músico com validação de multi-tenant e persistência garantida no PocketBase.
 */
export async function saveMusician(payload: MusicianPayload): Promise<{
  success: boolean
  message: string
  member: Record<string, unknown>
}> {
  // Chamada ao hook dedicado do backend que executa transação e persistência em _pb_users_auth_, church_members e member_roles
  const response = await pb.send<{
    success: boolean
    message: string
    member: Record<string, unknown>
  }>('/backend/v1/musicians/save', {
    method: 'POST',
    body: payload,
  })

  return response
}

/**
 * Busca os detalhes de um músico específico.
 */
export async function getMusician(
  memberId: string,
  churchId?: string,
): Promise<MusicianDetailResponse> {
  const query = churchId ? `?church_id=${encodeURIComponent(churchId)}` : ''
  const response = await pb.send<MusicianDetailResponse>(
    `/backend/v1/musicians/${encodeURIComponent(memberId)}${query}`,
    {
      method: 'GET',
    },
  )
  return response
}

/**
 * Lista os músicos de uma congregação com nomes, e-mails e papéis já consolidados.
 */
export async function listMusicians(churchId: string): Promise<MusicianDetailResponse[]> {
  const response = await pb.send<MusiciansListResponse>(
    `/backend/v1/musicians?church_id=${encodeURIComponent(churchId)}`,
    {
      method: 'GET',
    },
  )
  return response.items || []
}
