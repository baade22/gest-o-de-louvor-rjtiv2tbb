import pb from '@/lib/pocketbase/client'
import type { EventTask, TeamArea, TaskStatus, TaskPriority } from '@/types'

export interface SaveTaskInput {
  id?: string
  church_id: string
  event_id: string
  title: string
  description?: string
  team_area: TeamArea
  assigned_to?: string | null
  due_date?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  notes?: string
}

export async function listEventTasks(
  churchId: string,
  eventId: string,
  teamArea?: string,
): Promise<EventTask[]> {
  const query = new URLSearchParams({
    church_id: churchId,
    event_id: eventId,
  })
  if (teamArea) query.set('team_area', teamArea)

  const res = await pb.send<{ tasks: EventTask[] }>(`/backend/v1/tasks/list?${query.toString()}`, {
    method: 'GET',
  })
  return res.tasks || []
}

export async function saveEventTask(input: SaveTaskInput): Promise<EventTask> {
  const res = await pb.send<{ success: boolean; task: EventTask }>('/backend/v1/tasks/save', {
    method: 'POST',
    body: input,
  })
  return res.task
}

export async function updateTaskStatus(
  taskId: string,
  churchId: string,
  status: TaskStatus,
  notes?: string,
): Promise<EventTask> {
  const res = await pb.send<{ success: boolean; task: EventTask }>('/backend/v1/tasks/save', {
    method: 'POST',
    body: {
      id: taskId,
      church_id: churchId,
      status,
      notes,
    },
  })
  return res.task
}

export async function deleteTask(taskId: string): Promise<boolean> {
  await pb.collection('event_tasks').delete(taskId)
  return true
}
