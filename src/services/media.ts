import pb from '@/lib/pocketbase/client'
import type { MediaAsset, MediaStatus } from '@/types'

export async function listEventMedia(churchId: string, eventId: string): Promise<MediaAsset[]> {
  return pb.collection('media_assets').getFullList<MediaAsset>({
    filter: `church_id = "${churchId}" && event_id = "${eventId}"`,
    expand:
      'uploaded_by.user_id,assigned_operator.user_id,downloaded_by.user_id,imported_by.user_id',
    sort: '-created',
  })
}

export async function listAllChurchMedia(churchId: string): Promise<MediaAsset[]> {
  return pb.collection('media_assets').getFullList<MediaAsset>({
    filter: `church_id = "${churchId}"`,
    expand: 'uploaded_by.user_id,assigned_operator.user_id,event_id',
    sort: '-created',
  })
}

export async function uploadMediaAsset(formData: FormData): Promise<MediaAsset> {
  const record = await pb.collection('media_assets').create<MediaAsset>(formData)
  // Dispara a notificação interna para o operador responsável
  try {
    await pb.send('/backend/v1/media/notify', {
      method: 'POST',
      body: { media_id: record.id },
    })
  } catch (err) {
    console.error('Falha ao disparar notificação de mídia:', err)
  }
  return record
}

export async function updateMediaStatus(
  mediaId: string,
  status: MediaStatus,
  holyricsStatus?: string,
): Promise<MediaAsset> {
  const res = await pb.send<{ success: boolean; media: MediaAsset }>('/backend/v1/media/status', {
    method: 'POST',
    body: {
      media_id: mediaId,
      status,
      holyrics_status: holyricsStatus,
    },
  })
  return res.media
}

export async function updateMediaOrder(
  mediaId: string,
  presentationOrder: number,
): Promise<MediaAsset> {
  return pb.collection('media_assets').update<MediaAsset>(mediaId, {
    presentation_order: presentationOrder,
  })
}

export function getMediaFileUrl(record: MediaAsset): string {
  if (!record || !record.file) return ''
  return pb.files.getURL(record, record.file)
}

export async function deleteMediaAsset(mediaId: string): Promise<boolean> {
  await pb.collection('media_assets').delete(mediaId)
  return true
}

export interface TransferMediaResponse {
  success: boolean
  command_id?: string
  agent_online?: boolean
  target_subfolder?: string
  pending?: boolean
  already_enqueued?: boolean
  message: string
  error_code?: string
}

/**
 * Dispara comando TRANSFER_MEDIA na fila do LouvorFlow Agent para o computador local
 */
export async function transferMediaToHolyricsAgent(params: {
  mediaId: string
  churchId?: string
  agentId?: string
  targetSubfolder?: 'image' | 'video' | 'audio' | 'automaticPresentations'
}): Promise<TransferMediaResponse> {
  return pb.send<TransferMediaResponse>('/backend/v1/saas/holyrics/transfer-media', {
    method: 'POST',
    body: {
      media_id: params.mediaId,
      church_id: params.churchId,
      agent_id: params.agentId,
      target_subfolder: params.targetSubfolder,
    },
  })
}

export interface SyncMediaPlaylistResponse {
  success: boolean
  command_id?: string
  agent_online?: boolean
  total_items?: number
  message?: string
  error_code?: string
}

export async function syncEventMediaPlaylistWithHolyrics(
  eventId: string,
  churchId: string,
  agentId?: string,
): Promise<SyncMediaPlaylistResponse> {
  return pb.send<SyncMediaPlaylistResponse>('/backend/v1/saas/holyrics/sync-media-playlist', {
    method: 'POST',
    body: {
      event_id: eventId,
      church_id: churchId,
      agent_id: agentId,
    },
  })
}
