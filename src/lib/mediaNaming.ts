/**
 * Utilitário compartilhado para geração e sanitização de nomes de arquivos físicos de mídia
 * para importação no Holyrics.
 *
 * Padrão definido: Evento - Categoria - DD-MM - Título.extensão
 * Exemplo: Culto Domingo - Avisos - 10-12 - Aniversariantes do Mes.mp4
 *
 * Se a data do evento não estiver disponível ou for inválida:
 * Fallback determinístico: "Sem Data"
 * Exemplo: Culto Especial - Avisos - Sem Data - Vinheta.mp4
 */

export interface MediaNamingParams {
  eventName?: string | null
  category?: string | null
  eventDate?: string | Date | null
  title?: string | null
  originalFileName?: string | null
}

/**
 * Remove acentos de uma string, mantendo caracteres alfanuméricos seguros
 */
export function removeAccents(str: string): string {
  if (!str) return ''
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Normaliza um segmento de texto para ser compatível com Windows e Holyrics:
 * - Remove caracteres proibidos no Windows: < > : " / \ | ? * e controles (ASCII 0-31)
 * - Converte acentos para letras equivalentes (evita problemas de encoding no Windows/Holyrics)
 * - Colapsa espaços e hífens redundantes
 */
export function sanitizeWindowsSegment(segment: string): string {
  if (!segment) return ''
  let cleaned = removeAccents(String(segment))
  // Remove caracteres proibidos no Windows: < > : " / \ | ? *
  cleaned = cleaned.replace(/[<>:"/\\|?*]/g, ' ')
  // Remove caracteres de controle ASCII 0-31
  cleaned = cleaned
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32)
    .join('')
  // Colapsa múltiplos espaços
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  // Remove pontuações estranhas no início ou fim do segmento
  cleaned = cleaned.replace(/^[.\s\-_]+|[.\s\-_]+$/g, '').trim()
  return cleaned
}

/**
 * Formata data no padrão DD-MM (ou fallback "Sem Data")
 */
export function formatEventDayMonth(dateInput?: string | Date | null): string {
  if (!dateInput) return 'Sem Data'

  try {
    let dateObj: Date
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim()
      if (!trimmed) return 'Sem Data'
      // Se vier como YYYY-MM-DD
      const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (dateOnlyMatch) {
        const day = dateOnlyMatch[3]
        const month = dateOnlyMatch[2]
        return `${day}-${month}`
      }
      dateObj = new Date(trimmed)
    } else {
      dateObj = dateInput
    }

    if (isNaN(dateObj.getTime())) {
      return 'Sem Data'
    }

    const day = String(dateObj.getDate()).padStart(2, '0')
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    return `${day}-${month}`
  } catch {
    return 'Sem Data'
  }
}

/**
 * Extrai e preserva a extensão original do arquivo (sempre em minúsculas e sanitizada)
 */
export function extractFileExtension(fileName?: string | null): string {
  if (!fileName) return ''
  const trimmed = fileName.trim()
  const match = trimmed.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Mapeia e formata o nome de exibição amigável da categoria
 */
export function formatCategoryLabel(category?: string | null): string {
  const cat = String(category || '')
    .toUpperCase()
    .trim()
  const map: Record<string, string> = {
    AVISOS: 'Avisos',
    ANIVERSARIANTES: 'Aniversariantes',
    AGENDA: 'Agenda',
    CULTOS: 'Cultos',
    EVENTOS: 'Eventos',
    VIDEO_ESPECIAL: 'Video Especial',
    OUTROS: 'Outros',
  }
  return map[cat] || (cat ? sanitizeWindowsSegment(cat) : 'Geral')
}

/**
 * Gera o nome físico final para o arquivo no Holyrics
 * Padrão: Evento - Categoria - DD-MM - Título.extensão
 */
export function generateHolyricsFileName(params: MediaNamingParams): string {
  const eventPart = sanitizeWindowsSegment(params.eventName || 'Evento') || 'Evento'
  const categoryPart = formatCategoryLabel(params.category)
  const datePart = formatEventDayMonth(params.eventDate)

  // Se o título não foi informado, usa o nome do arquivo original sem a extensão
  let titleRaw = params.title?.trim()
  if (!titleRaw && params.originalFileName) {
    const ext = extractFileExtension(params.originalFileName)
    if (ext) {
      titleRaw = params.originalFileName.slice(0, -(ext.length + 1)).trim()
    } else {
      titleRaw = params.originalFileName.trim()
    }
  }
  const titlePart = sanitizeWindowsSegment(titleRaw || 'Midia') || 'Midia'

  // Preserva a extensão original
  let ext = extractFileExtension(params.originalFileName)
  if (!ext && params.title) {
    ext = extractFileExtension(params.title)
  }

  const baseName = `${eventPart} - ${categoryPart} - ${datePart} - ${titlePart}`

  // Remove qualquer separador duplicado ou espaços excessivos
  const cleanedBase = baseName
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()

  return ext ? `${cleanedBase}.${ext}` : cleanedBase
}
