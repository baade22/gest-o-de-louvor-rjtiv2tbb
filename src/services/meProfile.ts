import pb from '@/lib/pocketbase/client'

/** A própria ficha da pessoa em Membros (o que ela mesma pode preencher). */
export interface MyProfile {
  id?: string
  name: string
  birth_date: string
  phone: string
  email?: string
  gender?: string
  marital_status?: string
  zip_code?: string
  address?: string
  neighborhood?: string
  city?: string
  state?: string
  congregation?: string
  status?: string
}

export async function getMyProfile(
  churchId: string,
): Promise<{ pending: boolean; profile: MyProfile | null }> {
  try {
    return await pb.send(`/backend/v1/me/profile?church_id=${encodeURIComponent(churchId)}`, {
      method: 'GET',
    })
  } catch (err: any) {
    // Servidor ainda sem o hook (antes do Skip atualizar): não bloqueia ninguém
    if (err?.status === 404) return { pending: false, profile: null }
    throw err
  }
}

export async function saveMyProfile(churchId: string, data: MyProfile): Promise<void> {
  await pb.send('/backend/v1/me/profile', {
    method: 'POST',
    body: { ...data, church_id: churchId },
  })
}
