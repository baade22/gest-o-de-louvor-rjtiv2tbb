import { describe, it, expect } from 'vitest'
import { parseSongContent, isSectionMarker, stripInlineChords } from './songParser'
import { isChordToken } from './transposition'

describe('Parser Determinístico de Música (Letra + Cifra)', () => {
  it('reconhece todos os acordes obrigatórios do requisito', () => {
    const requiredChords = ['G', 'G7', 'Gmaj7', 'G/B', 'Am7', 'C#m', 'F#m7', 'Bb', 'D/F#']

    for (const chord of requiredChords) {
      expect(isChordToken(chord), `Deveria reconhecer ${chord}`).toBe(true)
    }
  })

  it('reconhece marcadores de seção (INTRO, VERSO, PRÉ-REFRÃO, REFRÃO, PONTE, FINAL)', () => {
    expect(isSectionMarker('INTRO')).toBe(true)
    expect(isSectionMarker('[INTRO]')).toBe(true)
    expect(isSectionMarker('VERSO')).toBe(true)
    expect(isSectionMarker('[PRÉ-REFRÃO]')).toBe(true)
    expect(isSectionMarker('REFRÃO')).toBe(true)
    expect(isSectionMarker('[PONTE]')).toBe(true)
    expect(isSectionMarker('FINAL')).toBe(true)
  })

  it('processa exemplo exato fornecido no requisito com acordes no início da linha', () => {
    const input = '[G] Tu és bom, ó Deus\n[Em] Tua graça me alcançou\n[C] Nunca me abandonou'
    const result = parseSongContent(input)

    expect(result.chords).toBe(
      '[G] Tu és bom, ó Deus\n[Em] Tua graça me alcançou\n[C] Nunca me abandonou',
    )
    expect(result.lyrics).toBe('Tu és bom, ó Deus\nTua graça me alcançou\nNunca me abandonou')
  })

  it('processa múltiplos acordes na mesma linha', () => {
    const input = '[G] Tu és bom [D/F#] e Tua graça [Em7] nunca falha [C]'
    const result = parseSongContent(input)

    expect(result.chords).toBe('[G] Tu és bom [D/F#] e Tua graça [Em7] nunca falha [C]')
    expect(result.lyrics).toBe('Tu és bom e Tua graça nunca falha')
  })

  it('processa linhas sem acordes', () => {
    const input = 'Esta é uma estrofe somente em prosa\nSem nenhum acorde marcado aqui.'
    const result = parseSongContent(input)

    expect(result.chords).toBe(
      'Esta é uma estrofe somente em prosa\nSem nenhum acorde marcado aqui.',
    )
    expect(result.lyrics).toBe(
      'Esta é uma estrofe somente em prosa\nSem nenhum acorde marcado aqui.',
    )
  })

  it('processa seções preservando títulos em ambas as saídas', () => {
    const input = `[INTRO]
[G] [D/F#] [Em] [C]

[VERSO]
[G] Tu és bom, ó Deus
[Em] Tua graça me alcançou

[PRÉ-REFRÃO]
[Am7] E mesmo na tempestade
[D/F#] Eu confiarei

[REFRÃO]
[G] Aleluia, [C] Te adoramos

[PONTE]
[C#m] Tua luz brilha nas trevas

[FINAL]
[Gmaj7] Amém`

    const result = parseSongContent(input)

    // Seções devem estar em ambas
    expect(result.chords).toContain('[INTRO]')
    expect(result.chords).toContain('[VERSO]')
    expect(result.chords).toContain('[PRÉ-REFRÃO]')
    expect(result.chords).toContain('[REFRÃO]')
    expect(result.chords).toContain('[PONTE]')
    expect(result.chords).toContain('[FINAL]')

    expect(result.lyrics).toContain('[INTRO]')
    expect(result.lyrics).toContain('[VERSO]')
    expect(result.lyrics).toContain('[PRÉ-REFRÃO]')
    expect(result.lyrics).toContain('[REFRÃO]')
    expect(result.lyrics).toContain('[PONTE]')
    expect(result.lyrics).toContain('[FINAL]')

    // Lyrics não deve conter os colchetes dos acordes
    expect(result.lyrics).not.toContain('[G]')
    expect(result.lyrics).not.toContain('[D/F#]')
    expect(result.lyrics).not.toContain('[Am7]')
    expect(result.lyrics).not.toContain('[Gmaj7]')
    expect(result.lyrics).toContain('Tu és bom, ó Deus')
    expect(result.lyrics).toContain('Aleluia, Te adoramos')
  })

  it('trata conteúdo vazio com segurança', () => {
    const result = parseSongContent('')
    expect(result.chords).toBe('')
    expect(result.lyrics).toBe('')

    const resultSpaces = parseSongContent('   \n  \t  ')
    expect(resultSpaces.chords).toBe('')
    expect(resultSpaces.lyrics).toBe('')
  })

  it('trata conteúdo que é somente letra', () => {
    const input = 'Não há nenhum acorde aqui\nApenas poesia e louvor sincero\nGlória a Deus'
    const result = parseSongContent(input)

    expect(result.chords).toBe(input)
    expect(result.lyrics).toBe(input)
  })

  it('trata conteúdo que é somente linha de acordes clássica sobrepostos', () => {
    const input = 'G        D/F#      Em7      C\nBb       Am7       F#m7     G7'
    const result = parseSongContent(input)

    expect(result.chords).toBe('G        D/F#      Em7      C\nBb       Am7       F#m7     G7')
    // Na letra pura, linhas estritamente de cifras são descartadas
    expect(result.lyrics).toBe('')
  })

  it('preserva acordes especiais como slash chords e sétimas com nonas', () => {
    const line = '[G/B] Santo, [Bb] Justo, [F#m7] Fiel'
    const stripped = stripInlineChords(line)
    expect(stripped.trim()).toBe('Santo, Justo, Fiel')
  })
})
