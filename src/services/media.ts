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

export function getMediaFileUrl(record: MediaAsset): string {
  if (!record || !record.file) return ''
  return pb.files.getURL(record, record.file)
}

export async function deleteMediaAsset(mediaId: string): Promise<boolean> {
  await pb.collection('media_assets').delete(mediaId)
  return true
}
