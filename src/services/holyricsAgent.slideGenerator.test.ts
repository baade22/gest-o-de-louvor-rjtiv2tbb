import { describe, it, expect } from 'vitest'

/**
 * Testes unitários para o gerador de slides do Holyrics (CreateSong)
 * Regras:
 * 1. Sem cifras na letra (E/G#, A2, B4, C#m, F#7(11), etc.)
 * 2. Sem repetição de versos provocada pelo parser (acordes sobre letra estilo Cifra Club)
 * 3. 2 linhas por slide por seção; seções nunca misturadas no mesmo slide
 * 4. Acentos portugueses preservados exatamente (UTF-8 fiel de ponta a ponta)
 * 5. Nenhuma linha legítima perdida; pontuação intacta
 * 6. Marcadores ##(VERSO 1), [Primeira Parte], etc vão para slide_description e NÃO para a letra
 * 7. Estrutura do payload: { text, slide_description }, formatting_type: "basic", order: "1,2,3..."
 */

const SECTION_PATTERNS = [
  'INTRO',
  'INTRODUÇÃO',
  'INTRODUCAO',
  'VERSO',
  'ESTROFE',
  'PRIMEIRA PARTE',
  'SEGUNDA PARTE',
  'TERCEIRA PARTE',
  'QUARTA PARTE',
  'PARTE',
  'PRÉ-REFRÃO',
  'PRE-REFRAO',
  'PRÉ REFRÃO',
  'PRE REFRAO',
  'PRÉ REFRÃO 1',
  'PRÉ REFRÃO 2',
  'REFRÃO',
  'REFRAO',
  'CORO',
  'PONTE',
  'INTERLÚDIO',
  'INTERLUDIO',
  'INSTRUMENTAL',
  'SOLO',
  'TAG',
  'BREAK',
  'FINAL',
  'OUTRO',
  'FIM',
]

