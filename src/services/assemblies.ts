import pb from '@/lib/pocketbase/client'
import type {
  Assembly,
  AssemblyAttendee,
  AssemblyCandidate,
  AssemblyItem,
  AtaSnapshot,
} from '@/lib/assemblies'

export type AssemblyPayload = Partial<
  Omit<Assembly, 'id' | 'church_id' | 'created' | 'updated' | 'minutes'>
>

export async function listAssemblies(churchId: string): Promise<Assembly[]> {
  return pb.collection('assemblies').getFullList<Assembly>({
    filter: pb.filter('church_id = {:c}', { c: churchId }),
    sort: '-date,-created',
  })
}

export async function getAssembly(id: string): Promise<Assembly> {
  return pb.collection('assemblies').getOne<Assembly>(id)
}

export async function createAssembly(churchId: string, data: AssemblyPayload): Promise<Assembly> {
  return pb.collection('assemblies').create<Assembly>({
    ...data,
    church_id: churchId,
    status: 'RASCUNHO',
    created_by: pb.authStore.record?.id || '',
  })
}

export async function updateAssembly(id: string, data: AssemblyPayload): Promise<Assembly> {
  return pb.collection('assemblies').update<Assembly>(id, data)
}

export async function deleteAssembly(id: string): Promise<void> {
  await pb.collection('assemblies').delete(id)
}

/** Congela a ata (só MASTER ou quem tem membresia.assembleias.ata). */
export async function finalizeAssembly(id: string, minutes: AtaSnapshot): Promise<Assembly> {
  return pb.collection('assemblies').update<Assembly>(id, {
    status: 'FINALIZADA',
    minutes,
    finalized_at: new Date().toISOString(),
  })
}

export async function reopenAssembly(id: string): Promise<Assembly> {
  return pb
    .collection('assemblies')
    .update<Assembly>(id, { status: 'REALIZADA', minutes: null, finalized_at: '' })
}

const byAssembly = (assemblyId: string) => pb.filter('assembly_id = {:a}', { a: assemblyId })

export async function listItems(assemblyId: string): Promise<AssemblyItem[]> {
  return pb
    .collection('assembly_items')
    .getFullList<AssemblyItem>({ filter: byAssembly(assemblyId), sort: 'order,created' })
}

export async function saveItem(
  assembly: Pick<Assembly, 'id' | 'church_id'>,
  id: string | null,
  data: Partial<AssemblyItem>,
): Promise<AssemblyItem> {
  if (id) return pb.collection('assembly_items').update<AssemblyItem>(id, data)
  return pb.collection('assembly_items').create<AssemblyItem>({
    ...data,
    church_id: assembly.church_id,
    assembly_id: assembly.id,
  })
}

export async function deleteItem(id: string): Promise<void> {
  await pb.collection('assembly_items').delete(id)
}

export async function listCandidates(assemblyId: string): Promise<AssemblyCandidate[]> {
  return pb
    .collection('assembly_candidates')
    .getFullList<AssemblyCandidate>({ filter: byAssembly(assemblyId), sort: 'order,created' })
}

export async function addCandidate(
  item: Pick<AssemblyItem, 'id' | 'church_id' | 'assembly_id'>,
  personId: string,
  order: number,
): Promise<AssemblyCandidate> {
  return pb.collection('assembly_candidates').create<AssemblyCandidate>({
    church_id: item.church_id,
    assembly_id: item.assembly_id,
    item_id: item.id,
    person_id: personId,
    order,
    votes: 0,
    elected: false,
  })
}

export async function updateCandidate(
  id: string,
  data: Partial<Pick<AssemblyCandidate, 'votes' | 'elected' | 'order'>>,
): Promise<AssemblyCandidate> {
  return pb.collection('assembly_candidates').update<AssemblyCandidate>(id, data)
}

export async function deleteCandidate(id: string): Promise<void> {
  await pb.collection('assembly_candidates').delete(id)
}

export async function listAttendees(assemblyId: string): Promise<AssemblyAttendee[]> {
  return pb
    .collection('assembly_attendees')
    .getFullList<AssemblyAttendee>({ filter: byAssembly(assemblyId) })
}

export async function addAttendee(
  assembly: Pick<Assembly, 'id' | 'church_id'>,
  personId: string,
  voter: boolean,
  arrived: string,
): Promise<AssemblyAttendee> {
  return pb.collection('assembly_attendees').create<AssemblyAttendee>({
    church_id: assembly.church_id,
    assembly_id: assembly.id,
    person_id: personId,
    voter,
    arrived,
  })
}

export async function updateAttendee(
  id: string,
  data: Partial<Pick<AssemblyAttendee, 'voter'>>,
): Promise<AssemblyAttendee> {
  return pb.collection('assembly_attendees').update<AssemblyAttendee>(id, data)
}

export async function removeAttendee(id: string): Promise<void> {
  await pb.collection('assembly_attendees').delete(id)
}

/* ---------------- votação on-line ---------------- */

export async function listOnlineVoters(
  assemblyId: string,
): Promise<{ id: string; person_id: string; created: string }[]> {
  return pb
    .collection('assembly_online_voters')
    .getFullList({ filter: byAssembly(assemblyId), sort: '-created' })
}

export async function listOnlineBallots(
  assemblyId: string,
): Promise<{ id: string; choice: string }[]> {
  return pb.collection('assembly_online_ballots').getFullList({ filter: byAssembly(assemblyId) })
}

export interface VoteInfo {
  church_name: string
  title: string
  date: string
  open: boolean
  chapa: { office: string; names: string[] }[]
}

export async function getVoteInfo(key: string): Promise<VoteInfo | { message: string }> {
  try {
    return await pb.send<VoteInfo>(
      `/backend/v1/assembly-vote/info?key=${encodeURIComponent(key)}`,
      {
        method: 'GET',
      },
    )
  } catch (err) {
    const data = (err as { response?: { message?: string } }).response
    return { message: data?.message || 'Não foi possível abrir a votação.' }
  }
}

export async function submitVote(payload: {
  key: string
  name: string
  cpf: string
  birth_date: string
  choice: string
  website: string
}): Promise<{ first_name?: string }> {
  return pb.send('/backend/v1/assembly-vote', { method: 'POST', body: payload })
}
