/**
 * Roteiro do culto: modelo padrão e cálculo de horários.
 */
import type { EventMoment, EventMomentKind } from '@/types'

export const MOMENT_KIND_LABELS: Record<EventMomentKind, string> = {
  ABERTURA: 'Abertura',
  LOUVOR: 'Louvor',
  AVISOS: 'Avisos',
  OFERTA: 'Ofertas',
  PALAVRA: 'Palavra',
  MINISTRACAO: 'Ministração',
  ENCERRAMENTO: 'Encerramento',
  OUTRO: 'Outro',
}

export interface MomentDraft {
  title: string
  kind: EventMomentKind
  duration_min: number
}

/** Ordem mais comum de um culto; o líder ajusta depois. */
export const DEFAULT_RUN_SHEET: MomentDraft[] = [
  { title: 'Abertura', kind: 'ABERTURA', duration_min: 5 },
  { title: 'Louvor', kind: 'LOUVOR', duration_min: 25 },
  { title: 'Avisos e ofertas', kind: 'AVISOS', duration_min: 10 },
  { title: 'Palavra', kind: 'PALAVRA', duration_min: 45 },
  { title: 'Ministração e encerramento', kind: 'ENCERRAMENTO', duration_min: 15 },
]

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

export function parseTime(value?: string): number | null {
  const m = value?.trim().match(TIME_RE)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function formatTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Horário de cada momento: usa o horário salvo; se não houver, continua a
 * partir do momento anterior (início + duração). O primeiro sem horário
 * começa no início do culto.
 */
export function resolveMomentTimes(
  moments: Pick<EventMoment, 'start_time' | 'duration_min'>[],
  eventStart?: string,
): (string | null)[] {
  let cursor = parseTime(eventStart)
  return moments.map((moment) => {
    const own = parseTime(moment.start_time)
    const start = own ?? cursor
    cursor = start === null ? null : start + (moment.duration_min || 0)
    return start === null ? null : formatTime(start)
  })
}

/** Gera os horários do modelo padrão a partir do início do culto. */
export function buildDefaultRunSheet(eventStart?: string) {
  let cursor = parseTime(eventStart)
  return DEFAULT_RUN_SHEET.map((draft, index) => {
    const start_time = cursor === null ? '' : formatTime(cursor)
    if (cursor !== null) cursor += draft.duration_min
    return { ...draft, start_time, order: index + 1 }
  })
}
