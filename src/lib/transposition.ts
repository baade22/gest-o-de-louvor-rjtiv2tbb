// Utilitário puro de transposição de acordes e cifras para LouvorFlow
// Suporta acordes maiores, menores, diminutos, com sétima, nona, baixo invertido (slash chords) etc.
// Ex: G +2 -> A, Em +2 -> F#m, D/F# +2 -> E/G#, Bb -1 -> A

export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Mapeamento de notas para índice de 0 a 11
const NOTE_TO_INDEX: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

// Regex para capturar notas raiz (ex: C, C#, Bb) no início do acorde
const ROOT_NOTE_REGEX = /^([A-G][#b]?)(.*)$/

/**
 * Transpõe uma nota única por um determinado número de semitons (-11 a +11).
 * Usa sustenidos por padrão, a menos que o tom original usasse bemol explicitamente ou preferFlats seja true.
 */
export function transposeNote(note: string, semitones: number, preferFlats = false): string {
  if (semitones === 0) return note
  const normalized = note.trim()
  const index = NOTE_TO_INDEX[normalized]
  if (index === undefined) return note

  // Normaliza o offset para o intervalo 0..11
  const newIndex = (((index + semitones) % 12) + 12) % 12
  const useFlats = preferFlats || normalized.includes('b')
  return useFlats ? CHROMATIC_FLAT[newIndex] : CHROMATIC_SHARP[newIndex]
}

/**
 * Transpõe um token de acorde (ex: "G", "Em7", "A/C#", "F#m(b5)", "Bb9")
 */
export function transposeChordToken(token: string, semitones: number, preferFlats = false): string {
  if (semitones === 0) return token
  const trimmed = token.trim()
  if (!trimmed) return token

  // Trata acordes com baixo invertido (slash chord: C/E, D/F#)
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    if (parts.length === 2) {
      const transposedMain = transposeChordToken(parts[0], semitones, preferFlats)
      const transposedBass = transposeChordToken(parts[1], semitones, preferFlats)
      return `${transposedMain}/${transposedBass}`
    }
  }

  const match = trimmed.match(ROOT_NOTE_REGEX)
  if (!match) return token

  const [, rootNote, suffix] = match
  const transposedRoot = transposeNote(rootNote, semitones, preferFlats)
  return `${transposedRoot}${suffix}`
}

/**
 * Verifica se uma palavra/token se assemelha a um acorde musical.
 * Ex: C, D, Em, F#m, G/B, A7, BbM7, C9, Dsus4, Am7(b5), etc.
 */
export function isChordToken(token: string): boolean {
  // Ignora pontuações comuns
  const clean = token.replace(/^[([<{]+|[)\]>},;.]+$/g, '').trim()
  if (!clean) return false

  // Slash chord check
  if (clean.includes('/')) {
    const [main, bass] = clean.split('/')
    return isChordToken(main) && /^[A-G][#b]?$/.test(bass.trim())
  }

  // Acorde deve começar com [A-G][#b]? seguido de qualificadores típicos de harmonia
  const chordPattern =
    /^[A-G][#b]?(m|min|maj|M|dim|aug|sus[24]?|add[0-9]+|[0-9]+|b[0-9]+|#[0-9]+|[ø°+*∆])*(?:\([^)]+\))?$/
  return chordPattern.test(clean)
}

/**
 * Detecta se uma linha de texto é predominantemente uma linha de cifras (ex: "[Intro] Bm  A/C#  D  A  G" ou "G    C9    Em7    D4")
 */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // Se a linha tem cabeçalho de seção ex: [Intro], [Verso], remove para avaliar tokens
  const cleanLine = trimmed.replace(/\[[^\]]+\]/g, ' ')
  const tokens = cleanLine.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false

  let chordCount = 0
  for (const token of tokens) {
    if (isChordToken(token)) chordCount++
  }

  // Se mais de 50% dos tokens forem acordes, consideramos linha de cifra
  return chordCount / tokens.length >= 0.5
}

/**
 * Transpõe uma linha de cifra preservando a formatação e espaçamentos.
 */
export function transposeChordLine(line: string, semitones: number, preferFlats = false): string {
  if (semitones === 0) return line

  // Preserva tags como [Intro], [Refrão], etc.
  return line.replace(
    /(\[[^\]]+\])|([A-G][#b]?(?:[a-zA-Z0-9ø°+*∆#b/()]+)?)/g,
    (fullMatch, tag, chord) => {
      if (tag) return tag
      if (chord && isChordToken(chord)) {
        return transposeChordToken(chord, semitones, preferFlats)
      }
      return fullMatch
    },
  )
}

/**
 * Transpõe um texto inteiro de cifra/letra respeitando linhas de cifra e tags de seção.
 */
export function transposeCifraText(
  cifraText: string,
  semitones: number,
  preferFlats = false,
): string {
  if (!cifraText || semitones === 0) return cifraText

  const lines = cifraText.split('\n')
  const transposed = lines.map((line) => {
    if (isChordLine(line)) {
      return transposeChordLine(line, semitones, preferFlats)
    }
    // Caso haja acordes entre colchetes numa linha mista, ex: "Tua voz [Bm] me chama sobre as águas [D]"
    if (line.includes('[') && line.includes(']')) {
      return line.replace(/\[([A-G][#b]?[a-zA-Z0-9ø°+*∆#b/()]+)\]/g, (match, chord) => {
        if (isChordToken(chord)) {
          return `[${transposeChordToken(chord, semitones, preferFlats)}]`
        }
        return match
      })
    }
    return line
  })

  return transposed.join('\n')
}

/**
 * Calcula a diferença de semitons entre dois tons.
 * Ex: original 'G', target 'A' => +2 semitons
 */
export function getSemitoneDifference(originalKey: string, targetKey: string): number {
  if (!originalKey || !targetKey) return 0
  const origMatch = originalKey.trim().match(ROOT_NOTE_REGEX)
  const targetMatch = targetKey.trim().match(ROOT_NOTE_REGEX)
  if (!origMatch || !targetMatch) return 0

  const origIdx = NOTE_TO_INDEX[origMatch[1]]
  const targetIdx = NOTE_TO_INDEX[targetMatch[1]]
  if (origIdx === undefined || targetIdx === undefined) return 0

  let diff = (targetIdx - origIdx) % 12
  if (diff > 6) diff -= 12
  if (diff < -5) diff += 12
  return diff
}

export const AVAILABLE_KEYS = [
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
  'Cm',
  'C#m',
  'Dbm',
  'Dm',
  'D#m',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gbm',
  'Gm',
  'G#m',
  'Abm',
  'Am',
  'A#m',
  'Bbm',
  'Bm',
]
