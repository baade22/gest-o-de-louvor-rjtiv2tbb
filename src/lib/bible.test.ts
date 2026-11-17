import { describe, expect, it } from 'vitest'
import { BIBLE_BOOKS, bibleComUrl, findBook, parseRef, verseParts } from './bible'

describe('bible', () => {
  it('tem os 66 livros com 1189 capítulos', () => {
    expect(BIBLE_BOOKS).toHaveLength(66)
    expect(BIBLE_BOOKS.reduce((n, b) => n + b.chapters, 0)).toBe(1189)
  })
  it('acha livro por nome, abreviação e começo do nome', () => {
    expect(findBook('jo')?.name).toBe('João')
    expect(findBook('Jó')?.name).toBe('Jó')
    expect(findBook('joao')?.name).toBe('João')
    expect(findBook('1 Co')?.name).toBe('1 Coríntios')
    expect(findBook('apoc')?.name).toBe('Apocalipse')
    expect(findBook('salmos')?.code).toBe('PSA')
    expect(findBook('xyz')).toBeUndefined()
  })
  it('lê referências', () => {
    expect(parseRef('Jo 3:16')).toMatchObject({ chapter: 3, verse: 16, book: { code: 'JOH' } })
    expect(parseRef('joão 3 16')).toMatchObject({ chapter: 3, verse: 16 })
    expect(parseRef('Sl 23')).toMatchObject({ chapter: 23, book: { code: 'PSA' } })
    expect(parseRef('1 Co 13.4')).toMatchObject({ chapter: 13, verse: 4, book: { code: '1CO' } })
    expect(parseRef('Gênesis')).toMatchObject({ chapter: 1, book: { code: 'GEN' } })
    expect(parseRef('Jo 30')).toBeNull()
    expect(parseRef('amor de Deus')).toBeNull()
  })
  it('separa os acréscimos entre colchetes', () => {
    expect(verseParts('para [que eu saiba] se és')).toEqual([
      { text: 'para ', added: false },
      { text: 'que eu saiba', added: true },
      { text: ' se és', added: false },
    ])
  })
  it('monta o link do Bible.com', () => {
    expect(bibleComUrl(129, findBook('Jo')!, 3)).toBe('https://www.bible.com/pt/bible/129/JHN.3')
  })
})

describe('searchBible', () => {
  it('põe a frase exata antes e ignora colchetes', async () => {
    const { searchBible } = await import('./bible')
    const data: Record<string, string[][]> = {
      GEN: [['A graça de Deus e a paz.', 'Haja graça e paz convosco.', 'Isto é [a] graça e paz.']],
    }
    const orig = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const code = String(url).split('/').pop()!.replace('.json', '')
      return { ok: true, json: async () => data[code] || [] } as Response
    }) as typeof fetch
    try {
      const hits = await searchBible('graça e paz')
      expect(hits.map((h) => h.verse)).toEqual([2, 3, 1])
    } finally {
      globalThis.fetch = orig
    }
  })
})
