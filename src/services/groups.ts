import pb from '@/lib/pocketbase/client'
import type { ChurchGroup, GroupMember, GroupRole } from '@/types'
import { getLocalTodayYMD } from '@/lib/dateUtils'

export type ChurchGroupPayload = Pick<
  ChurchGroup,
  | 'name'
  | 'kind'
  | 'description'
  | 'congregation'
  | 'meeting_info'
  | 'leader_id'
  | 'skills'
  | 'active'
>

export async function listGroups(churchId: string): Promise<ChurchGroup[]> {
  return pb.collection('church_groups').getFullList<ChurchGroup>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
    sort: 'name',
  })
}

export async function getGroup(id: string): Promise<ChurchGroup> {
  return pb.collection('church_groups').getOne<ChurchGroup>(id)
}

/** Grava o grupo e garante que o líder escolhido aparece como participante "Líder". */
export async function saveGroup(
  churchId: string,
  id: string | null,
  payload: ChurchGroupPayload,
): Promise<ChurchGroup> {
  const group = id
    ? await pb.collection('church_groups').update<ChurchGroup>(id, payload)
    : await pb.collection('church_groups').create<ChurchGroup>({ ...payload, church_id: churchId })
  if (group.leader_id) {
    const existing = await pb
      .collection('church_group_members')
      .getFirstListItem<GroupMember>(
        pb.filter('group_id = {:g} && person_id = {:p}', { g: group.id, p: group.leader_id }),
      )
      .catch(() => null)
    if (!existing) await addGroupMember(group, group.leader_id, 'LIDER')
    else if (existing.role !== 'LIDER') await updateGroupMemberRole(existing.id, 'LIDER')
  }
  return group
}

export async function deleteGroup(id: string): Promise<void> {
  await pb.collection('church_groups').delete(id)
}

export async function listAllGroupMembers(churchId: string): Promise<GroupMember[]> {
  return pb.collection('church_group_members').getFullList<GroupMember>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
  })
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  return pb.collection('church_group_members').getFullList<GroupMember>({
    filter: pb.filter('group_id = {:groupId}', { groupId }),
  })
}

export async function listPersonGroupMembers(personId: string): Promise<GroupMember[]> {
  return pb.collection('church_group_members').getFullList<GroupMember>({
    filter: pb.filter('person_id = {:personId}', { personId }),
  })
}

export async function addGroupMember(
  group: ChurchGroup,
  personId: string,
  role: GroupRole = 'PARTICIPANTE',
): Promise<GroupMember> {
  return pb.collection('church_group_members').create<GroupMember>({
    church_id: group.church_id,
    group_id: group.id,
    person_id: personId,
    role,
    since: `${getLocalTodayYMD()} 00:00:00.000Z`,
  })
}

export async function updateGroupMemberRole(id: string, role: GroupRole): Promise<GroupMember> {
  return pb.collection('church_group_members').update<GroupMember>(id, { role })
}

export async function removeGroupMember(id: string): Promise<void> {
  await pb.collection('church_group_members').delete(id)
}
