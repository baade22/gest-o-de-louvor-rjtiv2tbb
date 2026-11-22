import type { Person } from '@/types'
import type { OnlineVoter } from '@/services/assemblies'

export interface OnlineVoterRow {
  id: string
  name: string
  cpf: string
  birth: string
  when: string
  ip: string
  device: string
}

/** "22/11/2026 13:40" no horário de Recife, a partir do created do PocketBase (UTC). */
export function recifeTime(created: string): string {
  const t = Date.parse(created.replace(' ', 'T'))
  if (Number.isNaN(t)) return ''
  const d = new Date(t - 3 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** Votantes em ordem alfabética (não pela hora, para não ajudar a ligar voto a pessoa). */
export function onlineVoterRows(
  voters: OnlineVoter[],
  peopleById: Map<string, Person>,
): OnlineVoterRow[] {
  return voters
    .map((v) => ({
      id: v.id,
      name: peopleById.get(v.person_id)?.name || v.name || 'Sem nome',
      cpf: v.cpf || '',
      birth: v.birth_date ? v.birth_date.split('-').reverse().join('/') : '',
      when: recifeTime(v.created),
      ip: v.ip || '',
      device: v.user_agent || '',
    }))
    .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
}

export function votersCsv(rows: OnlineVoterRow[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const head = ['Nome', 'CPF', 'Nascimento', 'Data e hora do voto', 'IP', 'Aparelho']
  return [head, ...rows.map((r) => [r.name, r.cpf, r.birth, r.when, r.ip, r.device])]
    .map((l) => l.map(q).join(';'))
    .join('\r\n')
}

export interface PresenceRow {
  name: string
  cpf: string
  /** "Assinado digitalmente em 22/11/2026 às 13:40" para quem votou on-line; vazio = assina no papel. */
  signed: string
  ip: string
}

const key = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Lista de presença: os presentes marcados na assembleia mais quem votou on-line (com ou
 * sem ficha). Quem votou on-line sai como assinado digitalmente, com data e hora.
 */
export function presenceRows(
  attendees: { name: string }[],
  voters: OnlineVoterRow[],
): PresenceRow[] {
  const byName = new Map<string, PresenceRow>()
  for (const a of attendees) byName.set(key(a.name), { name: a.name, cpf: '', signed: '', ip: '' })
  for (const v of voters) {
    const [date, time] = v.when.split(' ')
    const row = byName.get(key(v.name)) || { name: v.name, cpf: '', signed: '', ip: '' }
    row.cpf = v.cpf || row.cpf
    row.signed = date ? `Assinado digitalmente em ${date} às ${time}` : 'Assinado digitalmente'
    row.ip = v.ip
    byName.set(key(v.name), row)
  }
  return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
}
