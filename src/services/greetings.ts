import pb from '@/lib/pocketbase/client'
import type { Church, PersonEvent } from '@/types'
import type { Celebration } from '@/lib/membership'
import { GREETING_SENT_TITLE } from '@/lib/greetings'
import { createPersonEvent } from '@/services/people'

export async function saveGreetings(
  churchId: string,
  data: Pick<Church, 'greeting_birthday' | 'greeting_wedding'>,
): Promise<Church> {
  return pb.collection('churches').update<Church>(churchId, data)
}

/** Contatos registrados hoje (para marcar quem já recebeu os parabéns). */
export async function listContactsOn(churchId: string, dayYMD: string): Promise<PersonEvent[]> {
  return pb.collection('people_events').getFullList<PersonEvent>({
    filter: pb.filter(
      "church_id = {:churchId} && kind = 'CONTATO' && date >= {:start} && date <= {:end}",
      {
        churchId,
        start: `${dayYMD} 00:00:00`,
        end: `${dayYMD} 23:59:59`,
      },
    ),
  })
}

/** Deixa na linha do tempo da pessoa que os parabéns foram enviados. */
export async function registerGreeting(
  churchId: string,
  c: Celebration,
  dayYMD: string,
  message: string,
): Promise<PersonEvent> {
  return createPersonEvent({
    church_id: churchId,
    person_id: c.person.id,
    kind: 'CONTATO',
    date: `${dayYMD} 00:00:00.000Z`,
    title: GREETING_SENT_TITLE[c.kind],
    description: message,
  })
}
