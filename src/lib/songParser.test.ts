import { describe, it, expect } from 'vitest'
import {
  parseSongContent,
  isSectionMarker,
  stripInlineChords,
  extractSectionsFromText,
  serializeSections,
} from './songParser'
import { isChordToken } from './transposition'

describe('Parser Determinístico de Música (Letra + Cifra)', () => {
  it('reconhece todos os acordes obrigatórios do requisito', () => {
    const requiredChords = ['G', 'G7', 'Gmaj7', 'G/B', 'Am7', 'C#m', 'F#m7', 'Bb', 'D/F#']

    for (const chord of requiredChords) {
      expect(isChordToken(chord), `Deveria reconhecer ${chord}`).toBe(true)
    }
  })

  it('reconhece marcadores de seção (INTRO, INTRODUÇÃO, VERSO, VERSO 1, VERSO 2, VERSO 3, PRÉ-REFRÃO, REFRÃO, CORO, PONTE, FINAL, INTERLÚDIO, INSTRUMENTAL, TAG, BREAK)', () => {
    const markers = [
      'INTRO',
      'INTRODUÇÃO',
      'VERSO',
      'VERSO 1',
      'VERSO 2',
      'VERSO 3',
      'PRÉ-REFRÃO',
      'REFRÃO',
      'CORO',
      'PONTE',
      'FINAL',
      'INTERLÚDIO',
      'INSTRUMENTAL',
      'TAG',
      'BREAK',
    ]

    for (const marker of markers) {
      expect(isSectionMarker(marker), `Deveria reconhecer seção ${marker}`).toBe(true)
      expect(isSectionMarker(`[${marker}]`), `Deveria reconhecer seção [${marker}]`).toBe(true)
      expect(isSectionMarker(`${marker}:`), `Deveria reconhecer seção ${marker}:`).toBe(true)
    }
  })

  it('processa exemplo exato do requisito com acordes em linha própria acima da letra', () => {
    const input = `INTRO
G       D       Em       C
VERSO
G
Eu sei que Tu estás aqui
D
Mesmo quando não posso ver
REFRÃO
G              D
Eu vou confiar em Ti`

    const result = parseSongContent(input)

    // Chords deve manter seções e acordes acima da letra
    expect(result.chords).toContain('[INTRO]')
    expect(result.chords).toContain('G       D       Em       C')
    expect(result.chords).toContain('[VERSO]')
    expect(result.chords).toContain('Eu sei que Tu estás aqui')
    expect(result.chords).toContain('[REFRÃO]')
    expect(result.chords).toContain('Eu vou confiar em Ti')

    // Lyrics deve remover as linhas de cifras puras e manter a letra e seções
    expect(result.lyrics).toContain('[INTRO]')
    expect(result.lyrics).toContain('[VERSO]')
    expect(result.lyrics).toContain('Eu sei que Tu estás aqui')
    expect(result.lyrics).toContain('Mesmo quando não posso ver')
    expect(result.lyrics).toContain('[REFRÃO]')
    expect(result.lyrics).toContain('Eu vou confiar em Ti')
    expect(result.lyrics).not.toContain('G       D       Em       C')
    expect(result.lyrics).not.toContain('G              D')

    // Deve ter gerado 3 seções: INTRO, VERSO, REFRÃO
    expect(result.sections.length).toBe(3)
    expect(result.sections[0].name).toBe('INTRO')
    expect(result.sections[1].name).toBe('VERSO')
    expect(result.sections[2].name).toBe('REFRÃO')
  })

  it('processa exemplo com acordes inline [G] no formato antigo', () => {
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

  it('permite manipulação, reordenação e edição de seções', () => {
    const sections = [
      { id: '1', name: 'INTRO', type: 'INTRO', content: 'G  D  Em  C' },
      { id: '2', name: 'VERSO 1', type: 'VERSO', content: 'G\nTu és bom' },
      { id: '3', name: 'REFRÃO', type: 'REFRÃO', content: 'C  D  G\nAleluia' },
    ]

    // Reordena: REFRÃO antes de VERSO 1
    const reordered = [sections[0], sections[2], sections[1]]
    const serialized = serializeSections(reordered)

    expect(serialized).toContain('[INTRO]\nG  D  Em  C')
    expect(serialized).toContain('[REFRÃO]\nC  D  G\nAleluia')
    expect(serialized).toContain('[VERSO 1]\nG\nTu és bom')

    // Extrai de volta
    const extracted = extractSectionsFromText(serialized)
    expect(extracted.length).toBe(3)
    expect(extracted[0].name).toBe('INTRO')
    expect(extracted[1].name).toBe('REFRÃO')
    expect(extracted[2].name).toBe('VERSO 1')
  })

  it('trata conteúdo vazio com segurança', () => {
    const result = parseSongContent('')
    expect(result.chords).toBe('')
    expect(result.lyrics).toBe('')
    expect(result.sections).toEqual([])

    const resultSpaces = parseSongContent('   \n  \t  ')
    expect(resultSpaces.chords).toBe('')
    expect(resultSpaces.lyrics).toBe('')
    expect(resultSpaces.sections).toEqual([])
  })

  it('trata seções como BREAK, INSTRUMENTAL, TAG e INTERLÚDIO', () => {
    const input = `BREAK
Am  G/B  C
INSTRUMENTAL
D  Em  C
TAG
Amém`

    const result = parseSongContent(input)
    expect(result.chords).toContain('[BREAK]')
    expect(result.chords).toContain('[INSTRUMENTAL]')
    expect(result.chords).toContain('[TAG]')

    expect(result.sections.length).toBe(3)
    expect(result.sections[0].name).toBe('BREAK')
    expect(result.sections[1].name).toBe('INSTRUMENTAL')
    expect(result.sections[2].name).toBe('TAG')
  })
})
