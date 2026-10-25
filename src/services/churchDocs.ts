import pb from '@/lib/pocketbase/client'
import type { Church } from '@/types'

export type ChurchDocSettings = Pick<
  Church,
  'doc_signer_name' | 'doc_signer_title' | 'doc_city' | 'doc_address' | 'doc_cnpj'
>

/** Igreja com os dados dos documentos (o login guarda uma cópia antiga). */
export async function getChurchForDocs(id: string): Promise<Church> {
  return pb.collection('churches').getOne<Church>(id)
}

export async function saveChurchDocSettings(id: string, data: ChurchDocSettings): Promise<Church> {
  return pb.collection('churches').update<Church>(id, data)
}
