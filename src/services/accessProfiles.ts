import pb from '@/lib/pocketbase/client'
import type { AccessProfile } from '@/types'

/** Perfis de acesso da igreja (estilo Eklesia). Só o MASTER cria, altera e exclui. */
export async function listAccessProfiles(churchId: string): Promise<AccessProfile[]> {
  return pb.collection('access_profiles').getFullList<AccessProfile>({
    filter: pb.filter('church_id = {:c}', { c: churchId }),
    sort: '-is_system,name',
  })
}

export async function getAccessProfile(id: string): Promise<AccessProfile> {
  return pb.collection('access_profiles').getOne<AccessProfile>(id)
}

export interface AccessProfileInput {
  church_id: string
  name: string
  description: string
  permissions: string[]
  congregations: string[]
  is_active: boolean
}

export async function saveAccessProfile(
  id: string | null,
  data: AccessProfileInput,
): Promise<AccessProfile> {
  if (id) return pb.collection('access_profiles').update<AccessProfile>(id, data)
  return pb.collection('access_profiles').create<AccessProfile>(data)
}

export async function deleteAccessProfile(id: string): Promise<void> {
  await pb.collection('access_profiles').delete(id)
}

export interface AccessLogEntry {
  id: string
  action: string
  created: string
  details: {
    by_name?: string
    name?: string
    added?: string[]
    removed?: string[]
    master_before?: boolean
    master_after?: boolean
    new_member?: boolean
  }
}

/** Histórico de acesso de uma pessoa (ACESSO_ALTERADO) ou de um perfil (PERFIL_*). */
export async function listAccessHistory(
  churchId: string,
  entityType: 'church_members' | 'access_profiles',
  entityId: string,
): Promise<AccessLogEntry[]> {
  try {
    const res = await pb.collection('audit_logs').getList<AccessLogEntry>(1, 30, {
      filter: pb.filter('church_id = {:c} && entity_type = {:t} && entity_id = {:id}', {
        c: churchId,
        t: entityType,
        id: entityId,
      }),
      sort: '-created',
    })
    return res.items
  } catch {
    // audit_logs só abre para o MASTER e para quem gere as pessoas
    return []
  }
}
