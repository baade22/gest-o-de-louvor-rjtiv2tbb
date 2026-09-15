import { isChordToken, isChordLine } from './transposition'

export interface ParsedSongContent {
  /**
   * Conteúdo com letra + cifra preservadas.
   */
  chords: string
  /**
   * Conteúdo com cifras removidas (somente letra e seções).
   */
  lyrics: string
}

/**
 * Seções comuns em músicas de louvor.
 */
export const SECTION_MARKERS = [
  'INTRO',
  'INTRODUÇÃO',
  'VERSO',
  'VERSO 1',
  'VERSO 2',
  'VERSO 3',
  'PRÉ-REFRÃO',
  'PRE-REFRAO',
  'PRÉ REFRÃO',
  'REFRÃO',
  'REFRAO',
  'CORO',
  'PONTE',
  'FINAL',
  'OUTRO',
  'FIM',
  'SOLO',
  'INTERLÚDIO',
  'INTERLUDIO',
  'TAG',
  'ESTROFE',
]

/**
 * Verifica se um texto entre colchetes ou isolado é uma marcação de seção.
 */
export function isSectionMarker(text: string): boolean {
  const clean = text
    .replace(/^[[({\s]+|[\])}\s]+$/g, '')
    .trim()
    .toUpperCase()
  return SECTION_MARKERS.some((marker) => marker === clean || clean.startsWith(marker + ' '))
}

/**
 * Remove acordes embutidos no formato [G], [Em7], [D/F#], etc. de uma linha mista,
 * preservando marcadores de seção como [INTRO], [REFRÃO], [PONTE], etc.
 */
export function stripInlineChords(line: string): string {
  // Substitui [Acorde] se o conteúdo for um acorde válido e NÃO for seção
  return line.replace(/\[([^\]]+)\]/g, (match, inside) => {
    const trimmed = inside.trim()
    if (isSectionMarker(trimmed)) {
      return `[${trimmed.toUpperCase()}]`
    }
    if (isChordToken(trimmed)) {
      return ''
    }
    return match
  })
}

/**
 * Parser determinístico de conteúdo de música (letra + cifra unificado).
 * Recebe o texto cru colado pelo usuário e gera determinísticamente:
 * (A) chords: Letra + Cifra (com acordes e seções preservados)
 * (B) lyrics: Somente letra (acordes removidos, seções mantidas)
 */
export function parseSongContent(rawContent: string): ParsedSongContent {
  if (!rawContent || !rawContent.trim()) {
    return {
      chords: '',
      lyrics: '',
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

    // 2. Seção pura, ex: [INTRO], [REFRÃO], [PRÉ-REFRÃO], INTRO:
    if (isSectionMarker(trimmed)) {
      const formattedSection =
        trimmed.startsWith('[') && trimmed.endsWith(']')
          ? `[${trimmed.slice(1, -1).trim().toUpperCase()}]`
          : `[${trimmed.replace(/:$/, '').trim().toUpperCase()}]`

      chordsLines.push(formattedSection)
      lyricsLines.push(formattedSection)
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

  // Normaliza linhas em branco consecutivas em lyrics
  const cleanedLyrics = lyricsLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const cleanedChords = chordsLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    chords: cleanedChords,
    lyrics: cleanedLyrics,
  }
}
