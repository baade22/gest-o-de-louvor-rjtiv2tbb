import pb from '@/lib/pocketbase/client'
import type { EventMember, Person, PersonEvent, PersonRelation, RelationKind } from '@/types'
import type { ScaleEntry } from '@/lib/membership'

/** Campos editáveis da ficha (tudo menos id/datas de sistema/foto). */
export type PersonPayload = Omit<
  Person,
  'id' | 'collectionId' | 'collectionName' | 'photo' | 'created' | 'updated'
>

export interface PersonPhotoChange {
  /** Nova foto a enviar. */
  file?: File | null
  /** true remove a foto atual. */
  remove?: boolean
}

/** Lista todas as pessoas da igreja (só MASTER/ADMIN têm acesso, pela regra do PocketBase). */
export async function listPeople(churchId: string): Promise<Person[]> {
  return pb.collection('people').getFullList<Person>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
    sort: 'name',
  })
}

export async function getPerson(id: string): Promise<Person> {
  return pb.collection('people').getOne<Person>(id)
}

function toFormData(payload: Partial<PersonPayload>, photo?: PersonPhotoChange): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      // Campo de seleção múltipla: um valor por entrada; lista vazia limpa o campo
      if (value.length === 0) data.append(key, '')
      value.forEach((v) => data.append(key, String(v)))
    } else {
      data.append(key, value == null ? '' : String(value))
    }
  }
  if (photo?.file) data.append('photo', photo.file)
  else if (photo?.remove) data.append('photo', '')
  return data
}

export async function createPerson(
  payload: PersonPayload,
  photo?: PersonPhotoChange,
): Promise<Person> {
  return pb.collection('people').create<Person>(toFormData(payload, photo))
}

export async function updatePerson(
  id: string,
  payload: Partial<PersonPayload>,
  photo?: PersonPhotoChange,
): Promise<Person> {
  return pb.collection('people').update<Person>(id, toFormData(payload, photo))
}

export async function deletePerson(id: string): Promise<void> {
  await pb.collection('people').delete(id)
}

/** Token de arquivo para exibir as fotos protegidas (vale alguns minutos). */
export async function getPhotoToken(): Promise<string> {
  return pb.files.getToken()
}

export function personPhotoUrl(person: Person, token: string, thumb = true): string {
  if (!person.photo || !token) return ''
  return pb.files.getURL(person, person.photo, { token, ...(thumb ? { thumb: '200x200' } : {}) })
}

// ---------- Linha do tempo (people_events) ----------

export type PersonEventPayload = Pick<
  PersonEvent,
  'church_id' | 'person_id' | 'kind' | 'date' | 'title'
> &
  Partial<Pick<PersonEvent, 'description' | 'from_status' | 'to_status'>>

export async function listPersonEvents(personId: string): Promise<PersonEvent[]> {
  return pb.collection('people_events').getFullList<PersonEvent>({
    filter: pb.filter('person_id = {:personId}', { personId }),
    sort: '-date',
  })
}

/** Registros de mudança de situação da igreja (para a movimentação do painel). */
export async function listStatusChanges(churchId: string, year: number): Promise<PersonEvent[]> {
  return pb.collection('people_events').getFullList<PersonEvent>({
    filter: pb.filter(
      "church_id = {:churchId} && kind = 'SITUACAO' && date >= {:start} && date < {:end}",
      { churchId, start: `${year}-01-01 00:00:00`, end: `${year + 1}-01-01 00:00:00` },
    ),
    sort: '-date',
  })
}

export async function createPersonEvent(payload: PersonEventPayload): Promise<PersonEvent> {
  return pb.collection('people_events').create<PersonEvent>({
    ...payload,
    created_by: pb.authStore.record?.id,
  })
}

export async function deletePersonEvent(id: string): Promise<void> {
  await pb.collection('people_events').delete(id)
}

// ---------- Família (people_relations) ----------

export async function listRelations(churchId: string): Promise<PersonRelation[]> {
  return pb.collection('people_relations').getFullList<PersonRelation>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
  })
}

export async function createRelation(payload: {
  church_id: string
  person_id: string
  relative_id: string
  kind: RelationKind
  lives_together: boolean
}): Promise<PersonRelation> {
  return pb.collection('people_relations').create<PersonRelation>(payload)
}

export async function deleteRelation(id: string): Promise<void> {
  await pb.collection('people_relations').delete(id)
}

// ---------- Escalas de quem tem login ----------

/** Últimas escalas da conta vinculada à ficha (vazio se a pessoa não tem login). */
export async function listPersonScales(
  churchId: string,
  userId: string,
  limit = 10,
): Promise<ScaleEntry[]> {
  const res = await pb.collection('event_members').getList<EventMember>(1, limit, {
    filter: pb.filter('church_id = {:churchId} && member_id.user_id = {:userId}', {
      churchId,
      userId,
    }),
    sort: '-event_id.date',
    expand: 'event_id,role_id',
  })
  const STATUS: Record<string, string> = {
    CONFIRMADO: 'confirmou',
    PENDENTE: 'aguardando resposta',
    RECUSADO: 'recusou',
  }
  return res.items
    .filter((m) => m.expand?.event_id)
    .map((m) => ({
      id: m.id,
      date: m.expand!.event_id!.date,
      eventTitle: m.expand!.event_id!.title,
      role: m.expand?.role_id?.name,
      status: STATUS[m.status],
    }))
}
