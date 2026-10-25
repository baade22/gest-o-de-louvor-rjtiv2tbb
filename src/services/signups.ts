import pb from '@/lib/pocketbase/client'
import type { Person, PersonSignup, PersonStatus, SignupLink, SignupStatus } from '@/types'
import { mergeSignupInto, newSignupKey, signupToPerson } from '@/lib/signups'
import { createPerson, updatePerson } from '@/services/people'

// ---------- Links / QR codes (só administradores) ----------

export async function listSignupLinks(churchId: string): Promise<SignupLink[]> {
  return pb.collection('people_signup_links').getFullList<SignupLink>({
    filter: pb.filter('church_id = {:churchId}', { churchId }),
    sort: '-created',
  })
}

export async function createSignupLink(
  churchId: string,
  title: string,
  congregation: string,
): Promise<SignupLink> {
  return pb.collection('people_signup_links').create<SignupLink>({
    church_id: churchId,
    title,
    congregation,
    key: newSignupKey(),
    active: true,
    created_by: pb.authStore.record?.id,
  })
}

export async function setSignupLinkActive(id: string, active: boolean): Promise<SignupLink> {
  return pb.collection('people_signup_links').update<SignupLink>(id, { active })
}

export async function deleteSignupLink(id: string): Promise<void> {
  await pb.collection('people_signup_links').delete(id)
}

// ---------- Cadastros recebidos ----------

export async function listSignups(
  churchId: string,
  status?: SignupStatus,
): Promise<PersonSignup[]> {
  const filter = status
    ? pb.filter('church_id = {:churchId} && status = {:status}', { churchId, status })
    : pb.filter('church_id = {:churchId}', { churchId })
  return pb.collection('people_signups').getFullList<PersonSignup>({ filter, sort: '-created' })
}

export async function countPendingSignups(churchId: string): Promise<number> {
  const res = await pb.collection('people_signups').getList(1, 1, {
    filter: pb.filter("church_id = {:churchId} && status = 'PENDENTE'", { churchId }),
    fields: 'id',
  })
  return res.totalItems
}

function markReviewed(id: string, status: SignupStatus, personId?: string) {
  return pb.collection('people_signups').update<PersonSignup>(id, {
    status,
    person_id: personId || '',
    reviewed_by: pb.authStore.record?.id,
    reviewed_at: new Date().toISOString().replace('T', ' '),
  })
}

/** Cria a ficha de membro a partir do cadastro e marca como aprovado. */
export async function approveAsNewPerson(
  signup: PersonSignup,
  status: PersonStatus,
): Promise<Person> {
  const person = await createPerson(
    signupToPerson(signup, status) as Parameters<typeof createPerson>[0],
  )
  await markReviewed(signup.id, 'APROVADO', person.id)
  return person
}

/** Completa uma ficha que já existe (só campos vazios) e marca como aprovado. */
export async function approveIntoExisting(signup: PersonSignup, person: Person): Promise<Person> {
  const patch = mergeSignupInto(person, signup)
  const saved = Object.keys(patch).length ? await updatePerson(person.id, patch) : person
  await markReviewed(signup.id, 'APROVADO', person.id)
  return saved
}

export async function rejectSignup(id: string): Promise<void> {
  await markReviewed(id, 'RECUSADO')
}

export async function deleteSignup(id: string): Promise<void> {
  await pb.collection('people_signups').delete(id)
}

// ---------- Formulário público (sem login) ----------

export interface SignupInfo {
  valid: boolean
  church_name?: string
  congregation?: string
  title?: string
  message?: string
}

export async function getSignupInfo(key: string): Promise<SignupInfo> {
  try {
    return await pb.send<SignupInfo>(`/backend/v1/signup/info?key=${encodeURIComponent(key)}`, {
      method: 'GET',
    })
  } catch (err) {
    const data = (err as { response?: SignupInfo }).response
    return { valid: false, message: data?.message || 'Não foi possível abrir o cadastro.' }
  }
}

export type PublicSignupPayload = Partial<
  Pick<
    PersonSignup,
    | 'name'
    | 'birth_date'
    | 'gender'
    | 'marital_status'
    | 'phone'
    | 'email'
    | 'address'
    | 'neighborhood'
    | 'city'
    | 'state'
    | 'zip_code'
    | 'congregation'
    | 'relationship'
    | 'baptized'
    | 'how_found'
    | 'prayer_request'
  >
> & { key: string; consent: boolean; website?: string }

export async function submitPublicSignup(payload: PublicSignupPayload): Promise<void> {
  await pb.send('/backend/v1/signup', { method: 'POST', body: payload })
}
