import pb from '@/lib/pocketbase/client'
import type { Church } from '@/types'

export type ChurchDocSettings = Pick<
  Church,
  | 'doc_signer_name'
  | 'doc_signer_title'
  | 'doc_city'
  | 'doc_address'
  | 'doc_cnpj'
  | 'doc_statute_registry'
  | 'doc_legal_name'
>

/** Igreja com os dados dos documentos (o login guarda uma cópia antiga). */
export async function getChurchForDocs(id: string): Promise<Church> {
  return pb.collection('churches').getOne<Church>(id)
}

export async function saveChurchDocSettings(id: string, data: ChurchDocSettings): Promise<Church> {
  return pb.collection('churches').update<Church>(id, data)
}

/** Nome completo para documentos (cai no nome curto se não foi preenchido). */
export function churchLegalName(church: Pick<Church, 'name' | 'doc_legal_name'>): string {
  return church.doc_legal_name?.trim() || church.name
}

/** Endereço do logo da igreja (campo churches.logo), ou vazio. */
export function churchLogoUrl(church: Pick<Church, 'id' | 'logo'>): string {
  return church.logo ? pb.files.getURL(church as never, church.logo) : ''
}

/** Troca o logo da igreja usado nos documentos. */
export async function uploadChurchLogo(id: string, file: File): Promise<Church> {
  const fd = new FormData()
  fd.set('logo', file)
  return pb.collection('churches').update<Church>(id, fd)
}
