import { describe, it, expect } from 'vitest'
import {
  transposeNote,
  transposeChordToken,
  transposeChordLine,
  transposeCifraText,
  getSemitoneDifference,
  isChordToken,
} from './transposition'

describe('Utilitário de Transposição LouvorFlow', () => {
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

  it('transpõe slash chords (acordes com baixo invertido)', () => {
    expect(transposeChordToken('A/C#', 2)).toBe('B/D#')
    expect(transposeChordToken('G/B', 2)).toBe('A/C#')
    expect(transposeChordToken('D/F#', 2)).toBe('E/G#')
    expect(transposeChordToken('C/E', -2)).toBe('Bb/D')
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
