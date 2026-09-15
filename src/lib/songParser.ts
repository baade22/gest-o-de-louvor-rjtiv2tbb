import { isChordToken, isChordLine } from './transposition'

export interface SongSection {
  id: string
  name: string
  type: string
  content: string
}

export interface ParsedSongContent {
  /**
   * Conteúdo com letra + cifra preservadas.
   */
  chords: string
  /**
   * Conteúdo com cifras removidas (somente letra e seções).
   */
  lyrics: string
  /**
   * Seções estruturadas identificadas pelo parser.
   */
  sections: SongSection[]
}

/**
 * Seções comuns em músicas de louvor.
 * INTRO, INTRODUÇÃO, VERSO, VERSO 1, VERSO 2, VERSO 3, PRÉ-REFRÃO, REFRÃO, CORO, PONTE, FINAL, INTERLÚDIO, INSTRUMENTAL, TAG, BREAK, OUTRO, FIM, SOLO, ESTROFE
 */
export const SECTION_MARKERS = [
  'INTRO',
  'INTRODUÇÃO',
  'INTRODUCAO',
  'VERSO 1',
  'VERSO 2',
  'VERSO 3',
  'VERSO',
  'PRÉ-REFRÃO',
  'PRE-REFRAO',
  'PRÉ REFRÃO',
  'PRE REFRAO',
  'REFRÃO',
  'REFRAO',
  'CORO',
  'PONTE',
  'FINAL',
  'INTERLÚDIO',
  'INTERLUDIO',
  'INSTRUMENTAL',
  'TAG',
  'BREAK',
  'OUTRO',
  'FIM',
  'SOLO',
  'ESTROFE',
]

/**
 * Normaliza um texto para comparação com marcadores de seção
 */
function normalizeSectionText(text: string): string {
  return text
    .replace(/^[[({\s#*=-]+|[\])}\s#*=-]+$/g, '')
    .replace(/:$/, '')
    .trim()
    .toUpperCase()
}

/**
 * Verifica se um texto entre colchetes ou isolado é uma marcação de seção.
 */
export function isSectionMarker(text: string): boolean {
  const clean = normalizeSectionText(text)
  if (!clean) return false

  return SECTION_MARKERS.some((marker) => marker === clean || clean.startsWith(marker + ' '))
}

/**
 * Formata um cabeçalho de seção de modo padronizado (ex: [INTRO], [REFRÃO]).
 */
export function formatSectionTitle(text: string): string {
  const clean = normalizeSectionText(text)
  return `[${clean}]`
}

/**
 * Remove acordes embutidos no formato [G], [Em7], [D/F#], etc. de uma linha mista,
 * preservando marcadores de seção como [INTRO], [REFRÃO], [PONTE], etc.
 */
export function stripInlineChords(line: string): string {
  return line.replace(/\[([^\]]+)\]/g, (match, inside) => {
    const trimmed = inside.trim()
    if (isSectionMarker(trimmed)) {
      return formatSectionTitle(trimmed)
    }
    if (isChordToken(trimmed)) {
      return ''
    }
    return match
  })
}

/**
 * Converte seções em texto plano estruturado (com [NOME_SECAO]).
 */
export function serializeSections(sections: SongSection[]): string {
  return sections
    .map((sec) => {
      const header = formatSectionTitle(sec.name || 'SEÇÃO')
      const body = sec.content.trim()
      return body ? `${header}\n${body}` : header
    })
    .join('\n\n')
}

/**
 * Separa um texto já contendo seções em SongSection[]
 */
export function extractSectionsFromText(text: string): SongSection[] {
  if (!text || !text.trim()) return []

  const lines = text.split(/\r?\n/)
  const sections: SongSection[] = []
  let currentSection: SongSection | null = null
  let currentContentLines: string[] = []

  const flushCurrent = () => {
    if (currentSection) {
      currentSection.content = currentContentLines.join('\n').trim()
      sections.push(currentSection)
      currentContentLines = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (isSectionMarker(trimmed)) {
      flushCurrent()
      const cleanName = normalizeSectionText(trimmed)
      currentSection = {
        id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: cleanName,
        type: cleanName,
        content: '',
      }
    } else {
      if (!currentSection) {
        // Se houver conteúdo antes de qualquer cabeçalho de seção
        currentSection = {
          id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: 'INTRO',
          type: 'INTRO',
          content: '',
        }
      }
      currentContentLines.push(line)
    }
  }

  flushCurrent()
  return sections
}

/**
 * Parser determinístico de conteúdo de música (letra + cifra unificado).
 * Recebe o texto cru colado pelo usuário e gera determinísticamente:
 * (A) chords: Letra + Cifra (com acordes e seções preservados, suportando acordes acima da letra ou inline)
 * (B) lyrics: Somente letra (acordes removidos, seções mantidas)
 * (C) sections: Seções identificadas para manipulação e visualização estruturada
 */
export function parseSongContent(rawContent: string): ParsedSongContent {
  if (!rawContent || !rawContent.trim()) {
    return {
      chords: '',
      lyrics: '',
      sections: [],
    }
  }

  const lines = rawContent.split(/\r?\n/)

  const chordsLines: string[] = []
  const lyricsLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 1. Linha em branco
    if (!trimmed) {
      chordsLines.push('')
      lyricsLines.push('')
      continue
    }

    // 2. Seção pura, ex: INTRO, [INTRO], VERSO 1, REFRÃO, CORO:, PONTE, BREAK
    if (isSectionMarker(trimmed)) {
      const formatted = formatSectionTitle(trimmed)
      chordsLines.push(formatted)
      lyricsLines.push(formatted)
      continue
    }

    // 3. Linha dedicada exclusivamente a cifras (ex: "G  D  Em  C" ou "G    Em7    D/F#")
    if (isChordLine(line)) {
      chordsLines.push(line)
      // Em lyrics pura, linhas inteiramente de cifras são ignoradas/removidas
      continue
    }

    // 4. Linha mista com acordes inline [G] Tu és bom [Em] ó Deus
    if (line.includes('[') && line.includes(']')) {
      chordsLines.push(line)
      const stripped = stripInlineChords(line)
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
      if (stripped) {
        lyricsLines.push(stripped)
      }
      continue
    }

    // 5. Linha de letra normal sem acordes
    chordsLines.push(line)
    lyricsLines.push(line)
  }

  // Normaliza linhas em branco consecutivas em lyrics e chords
  const cleanedLyrics = lyricsLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const cleanedChords = chordsLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const sections = extractSectionsFromText(cleanedChords)

  return {
    chords: cleanedChords,
    lyrics: cleanedLyrics,
    sections,
  }
}
