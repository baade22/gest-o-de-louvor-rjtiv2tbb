/**
 * Utilitários consistentes de data para o LouvorFlow.
 *
 * Regra do projeto (Etapa 3A):
 * Campos que representam uma data de calendário (YYYY-MM-DD) devem preservar
 * o dia exatamente como selecionado, sem sofrer deslocamentos por conversões
 * indevidas de fuso horário / UTC.
 *
 * Exemplo: 2026-10-25 deve sempre ser formatado e exibido como 25/10/2026
 * (ou domingo, 25 de outubro de 2026), nunca 24/10/2026.
 */

export interface CalendarDateParts {
  year: number
  month: number // 1-12
  day: number // 1-31
}

/**
 * Extrai partes de calendário (ano, mês 1-12, dia) de uma string de data sem sofrer deslocamento de fuso.
 * Aceita "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss.SSSZ", "YYYY-MM-DDTHH:mm:ssZ" ou Date.
 */
export function parseCalendarDate(input?: string | Date | null): CalendarDateParts | null {
  if (!input) return null

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      if (year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day }
      }
    }
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      }
    }
    return null
  }

  if (input instanceof Date && !isNaN(input.getTime())) {
    return {
      year: input.getFullYear(),
      month: input.getMonth() + 1,
      day: input.getDate(),
    }
  }

  return null
}

/**
 * Retorna a data de hoje no formato de calendário "YYYY-MM-DD" local (sem usar toISOString).
 */
export function getLocalTodayYMD(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Converte qualquer representação para "YYYY-MM-DD" limpo.
 */
export function toCalendarYMD(input?: string | Date | null): string {
  const parts = parseCalendarDate(input)
  if (!parts) return ''
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${parts.year}-${m}-${d}`
}

/**
 * Formata data de forma amigável em pt-BR preservando exatamente o dia do calendário.
 * Opções de estilo:
 * - 'full': "domingo, 25 de outubro de 2026"
 * - 'short': "dom., 25 de out. de 2026"
 * - 'numeric': "25/10/2026"
 */
export function formatCalendarDateDisplay(
  dateInput?: string | Date | null,
  style: 'full' | 'short' | 'numeric' = 'short',
): string {
  if (!dateInput) return ''
  const parts = parseCalendarDate(dateInput)
  if (!parts) {
    return typeof dateInput === 'string' ? dateInput : ''
  }

  // Instanciamos uma Date ao meio-dia UTC do dia alvo para obter o nome do dia da semana
  // e do mês de maneira imune a qualquer fuso horário mundial (-12h a +14h).
  const safeDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0))

  if (style === 'numeric') {
    const d = String(parts.day).padStart(2, '0')
    const m = String(parts.month).padStart(2, '0')
    return `${d}/${m}/${parts.year}`
  }

  if (style === 'full') {
    return safeDate.toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  // 'short'
  return safeDate.toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
