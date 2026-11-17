import { describe, expect, it } from 'vitest'
import { cleanTitle, numberFrom, parseJson, parseMufl } from './hymnImport'

/** Monta um .mufl pequeno (Java serialization de um ArrayList de Music), igual ao do Holyrics. */
function mufl(items: { title: string; lyrics: string; artist?: string; note?: string; archived?: boolean }[]) {
  const out: number[] = []
  const u8 = (...b: number[]) => out.push(...b)
  const u16 = (n: number) => u8((n >> 8) & 255, n & 255)
  const i32 = (n: number) => u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
  const utf = (s: string) => {
    const b = new TextEncoder().encode(s)
    u16(b.length)
    u8(...b)
  }
  const str = (s: string | undefined) => (s === undefined ? u8(0x70) : (u8(0x74), utf(s)))
  u16(0xaced)
  u16(5)
  // ArrayList (handle 0 = classe, 1 = objeto)
  u8(0x73, 0x72)
  utf('java.util.ArrayList')
  u8(0x78, 0x81, 0xd2, 0x1d, 0x99, 0xc7, 0x61, 0x9d)
  u8(0x03)
  u16(1)
  u8('I'.charCodeAt(0))
  utf('size')
  u8(0x78, 0x70)
  i32(items.length)
  u8(0x77, 4)
  i32(items.length)
  items.forEach((m, i) => {
    u8(0x73)
    if (i === 0) {
      // Music (handle 2) com o tipo String (handle 3)
      u8(0x72)
      utf('com.limagiran.holyrics.model.Music')
      u8(0, 0, 0, 0, 0, 0, 0, 1)
      u8(0x02)
      u16(5)
      u8('Z'.charCodeAt(0))
      utf('archived')
      for (const [n, first] of [
        ['artist', true],
        ['lyrics', false],
        ['note', false],
        ['title', false],
      ] as const) {
        u8('L'.charCodeAt(0))
        utf(n)
        if (first) {
          u8(0x74)
          utf('Ljava/lang/String;')
        } else {
          u8(0x71)
          i32(0x7e0000 + 3)
        }
      }
      u8(0x78, 0x70)
    } else {
      u8(0x71)
      i32(0x7e0000 + 2)
    }
    u8(m.archived ? 1 : 0)
    str(m.artist)
    str(m.lyrics)
    str(m.note)
    str(m.title)
  })
  u8(0x78)
  return new Uint8Array(out)
}

describe('numberFrom', () => {
  it('acha o número nos formatos do Holyrics', () => {
    expect(numberFrom('Cantor Cristão - 498')).toBe(498)
    expect(numberFrom('Louvor (Cantor Cristão - 385)')).toBe(385)
    expect(numberFrom('CC498')).toBe(498)
    expect(numberFrom('Hino 64 HCC Glorioso')).toBe(64)
    expect(numberFrom('Como agradecer - 422 HCC')).toBe(422)
    expect(numberFrom('12 - Louvamos')).toBe(12)
    expect(numberFrom('Segurança')).toBe(0)
  })
})

describe('cleanTitle', () => {
  it('tira o hinário e o número do título', () => {
    expect(cleanTitle('Louvor (Cantor Cristão - 385)')).toBe('Louvor')
    expect(cleanTitle('Coroai cantor cristão 60')).toBe('Coroai')
    expect(cleanTitle('Como agradecer - 422 HCC')).toBe('Como agradecer')
    expect(cleanTitle('Hino 64 HCC Glorioso és tu, Senhor')).toBe('Glorioso és tu, Senhor')
    expect(cleanTitle('12 - Louvamos')).toBe('Louvamos')
  })
})

describe('parseMufl', () => {
  it('lê a exportação do Holyrics', () => {
    const r = parseMufl(
      mufl([
        { title: 'Santo', artist: 'Cantor Cristão - 9', lyrics: 'Santo! Santo! Santo!\r\n\r\nDeus' },
        { title: 'Antífona', artist: 'Cantor Cristão - 1', lyrics: 'A Ti, ó Deus' },
        { title: 'Como agradecer - 422 HCC', artist: 'Cantor Cristão', lyrics: 'Como agradecer' },
        { title: 'Velho', artist: 'Cantor Cristão - 2', lyrics: 'x', archived: true },
        { title: 'Santo', artist: 'Cantor Cristão - 9', lyrics: 'Santo! Santo! Santo!\n\nDeus Onipotente' },
      ]),
    )
    expect(r.hymnal).toBe('Cantor Cristão')
    expect(r.skipped).toBe(1)
    expect(r.hymns.map((h) => [h.number, h.title, h.hymnal])).toEqual([
      [1, 'Antífona', undefined],
      [9, 'Santo', undefined],
      [422, 'Como agradecer', 'Hinário para o Culto Cristão'],
    ])
    // repetido: fica a letra mais completa, sem \r
    expect(r.hymns[1].lyrics).toBe('Santo! Santo! Santo!\n\nDeus Onipotente')
  })

  it('recusa arquivo que não é do Holyrics', () => {
    expect(() => parseMufl(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })
})

describe('parseJson', () => {
  it('aceita lista com nomes de campo variados e coro separado', () => {
    const r = parseJson(
      JSON.stringify({
        hinos: [
          { numero: 2, titulo: 'Segundo', letra: ['Estrofe 1', 'Estrofe 2'], coro: 'Aleluia' },
          { number: '1', title: 'Primeiro', lyrics: 'Linha<br>linha' },
          { titulo: '' },
        ],
      }),
    )
    expect(r.skipped).toBe(1)
    expect(r.hymns.map((h) => h.number)).toEqual([1, 2])
    expect(r.hymns[0].lyrics).toBe('Linha\nlinha')
    expect(r.hymns[1].lyrics).toBe('Estrofe 1\n\nCoro\nAleluia\n\nEstrofe 2')
  })

  it('avisa JSON quebrado', () => {
    expect(() => parseJson('{')).toThrow('formatação')
  })
})
