import { isChordToken } from './transposition'

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
  'PRIMEIRA PARTE',
  'SEGUNDA PARTE',
  'TERCEIRA PARTE',
  'QUARTA PARTE',
  'PARTE',
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

    // "[Final] Bb  F  C" abre a seção FINAL com os acordes como conteúdo
    const labelMatch = trimmed.match(/^\[([^\]]+)\]\s+(.+)$/)
    if (labelMatch && isSectionMarker(labelMatch[1]) && isNonSungLine(labelMatch[2])) {
      flushCurrent()
      const cleanName = normalizeSectionText(labelMatch[1])
      currentSection = {
        id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: cleanName,
        type: cleanName,
        content: '',
      }
      currentContentLines.push(labelMatch[2])
      continue
    }

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

/** Caracteres invisíveis que vêm junto ao copiar cifras de sites (zero-width, BOM, etc.). */
const INVISIBLE_CHARS = /[​-‍⁠﻿­]/g

/** Normaliza espaços especiais (nbsp e afins) e remove caracteres invisíveis. */
function normalizeWhitespace(line: string): string {
  return line.replace(INVISIBLE_CHARS, '').replace(/[  -   　]/g, ' ')
}

/** Anotações que aparecem em linhas de cifra e não são cantadas: (2x), x2, |, -, %, etc. */
function isChordAnnotationToken(token: string): boolean {
  return /^\(?\s*(\d+\s*x|x\s*\d+)\s*\)?$/i.test(token) || /^[|\-–—/\\.%~:()*>]+$/.test(token)
}

/**
 * Linha que não tem nada para cantar: só acordes (com ou sem rótulo de seção na frente),
 * anotações de repetição ou tablatura (ex: "e|---3---5---|").
 * Mais rígida que `isChordLine` (da transposição): palavra de verdade mantém a linha na letra,
 * assim "A Ele a glória" não some.
 */
export function isNonSungLine(line: string): boolean {
  const trimmed = normalizeWhitespace(line).trim()
  if (!trimmed) return false

  // Tablatura pura: e|---3---|, B|--5h7--|, |---------|
  if (/^([A-Ga-g][#b]?\s*)?\|[-–—\d\s|hpbrx~/\\()^.*]*$/.test(trimmed)) return true

  // Só instrução de repetição: (2x), x2, (bis), (repete)
  if (/^\(?\s*(\d+\s*x|x\s*\d+|bis|repete[^)]*)\s*\)?$/i.test(trimmed)) return true

  const tokens = trimmed
    .replace(/\[[^\]]+\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return false

  let chordCount = 0
  let wordCount = 0
  for (const token of tokens) {
    if (isChordToken(token)) chordCount++
    else if (!isChordAnnotationToken(token)) wordCount++
  }
  if (chordCount === 0) return false
  // Tolera uma palavra solta numa linha cheia de acordes ("G  D  Em  C  Repete"),
  // mas não apaga letra curta que começa com "A"/"E" ("A Ele a glória").
  return wordCount === 0 || (chordCount >= 3 && chordCount >= wordCount * 2)
}

/**
 * Deixa uma linha de letra só com o texto cantado, pronta para o Holyrics:
 * - tira espaços do começo/fim e espaços duplos usados para alinhar acordes;
 * - tira barras e traços de tablatura/prolongamento: "A|---------| le--luia" vira "Aleluia";
 * - tira o "_" de nota prolongada: "Sa_nto" vira "Santo".
 * Hífen simples entre palavras ("guarda-chuva") é mantido.
 */
export function cleanLyricLine(line: string): string {
  let s = normalizeWhitespace(line)

  // Barras e traços de tablatura/prolongamento colam as sílabas: "A|-----| le" -> "Ale"
  s = s.replace(/\s*\|[\s\-–—_~.|]*/g, '')

  // Sílaba esticada com traços/sublinhado no meio da palavra: "le--luia", "Sa_nto"
  s = s.replace(/(\p{L})(?:[-–—~]{2,}|_+)(?=\p{L})/gu, '$1')

  // Prolongamento no fim ou solto: "Deus----", "oh___", " --- "
  s = s.replace(/[-–—~_]{2,}/g, ' ').replace(/_/g, '')

  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

/** Remove rótulos de seção que ficaram sem nenhuma linha cantada (ex: [INTRO] e [FINAL] instrumentais). */
function dropEmptySectionHeaders(lines: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isSectionMarker(line.trim())) {
      let hasContent = false
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (!next) continue
        if (isSectionMarker(next)) break
        hasContent = true
        break
      }
      if (!hasContent) continue
    }
    result.push(line)
  }
  return result
}

/** Rótulo de seção no começo de uma linha com acordes, ex: "[Intro] Dm7 C Bb" -> "[INTRO]". */
function leadingSectionLabel(line: string): string | null {
  const match = line.trim().match(/^\[([^\]]+)\]/)
  if (match && isSectionMarker(match[1])) return formatSectionTitle(match[1])
  return null
}

/**
 * Parser determinístico de conteúdo de música (letra + cifra unificado).
 * Recebe o texto cru colado pelo usuário e gera determinísticamente:
 * (A) chords: Letra + Cifra (com acordes e seções preservados, suportando acordes acima da letra ou inline)
 * (B) lyrics: Somente o texto cantado + rótulos de seção (usados pelo Holyrics como descrição do slide).
 *     Sem acordes, tablatura, marcas de prolongamento, espaços de alinhamento nem seções instrumentais.
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
    const line = lines[i].replace(INVISIBLE_CHARS, '')
    const trimmed = line.trim()

    // 1. Linha em branco
    if (!trimmed) {
      chordsLines.push('')
      lyricsLines.push('')
      continue
    }

    // 2. Seção pura, ex: INTRO, [INTRO], VERSO 1, REFRÃO, CORO:, PONTE, BREAK, [Primeira Parte]
    if (isSectionMarker(trimmed)) {
      const formatted = formatSectionTitle(trimmed)
      chordsLines.push(formatted)
      lyricsLines.push(formatted)
      continue
    }

    chordsLines.push(line)

    // 3. Linha sem nada cantado: só acordes (ex: "G  D  Em  C", "[Intro] Dm7  C  Bb"), tablatura ou (2x)
    if (isNonSungLine(line)) {
      // Mantém o rótulo de "[Refrão] G D" na letra; se a seção for só instrumental, sai no fim.
      const label = leadingSectionLabel(line)
      if (label) lyricsLines.push(label)
      continue
    }

    // 4. Letra, com ou sem acordes inline ([G] Tu és bom [Em] ó Deus): fica só o texto cantado
    const withoutInline = line.includes('[') && line.includes(']') ? stripInlineChords(line) : line
    const cleaned = cleanLyricLine(withoutInline)
    if (cleaned) {
      lyricsLines.push(cleaned)
    }
  }

  // Normaliza linhas em branco consecutivas em lyrics e chords
  const cleanedLyrics = dropEmptySectionHeaders(lyricsLines)
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
