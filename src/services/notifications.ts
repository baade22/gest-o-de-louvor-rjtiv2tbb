import pb from '@/lib/pocketbase/client'
import type { InternalNotification } from '@/types'

export async function listNotifications(churchId?: string): Promise<{
  notifications: InternalNotification[]
  unread_count: number
}> {
  const query = churchId ? `?church_id=${encodeURIComponent(churchId)}` : ''
  return pb.send<{ notifications: InternalNotification[]; unread_count: number }>(
    `/backend/v1/notifications/list${query}`,
    { method: 'GET' },
  )
}

export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  const res = await pb.send<{ success: boolean }>('/backend/v1/notifications/mark_read', {
    method: 'POST',
    body: { notification_id: notificationId },
  })
  return res.success
}

export async function markAllNotificationsAsRead(): Promise<boolean> {
  const res = await pb.send<{ success: boolean }>('/backend/v1/notifications/mark_read', {
    method: 'POST',
    body: { all: true },
  })
  return res.success
}
