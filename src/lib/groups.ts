/**
 * Grupos e ministérios além do louvor: rótulos, modelos para começar,
 * ordenação dos participantes e sugestão de voluntários pelas habilidades.
 */
import type { ChurchGroup, GroupKind, GroupMember, GroupRole, Person, PersonSkill } from '@/types'
import { normalize } from '@/lib/membership'

export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  MINISTERIO: 'Ministério',
  DEPARTAMENTO: 'Departamento',
  GRUPO: 'Grupo pequeno',
}

export const GROUP_KIND_HINTS: Record<GroupKind, string> = {
  MINISTERIO: 'Uma área de serviço: infantil, recepção, mídia, intercessão',
  DEPARTAMENTO: 'Uma faixa da igreja: jovens, mulheres, homens, casais',
  GRUPO: 'Encontro nas casas, célula ou grupo de estudo',
}

export const GROUP_ROLE_LABELS: Record<GroupRole, string> = {
  LIDER: 'Líder',
  AUXILIAR: 'Auxiliar',
  PARTICIPANTE: 'Participante',
}

const ROLE_ORDER: GroupRole[] = ['LIDER', 'AUXILIAR', 'PARTICIPANTE']

/** Modelos para criar os grupos mais comuns com um toque. */
export const GROUP_TEMPLATES: Array<{ name: string; kind: GroupKind; skills: PersonSkill[] }> = [
  { name: 'Ministério infantil', kind: 'MINISTERIO', skills: ['INFANTIL'] },
  { name: 'Recepção', kind: 'MINISTERIO', skills: ['RECEPCAO'] },
  { name: 'Mídia e som', kind: 'MINISTERIO', skills: ['SOM', 'LUZ', 'PROJECAO', 'VIDEO_FOTO'] },
  { name: 'Ensino / EBD', kind: 'MINISTERIO', skills: ['ENSINO'] },
  { name: 'Cozinha', kind: 'MINISTERIO', skills: ['COZINHA'] },
  { name: 'Jovens', kind: 'DEPARTAMENTO', skills: [] },
  { name: 'Mulheres', kind: 'DEPARTAMENTO', skills: [] },
  { name: 'Homens', kind: 'DEPARTAMENTO', skills: [] },
  { name: 'Casais', kind: 'DEPARTAMENTO', skills: [] },
]

export interface MemberRow {
  member: GroupMember
  person: Person
}

/** Participantes com a ficha, líderes primeiro e depois por nome. Fichas apagadas somem. */
export function memberRows(members: GroupMember[], peopleById: Map<string, Person>): MemberRow[] {
  const rank = (r?: GroupRole | '') => ROLE_ORDER.indexOf(r || 'PARTICIPANTE')
  return members
    .map((member) => ({ member, person: peopleById.get(member.person_id) }))
    .filter((r): r is MemberRow => !!r.person)
    .sort(
      (a, b) =>
        rank(a.member.role) - rank(b.member.role) ||
        a.person.name.localeCompare(b.person.name, 'pt-BR'),
    )
}

export interface VolunteerSuggestion {
  person: Person
  matched: PersonSkill[]
}

/**
 * Membros e congregados que marcaram alguma habilidade do grupo e ainda não
 * participam dele; quem tem mais habilidades em comum vem primeiro.
 */
export function suggestVolunteers(
  group: Pick<ChurchGroup, 'skills' | 'congregation'>,
  people: Person[],
  memberIds: Set<string>,
): VolunteerSuggestion[] {
  const wanted = group.skills || []
  if (wanted.length === 0) return []
  return people
    .filter((p) => (p.status === 'MEMBRO' || p.status === 'CONGREGADO') && !memberIds.has(p.id))
    .filter((p) => !group.congregation || !p.congregation || p.congregation === group.congregation)
    .map((person) => ({ person, matched: wanted.filter((s) => (person.skills || []).includes(s)) }))
    .filter((s) => s.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length || a.person.name.localeCompare(b.person.name, 'pt-BR'),
    )
}

/** Grupos de que a pessoa participa, com o papel dela em cada um. */
export function groupsOfPerson(
  personId: string,
  groups: ChurchGroup[],
  members: GroupMember[],
): Array<{ group: ChurchGroup; role: GroupRole }> {
  const byId = new Map(groups.map((g) => [g.id, g]))
  return members
    .filter((m) => m.person_id === personId && byId.has(m.group_id))
    .map((m) => ({ group: byId.get(m.group_id)!, role: (m.role || 'PARTICIPANTE') as GroupRole }))
    .sort((a, b) => a.group.name.localeCompare(b.group.name, 'pt-BR'))
}

export function countByGroup(members: GroupMember[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of members) map.set(m.group_id, (map.get(m.group_id) || 0) + 1)
  return map
}

export interface GroupFilter {
  kind?: GroupKind | 'TODOS'
  congregation?: string
  search?: string
  showInactive?: boolean
}

export function filterGroups(groups: ChurchGroup[], filter: GroupFilter): ChurchGroup[] {
  const q = normalize(filter.search?.trim() || '')
  return groups
    .filter((g) => filter.showInactive || g.active)
    .filter((g) => !filter.kind || filter.kind === 'TODOS' || g.kind === filter.kind)
    .filter(
      (g) =>
        !filter.congregation ||
        filter.congregation === 'TODAS' ||
        !g.congregation ||
        g.congregation === filter.congregation,
    )
    .filter((g) => !q || normalize(g.name).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Nome e telefone de cada participante, um por linha, para colar no WhatsApp. */
export function phoneList(rows: MemberRow[]): string {
  return rows
    .filter((r) => r.person.phone)
    .map((r) => `${r.person.name}: ${r.person.phone}`)
    .join('\n')
}
