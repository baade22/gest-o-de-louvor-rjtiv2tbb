import { describe, it, expect } from 'vitest'
import {
  parseSongContent,
  isSectionMarker,
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
    // INTRO só tem acordes: não tem o que cantar, então sai da letra
    expect(result.lyrics).not.toContain('[INTRO]')
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

  it('cifra colada do Cifra Club: letra sai só com o texto cantado (caso do Pedro)', () => {
    const input = `[Intro] Dm7  C  Bb

[Primeira Parte]

Dm7
    Todo o céu se dobra
C                    Bb9
  Para receber Jesus,   o grande Rei
         C
Rei dos reis
Dm7
   Dobro o meu coração
C                            Bb9
  Para sempre exaltarei ao que venceu
         C
Eu cantarei

[Segunda Parte]

Bb  C  Dm  C/E  F
A|---------| le--luia 
 Bb  C   Dm  Bb  F
Sa_nto, sa_nto  rei
Bb  C  Dm  C/E  F
A|---------| le--luia 
                  Bb
Me amou naquela cruz
               C
Isso é que é amor

[Refrão]

             F
O céu escureceu
             Dm
Rocha se partiu
                 C
Quando Jesus morreu
                     Bb
Mas em glória ressurgiu

             F
E o mesmo poder
                Dm
Que levantou Jesus
            C
Me fará vencer
                    Bb  C
Para glória do seu nome
Bb          F       C
Oh, oh, oh, oh, oh, oh
      Dm
Seu amor é tudo
Bb          F       C  Dm
Oh, oh, oh, oh, oh, oh

[Final] Bb  F  C  Dm
        Bb  F  C
        Bb  F  C`

    const result = parseSongContent(input)
    expect(result.lyrics).toBe(`[PRIMEIRA PARTE]

Todo o céu se dobra
Para receber Jesus, o grande Rei
Rei dos reis
Dobro o meu coração
Para sempre exaltarei ao que venceu
Eu cantarei

[SEGUNDA PARTE]

Aleluia
Santo, santo rei
Aleluia
Me amou naquela cruz
Isso é que é amor

[REFRÃO]

O céu escureceu
Rocha se partiu
Quando Jesus morreu
Mas em glória ressurgiu

E o mesmo poder
Que levantou Jesus
Me fará vencer
Para glória do seu nome
Oh, oh, oh, oh, oh, oh
Seu amor é tudo
Oh, oh, oh, oh, oh, oh`)

    // A cifra continua intacta, com acordes e alinhamento
    expect(result.chords).toContain('A|---------| le--luia')
    expect(result.chords).toContain('C                    Bb9')
    expect(result.sections.map((s) => s.name)).toEqual([
      'INTRO',
      'PRIMEIRA PARTE',
      'SEGUNDA PARTE',
      'REFRÃO',
      'FINAL',
    ])
  })

  it('não apaga letra curta que começa com A/E nem hífen de palavra composta', () => {
    const result = parseSongContent(`A Ele a glória
E a Deus
Aba-Pai`)
    expect(result.lyrics).toBe('A Ele a glória\nE a Deus\nAba-Pai')
  })

  it('tira tablatura, (2x), espaço invisível e prolongamentos', () => {
    const result = parseSongContent(`[Intro]
e|---3---5---|
B|--5h7------|
[Verso]
\u200BDm7\u00A0
   Deus----   é fiel
G  D  Em  (2x)
(2x)
Glo___ria`)
    expect(result.lyrics).toBe('[VERSO]\nDeus é fiel\nGloria')
  })

  it('rótulo de seção na mesma linha dos acordes continua na letra quando há texto cantado', () => {
    const result = parseSongContent(`[Refrão] G  D
Tu és santo`)
    expect(result.lyrics).toBe('[REFRÃO]\nTu és santo')
  })
})
