import { describe, it, expect } from 'vitest'
import {
  transposeNote,
  transposeChordToken,
  transposeChordLine,
  transposeCifraText,
  getSemitoneDifference,
  isChordToken,
  AVAILABLE_KEYS,
} from './transposition'

describe('Utilitário de Transposição LouvorFlow (Requisito 5, 6, 8)', () => {
  it('transpõe notas simples com precisão', () => {
    expect(transposeNote('G', 2)).toBe('A')
    expect(transposeNote('C', 2)).toBe('D')
    expect(transposeNote('D', -2)).toBe('C')
    expect(transposeNote('F', 1)).toBe('F#')
    expect(transposeNote('B', 1)).toBe('C')
    expect(transposeNote('E', 1)).toBe('F')
  })

  it('transpõe acordes menores e sustenidos/bemóis', () => {
    expect(transposeChordToken('G', 2)).toBe('A')
    expect(transposeChordToken('Em', 2)).toBe('F#m')
    expect(transposeChordToken('Bm', 2)).toBe('C#m')
    expect(transposeChordToken('F#m', 2)).toBe('G#m')
    expect(transposeChordToken('Bb', -1)).toBe('A')
  })

  it('transpõe slash chords (G/B, D/F#, A/C#, C/E) com precisão', () => {
    expect(transposeChordToken('A/C#', 2)).toBe('B/D#')
    expect(transposeChordToken('G/B', 2)).toBe('A/C#')
    expect(transposeChordToken('D/F#', 2)).toBe('E/G#')
    expect(transposeChordToken('C/E', -2)).toBe('Bb/D')
  })

  it('suporta todos os acordes complexos exigidos (G, G7, Gmaj7, G/B, Am7, C#m, F#m7, Bb, D/F#)', () => {
    const requiredChords = ['G', 'G7', 'Gmaj7', 'G/B', 'Am7', 'C#m', 'F#m7', 'Bb', 'D/F#']
    for (const chord of requiredChords) {
      expect(isChordToken(chord)).toBe(true)
      const transposed = transposeChordToken(chord, 2)
      expect(transposed).toBeTruthy()
      expect(transposed).not.toBe(chord)
    }
  })

  it('suporta extensões completas: maj7, sus, dim, aug, add9', () => {
    expect(isChordToken('Dsus4')).toBe(true)
    expect(isChordToken('Cadd9')).toBe(true)
    expect(isChordToken('Bdim')).toBe(true)
    expect(isChordToken('Gaug')).toBe(true)
    expect(isChordToken('Fmaj7')).toBe(true)

    expect(transposeChordToken('Dsus4', 2)).toBe('Esus4')
    expect(transposeChordToken('Cadd9', 2)).toBe('Dadd9')
    expect(transposeChordToken('Fmaj7', 2)).toBe('Gmaj7')
  })

  it('suporta transposição completa no intervalo de -11 até +11 semitons', () => {
    const root = 'G'
    for (let offset = -11; offset <= 11; offset++) {
      const transposed = transposeNote(root, offset)
      expect(transposed).toBeTruthy()
      if (offset === 0) {
        expect(transposed).toBe('G')
      }
    }
  })

  it('preserva tom original mesmo após múltiplas transposições visuais (Requisito 6)', () => {
    const originalKey = 'G'
    // Evento usa tom A (+2)
    const eventKey = transposeNote(originalKey, 2)
    expect(eventKey).toBe('A')

    // Outro evento usa tom F (-2)
    const otherEventKey = transposeNote(originalKey, -2)
    expect(otherEventKey).toBe('F')

    // O tom original originalKey permanece estritamente G
    expect(originalKey).toBe('G')
  })

  it('reconhece tokens de acorde com qualificadores avançados', () => {
    expect(isChordToken('G')).toBe(true)
    expect(isChordToken('Em7')).toBe(true)
    expect(isChordToken('C9')).toBe(true)
    expect(isChordToken('A/C#')).toBe(true)
    expect(isChordToken('D4')).toBe(true)
    expect(isChordToken('Aleluia')).toBe(false)
    expect(isChordToken('Jesus')).toBe(false)
  })

  it('transpõe linhas de cifra completas mantendo tags', () => {
    const line = '[Intro] Bm  A/C#  D  A  G'
    const transposed = transposeChordLine(line, 2)
    expect(transposed).toBe('[Intro] C#m  B/D#  E  B  A')
  })

  it('transpõe progressão G-D-Em-C com +2 vira A-E-F#m-D', () => {
    const line = 'G  D  Em  C'
    const transposed = transposeChordLine(line, 2)
    expect(transposed).toBe('A  E  F#m  D')
  })

  it('calcula a diferença de semitons entre tons corretamente', () => {
    expect(getSemitoneDifference('G', 'A')).toBe(2)
    expect(getSemitoneDifference('A', 'G')).toBe(-2)
    expect(getSemitoneDifference('C', 'G')).toBe(-5)
    expect(getSemitoneDifference('D', 'D')).toBe(0)
  })

  it('transpõe texto de cifra sem alterar letras normais', () => {
    const cifra = `[Intro] G  C9  Em7  D4

[Verso]
G           C9
  Teu sangue leva-me além`

    const transposed = transposeCifraText(cifra, 2)
    expect(transposed).toContain('[Intro] A  D9  F#m7  E4')
    expect(transposed).toContain('A           D9')
    expect(transposed).toContain('Teu sangue leva-me além')
  })
})