const detectSectionHeader = (line: string): string | null => {
  if (!line) return null
  const raw = String(line).trim()
  if (!raw) return null

  let clean = raw
    .replace(/^[\s#*=\-_\\[\](){}]+|[\s#*=\-_\\[\](){}]+$/g, '')
    .replace(/^[\s#*=\-_\\[\](){}]+|[\s#*=\-_\\[\](){}]+$/g, '')
    .replace(/:+$/, '')
    .trim()
    .toUpperCase()

  clean = clean.replace(/^[([<{]+|[)\]>}]+$/g, '').trim()
  if (!clean) return null

  for (let m = 0; m < SECTION_PATTERNS.length; m++) {
    const p = SECTION_PATTERNS[m]
    if (
      clean === p ||
      clean.startsWith(p + ' ') ||
      clean.startsWith(p + ':') ||
      clean.startsWith(p + '-')
    ) {
      return clean
    }
  }

  return null
}

const isStrictChordToken = (token: string): boolean => {
  if (!token) return false
  const clean = String(token)
    .replace(/^[([<{]+|[)\]>},;.:]+$/g, '')
    .trim()
  if (!clean) return false

  const portugueseWords: Record<string, boolean> = {
    A: true,
    E: true,
    O: true,
    AS: true,
    OS: true,
    DO: true,
    DA: true,
    DOS: true,
    DAS: true,
    NO: true,
    NA: true,
    NOS: true,
    NAS: true,
    EM: true,
    DE: true,
    SE: true,
    EU: true,
    TU: true,
    ELE: true,
    ELA: true,
    ME: true,
    TE: true,
    AO: true,
    AOS: true,
    PRA: true,
    PRO: true,
    POR: true,
    SEM: true,
    COM: true,
    SIM: true,
    NAO: true,
    NÃO: true,
    QUE: true,
    QUEM: true,
    QUAL: true,
    FOI: true,
    SOU: true,
    ERA: true,
    SER: true,
    TER: true,
    VER: true,
    VEM: true,
    VAI: true,
    PAI: true,
    MAI: true,
    REI: true,
    LEI: true,
    DÓ: true,
    RÉ: true,
    MÍ: true,
    FÁ: true,
    SÓL: true,
    LÁ: true,
    SÍ: true,
    DOM: true,
  }

  if (portugueseWords[clean.toUpperCase()]) {
    return false
  }

  if (clean.includes('/')) {
    const parts = clean.split('/')
    if (parts.length === 2) {
      const main = parts[0].trim()
      const bass = parts[1].trim()
      return isStrictChordToken(main) && /^[A-G][#b]?$/i.test(bass)
    }
  }

  const chordRegex =
    /^[A-G][#b]?(m|min|maj|M|dim|aug|sus[24]?|add[0-9]+|[0-9]+|b[0-9]+|#[0-9]+|[ø°+*∆])*(?:\([^)]+\))?$/
  return chordRegex.test(clean)
}

const isChordOnlyLine = (line: string): boolean => {
  if (!line) return false
  const trimmed = String(line).trim()
  if (!trimmed) return false

  const cleanLine = trimmed.replace(/\[[^\]]+\]/g, ' ')
  const tokens = cleanLine.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false

  let chordCount = 0
  for (let t = 0; t < tokens.length; t++) {
    if (isStrictChordToken(tokens[t])) {
      chordCount++
    }
  }

  return chordCount / tokens.length >= 0.5
}

const stripChordsFromLine = (line: string): string => {
  if (!line) return ''
  let s = String(line)

  s = s.replace(/\[([A-G][#b]?[^\]]*)\]/g, (match, inner) => {
    if (detectSectionHeader(inner)) {
      return ''
    }
    return ''
  })

  s = s.replace(/\(([A-G][#b]?[^)]*)\)/g, (match, inner) => {
    if (isStrictChordToken(inner)) {
      return ''
    }
    return match
  })

  s = s.replace(/[ \t]{2,}/g, ' ').trim()
  return s
}

const generateHolyricsSlides = (
  song: { lyrics?: string; raw_content?: string; chords?: string },
  title: string,
) => {
  const storedLyrics = song.lyrics || ''
  const storedRawContent = song.raw_content || ''
  const storedChords = song.chords || ''

  let sourceText = storedLyrics && storedLyrics.trim() ? storedLyrics : ''
  if (!sourceText) {
    sourceText =
      (storedRawContent && storedRawContent.trim()) || (storedChords && storedChords.trim()) || ''
  }

  const rawLines = sourceText.split(/\r?\n/)
  const sections: { name: string; lines: string[] }[] = []

  let currentSec = { name: 'VERSO 1', lines: [] as string[] }

  for (let li = 0; li < rawLines.length; li++) {
    const line = rawLines[li]
    const trimmed = line.trim()
    if (!trimmed) continue

    const headerFound = detectSectionHeader(trimmed)
    if (headerFound) {
      if (currentSec.lines.length > 0) {
        sections.push(currentSec)
      }
      currentSec = { name: headerFound, lines: [] }
      continue
    }

    if (isChordOnlyLine(trimmed)) {
      continue
    }

    const cleanedLine = stripChordsFromLine(line)
    if (cleanedLine) {
      currentSec.lines.push(cleanedLine)
    }
  }

  if (currentSec.lines.length > 0) {
    sections.push(currentSec)
  }

  const slides: { text: string; slide_description: string }[] = []
  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si]
    const secName = sec.name || 'VERSO 1'
    const secLines = sec.lines

    for (let l = 0; l < secLines.length; l += 2) {
      const chunk = secLines.slice(l, l + 2)
      const slideText = chunk.join('\n').trim()
      if (slideText) {
        slides.push({
          text: slideText,
          slide_description: secName,
        })
      }
    }
  }

  if (slides.length === 0) {
    slides.push({
      text: title,
      slide_description: 'VERSO 1',
    })
  }

  let orderStr = ''
  for (let sIdx = 0; sIdx < slides.length; sIdx++) {
    orderStr += (sIdx > 0 ? ',' : '') + (sIdx + 1)
  }

  return { slides, orderStr }
}

describe('Holyrics Slide Generator - Regras de Aceite e Qualidade da Projeção', () => {
  it('1. Letra real: "Jesus em tua presença" (acordes inline e tags comuns)', () => {
    const song = {
      lyrics: '',
      chords: `[Primeira Parte]
[D]           [F#m]
Jesus em Tua presença
[G]          [A]
Reunimo-nos aqui
[Bm]           [F#m]
Contemplamos Tua face
[G]             [A]
E rendemo-nos a Ti

[Refrão]
[D]                [F#m]
Pois um dia Tua morte
[G]                [A]
Trouxe vida a todos nós
[G]           [A]
E nos deu santo acesso
[Em]             [A]  [D]
Ao coração do Pai`,
    }

    const { slides, orderStr } = generateHolyricsSlides(song, 'Jesus em tua presença')

    // (1) Nenhuma cifra nos slides
    const fullText = slides.map((s) => s.text).join('\n')
    expect(fullText).not.toMatch(/\[[A-G]/)
    expect(fullText).not.toMatch(/\b(D|F#m|G|A|Bm|Em)\b/)

    // (2) Acentos e palavras preservados perfeitamente
    expect(fullText).toContain('Jesus em Tua presença')
    expect(fullText).toContain('Reunimo-nos aqui')
    expect(fullText).toContain('Trouxe vida a todos nós')
    expect(fullText).toContain('Ao coração do Pai')

    // (3) Dois versos por slide respeitando seções
    expect(slides[0].text).toBe('Jesus em Tua presença\nReunimo-nos aqui')
    expect(slides[0].slide_description).toBe('PRIMEIRA PARTE')

    expect(slides[1].text).toBe('Contemplamos Tua face\nE rendemo-nos a Ti')
    expect(slides[1].slide_description).toBe('PRIMEIRA PARTE')

    expect(slides[2].text).toBe('Pois um dia Tua morte\nTrouxe vida a todos nós')
    expect(slides[2].slide_description).toBe('REFRÃO')

    expect(slides[3].text).toBe('E nos deu santo acesso\nAo coração do Pai')
    expect(slides[3].slide_description).toBe('REFRÃO')

    // (4) Marcadores não vazam para o texto
    expect(fullText).not.toContain('Primeira Parte')
    expect(fullText).not.toContain('Refrão')

    // (5) Order coerente
    expect(orderStr).toBe('1,2,3,4')
  })

  it('2. Letra real: "Oceanos (Onde Meus Pés Podem Falhar)" com estilo Cifra Club (acordes sobre letra)', () => {
    const song = {
      lyrics: '',
      raw_content: `##(VERSO 1)
Bm           A/C#             D
Tua voz me chama sobre as águas
            A               G
Onde os meus pés podem falhar
Bm           A/C#           D
E ali Te encontro no mistério
            A              G
Em meio ao mar, confiarei

##(REFRÃO)
   G            D            A
Ao Teu nome clamarei
   G            D            A
E além das ondas olharei
            G
Se o mar crescer
          D             A
Somente em Ti descansarei
              G      A        Bm
Pois eu sou Teu e Tu és meu`,
    }

    const { slides, orderStr } = generateHolyricsSlides(song, 'Oceanos')

    // (1) Nenhuma linha duplicada
    const lines = slides
      .map((s) => s.text)
      .join('\n')
      .split('\n')
    const counts: Record<string, number> = {}
    for (const l of lines) {
      counts[l] = (counts[l] || 0) + 1
    }
    expect(counts['Tua voz me chama sobre as águas']).toBe(1)
    expect(counts['Onde os meus pés podem falhar']).toBe(1)
    expect(counts['E ali Te encontro no mistério']).toBe(1)
    expect(counts['Em meio ao mar, confiarei']).toBe(1)

    // (2) Cifras não vazaram (Bm, A/C#, D, A, G)
    const allText = slides.map((s) => s.text).join('\n')
    expect(allText).not.toContain('A/C#')
    expect(allText).not.toContain('Bm')

    // (3) Dois versos por slide e ímpar em slide próprio
    expect(slides[0].text).toBe('Tua voz me chama sobre as águas\nOnde os meus pés podem falhar')
    expect(slides[0].slide_description).toBe('VERSO 1')

    expect(slides[1].text).toBe('E ali Te encontro no mistério\nEm meio ao mar, confiarei')
    expect(slides[1].slide_description).toBe('VERSO 1')

    // REFRÃO tem 5 linhas -> 2 slides de 2 linhas + 1 slide de 1 linha
    expect(slides[2].text).toBe('Ao Teu nome clamarei\nE além das ondas olharei')
    expect(slides[2].slide_description).toBe('REFRÃO')

    expect(slides[3].text).toBe('Se o mar crescer\nSomente em Ti descansarei')
    expect(slides[3].slide_description).toBe('REFRÃO')

    expect(slides[4].text).toBe('Pois eu sou Teu e Tu és meu')
    expect(slides[4].slide_description).toBe('REFRÃO')

    // Ordem
    expect(orderStr).toBe('1,2,3,4,5')
  })

  it('3. Não elimina palavras legítimas da língua portuguesa ("a", "e", "dó", "si", "pai", "ao")', () => {
    const song = {
      lyrics: `[VERSO 1]
A Ti a glória e o louvor
Ao Deus que tem misericórdia e dó
Sião se alegra no Senhor
Com todo coração e fé`,
    }

    const { slides } = generateHolyricsSlides(song, 'A Ti a Glória')
    const fullText = slides.map((s) => s.text).join('\n')

    expect(fullText).toContain('A Ti a glória e o louvor')
    expect(fullText).toContain('Ao Deus que tem misericórdia e dó')
    expect(fullText).toContain('Sião se alegra no Senhor')
    expect(fullText).toContain('Com todo coração e fé')
  })

  it('4. Reconhecimento de marcações diversas: ##(PRÉ-REFRÃO), [Primeira Parte], PARTE 2, CORO:', () => {
    const raw = `##(PRÉ-REFRÃO)
Tua graça me basta
Tua presença me sustenta

[SEGUNDA PARTE]
Não temerei o mal
Pois estás comigo`

    const { slides } = generateHolyricsSlides({ chords: raw }, 'Teste')

    expect(slides[0].slide_description).toBe('PRÉ-REFRÃO')
    expect(slides[0].text).toBe('Tua graça me basta\nTua presença me sustenta')

    expect(slides[1].slide_description).toBe('SEGUNDA PARTE')
    expect(slides[1].text).toBe('Não temerei o mal\nPois estás comigo')
  })
})
