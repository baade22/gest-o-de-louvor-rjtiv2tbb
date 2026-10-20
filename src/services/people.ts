import pb from '@/lib/pocketbase/client'
import type { Person } from '@/types'

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
    data.append(key, value == null ? '' : String(value))
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
