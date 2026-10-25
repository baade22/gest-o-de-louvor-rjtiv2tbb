/**
 * Regras puras do acompanhamento de visitantes: etapas, quem está parado e o
 * que aparece em cada coluna do quadro.
 */
import type { FollowupStage, Person } from '@/types'
import { toCalendarYMD } from '@/lib/dateUtils'

export const FOLLOWUP_STAGES: Array<{
  id: Exclude<FollowupStage, 'ENCERRADO'>
  label: string
  hint: string
}> = [
  { id: 'PRIMEIRA_VISITA', label: '1ª visita', hint: 'Veio pela primeira vez; ainda ninguém falou com a pessoa.' },
  { id: 'CONTATO', label: 'Contato feito', hint: 'Alguém ligou, mandou mensagem ou visitou.' },
  { id: 'RETORNO', label: 'Voltou', hint: 'Voltou a outros cultos; convide para célula ou classe.' },
  { id: 'INTEGRADO', label: 'Integrado', hint: 'Já faz parte; atualize a situação na ficha.' },
]

export const FOLLOWUP_LABELS: Record<FollowupStage, string> = {
  PRIMEIRA_VISITA: '1ª visita',
  CONTATO: 'Contato feito',
  RETORNO: 'Voltou',
  INTEGRADO: 'Integrado',
  ENCERRADO: 'Encerrado',
}

/** Dias sem andar de etapa a partir dos quais o quadro avisa. */
export const STALE_DAYS = 7

/**
 * Etapa atual da pessoa. Visitante sem etapa entra sozinho em "1ª visita",
 * assim ninguém cadastrado como visitante fica de fora do quadro.
 */
export function effectiveStage(p: Person): FollowupStage | null {
  if (p.followup_stage) return p.followup_stage
  return p.status === 'VISITANTE' ? 'PRIMEIRA_VISITA' : null
}

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/** Dias desde que entrou na etapa (sem data, conta desde o cadastro). */
export function daysInStage(p: Person, todayYMD: string): number {
  const since = toCalendarYMD(p.followup_since) || toCalendarYMD(p.created)
  if (!since) return 0
  return Math.max(0, dayNumber(todayYMD) - dayNumber(since))
}

export function isStale(p: Person, todayYMD: string): boolean {
  const stage = effectiveStage(p)
  if (!stage || stage === 'INTEGRADO' || stage === 'ENCERRADO') return false
  return daysInStage(p, todayYMD) >= STALE_DAYS
}

export function nextStage(stage: FollowupStage): FollowupStage | null {
  const i = FOLLOWUP_STAGES.findIndex((s) => s.id === stage)
  return i >= 0 && i < FOLLOWUP_STAGES.length - 1 ? FOLLOWUP_STAGES[i + 1].id : null
}

export interface BoardFilter {
  congregation?: string
  ownerId?: string
  onlyStale?: boolean
}

/** Pessoas de cada coluna, as paradas há mais tempo primeiro. */
export function boardColumns(people: Person[], todayYMD: string, filter: BoardFilter = {}) {
  const columns: Record<FollowupStage, Person[]> = {
    PRIMEIRA_VISITA: [],
    CONTATO: [],
    RETORNO: [],
    INTEGRADO: [],
    ENCERRADO: [],
  }
  for (const p of people) {
    const stage = effectiveStage(p)
    if (!stage) continue
    if (p.status === 'FALECIDO' || p.status === 'TRANSFERIDO') continue
    if (filter.congregation && filter.congregation !== 'TODAS' && (p.congregation || '') !== filter.congregation) continue
    if (filter.ownerId && (filter.ownerId === 'NINGUEM' ? !!p.followup_owner : p.followup_owner !== filter.ownerId)) continue
    if (filter.onlyStale && !isStale(p, todayYMD)) continue
    columns[stage].push(p)
  }
  for (const list of Object.values(columns)) {
    list.sort((a, b) => daysInStage(b, todayYMD) - daysInStage(a, todayYMD))
  }
  return columns
}
