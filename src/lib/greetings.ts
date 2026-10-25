/**
 * Mensagens de parabéns pelo WhatsApp: modelo da igreja com campos que viram
 * o nome da pessoa, a idade ou os anos de casados e o nome da igreja.
 */
import type { Church, Person, PersonEvent } from '@/types'
import type { CelebrationKind } from '@/lib/membership'
import { toCalendarYMD } from '@/lib/dateUtils'

export const GREETING_FIELDS: Array<{ token: string; label: string }> = [
  { token: '{nome}', label: 'primeiro nome' },
  { token: '{nome_completo}', label: 'nome completo' },
  { token: '{anos}', label: 'idade ou anos de casados' },
  { token: '{igreja}', label: 'nome da igreja' },
]

export const DEFAULT_GREETINGS: Record<CelebrationKind, string> = {
  NASCIMENTO:
    'Feliz aniversário, {nome}! 🎉 Que o Senhor abençoe sua vida ricamente neste novo ano. Com carinho, {igreja}.',
  CASAMENTO:
    'Feliz aniversário de casamento, {nome}! 💍 Que Deus continue abençoando a família de vocês. Com carinho, {igreja}.',
}

/** Título do registro na linha do tempo; também serve para saber se já foi enviado. */
export const GREETING_SENT_TITLE: Record<CelebrationKind, string> = {
  NASCIMENTO: 'Parabéns de aniversário pelo WhatsApp',
  CASAMENTO: 'Parabéns de casamento pelo WhatsApp',
}

export function greetingTemplate(kind: CelebrationKind, church?: Pick<Church, 'greeting_birthday' | 'greeting_wedding'> | null): string {
  const custom = kind === 'NASCIMENTO' ? church?.greeting_birthday : church?.greeting_wedding
  return custom?.trim() || DEFAULT_GREETINGS[kind]
}

export function renderGreeting(
  template: string,
  data: { person: Pick<Person, 'name'>; years: number | null },
  churchName: string,
): string {
  const full = data.person.name.trim()
  return template
    .replace(/\{nome\}/g, full.split(/\s+/)[0] || '')
    .replace(/\{nome_completo\}/g, full)
    .replace(/\{anos\}/g, data.years === null ? '' : String(data.years))
    .replace(/\{igreja\}/g, churchName)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.!?])/g, '$1')
    .trim()
}

/** Quem já recebeu os parabéns hoje (chave "pessoa-tipo"). */
export function greetedToday(events: PersonEvent[], todayYMD: string): Set<string> {
  const out = new Set<string>()
  for (const e of events) {
    if (e.kind !== 'CONTATO' || toCalendarYMD(e.date) !== todayYMD) continue
    for (const kind of ['NASCIMENTO', 'CASAMENTO'] as CelebrationKind[]) {
      if (e.title === GREETING_SENT_TITLE[kind]) out.add(`${e.person_id}-${kind}`)
    }
  }
  return out
}
