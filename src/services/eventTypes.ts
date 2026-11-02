import pb from '@/lib/pocketbase/client'

/** Tipo de culto (Culto Dominical, Congresso, Rede Jovem...) com o horário padrão. */
export interface EventType {
  id: string
  church_id: string
  name: string
  start_time?: string
  end_time?: string
  order?: number
}

export async function listEventTypes(churchId: string): Promise<EventType[]> {
  try {
    return await pb.collection('event_types').getFullList<EventType>({
      filter: pb.filter('church_id = {:churchId}', { churchId }),
      sort: '+order,+name',
    })
  } catch (err: any) {
    // Servidor ainda sem a migração 0089: segue sem tipos
    if (err?.status === 404) return []
    throw err
  }
}

export async function saveEventType(
  churchId: string,
  data: { id?: string; name: string; start_time?: string; end_time?: string; order?: number },
): Promise<EventType> {
  const body = {
    church_id: churchId,
    name: data.name.trim(),
    start_time: data.start_time || '',
    end_time: data.end_time || '',
    order: data.order ?? 0,
  }
  if (data.id) return pb.collection('event_types').update<EventType>(data.id, body)
  return pb.collection('event_types').create<EventType>(body)
}

export async function deleteEventType(id: string): Promise<void> {
  await pb.collection('event_types').delete(id)
}
