import { describe, expect, it } from 'vitest'
import {
  blockStarts,
  formatAt,
  parseInline,
  parseRich,
  richToPlain,
  setBlockFormat,
  setLineKind,
  toggleWrap,
} from './richText'

describe('parseRich', () => {
  it('lê parágrafos, títulos, listas e citação', () => {
    const b = parseRich(
      '# Quem somos\nSomos uma igreja\nem Aldeia.\n\n- Culto\n- EBD\n1. um\n2. dois\n> Até aqui\n> Fim',
    )
    expect(b.map((x) => x.kind)).toEqual(['h', 'p', 'ul', 'ol', 'quote'])
    expect(b[1]).toMatchObject({
      text: 'Somos uma igreja\nem Aldeia.',
      align: 'left',
      size: 'normal',
    })
    expect(b[2]).toMatchObject({ items: ['Culto', 'EBD'] })
    expect(b[4]).toMatchObject({ text: 'Até aqui\nFim' })
  })

  it('aplica alinhamento e tamanho', () => {
    const b = parseRich(
      '{justificado}Texto longo\ncontinua\n\n{centro}{grande}# Título\n{direita}- a\n- b',
    )
    expect(b[0]).toMatchObject({ kind: 'p', align: 'justify', text: 'Texto longo\ncontinua' })
    expect(b[1]).toMatchObject({ kind: 'h', align: 'center', size: 'large', text: 'Título' })
    expect(b[2]).toMatchObject({ kind: 'ul', align: 'right', items: ['a', 'b'] })
  })

  it('linha com marca no meio do parágrafo começa outro parágrafo', () => {
    const b = parseRich('um\n{centro}dois')
    expect(b).toHaveLength(2)
    expect(b[1]).toMatchObject({ align: 'center', text: 'dois' })
  })
})

describe('parseInline', () => {
  it('negrito, itálico, sublinhado, riscado, marca-texto, cor e link', () => {
    const n = parseInline('**a** *b* __c__ ~~d~~ ==e== {azul}f{/} [g](https://x.com)')
    expect(n.filter((x) => x.t !== 'text').map((x) => x.t)).toEqual([
      'b',
      'i',
      'u',
      's',
      'mark',
      'color',
      'a',
    ])
  })

  it('aninha e quebra linha', () => {
    const n = parseInline('**forte *e itálico***\nfim')
    expect(n[0]).toMatchObject({ t: 'b' })
    expect(n.some((x) => x.t === 'br')).toBe(true)
  })

  it('link inseguro vira texto', () => {
    const n = parseInline('[x](javascript:alert(1))')
    expect(n.some((x) => x.t === 'a')).toBe(false)
    expect(n[0]).toEqual({ t: 'text', v: 'x' })
  })
})

describe('richToPlain', () => {
  it('tira as marcas', () => {
    expect(richToPlain('{justificado}**Olá** *igreja*\n\n- um\n- dois')).toBe(
      'Olá igreja um · dois',
    )
  })
})

describe('edição', () => {
  it('toggleWrap põe e tira negrito', () => {
    const a = toggleWrap('oi mundo', 3, 8, '**')
    expect(a.value).toBe('oi **mundo**')
    expect(a.value.slice(a.start, a.end)).toBe('mundo')
    expect(toggleWrap(a.value, a.start, a.end, '**').value).toBe('oi mundo')
  })

  it('setLineKind faz lista numerada e desfaz', () => {
    const a = setLineKind('a\nb', 0, 3, 'ol')
    expect(a.value).toBe('1. a\n2. b')
    expect(setLineKind(a.value, 0, a.value.length, 'ol').value).toBe('a\nb')
  })

  it('blockStarts marca o início de cada bloco', () => {
    expect(blockStarts(['a', 'b', '', '- x', '- y', '# T', 'c'])).toEqual([0, 3, 5, 6])
  })

  it('justificar sem seleção vale para o texto todo', () => {
    const v = 'Primeiro\nlinha 2\n\nSegundo\n\n- item\n- item'
    const r = setBlockFormat(v, 0, 0, { align: 'justify' })
    expect(r.value).toBe(
      '{justificado}Primeiro\nlinha 2\n\n{justificado}Segundo\n\n{justificado}- item\n- item',
    )
    // voltar para a esquerda tira as marcas
    expect(setBlockFormat(r.value, 0, 0, { align: 'left' }).value).toBe(v)
  })

  it('alinhamento só no parágrafo selecionado mantém o tamanho', () => {
    const v = '{grande}Um\n\nDois'
    const r = setBlockFormat(v, 2, 5, { align: 'center' })
    expect(r.value).toBe('{centro}{grande}Um\n\nDois')
    expect(formatAt(r.value, r.value.length)).toEqual({ align: 'left', size: 'normal' })
    expect(formatAt(r.value, 3)).toEqual({ align: 'center', size: 'large' })
  })
})

describe('alinhamento padrão justificado (documentos)', () => {
  it('parágrafo sem marca sai justificado e {esquerda} vale', () => {
    const b = parseRich('um\n\n{esquerda}dois\n\n{centro}três', 'justify')
    expect(b.map((x) => x.align)).toEqual(['justify', 'left', 'center'])
  })

  it('alinhar à esquerda grava {esquerda}; justificar tira a marca', () => {
    const left = setBlockFormat('texto', 0, 0, { align: 'left' }, 'justify')
    expect(left.value).toBe('{esquerda}texto')
    expect(formatAt(left.value, 12, 'justify').align).toBe('left')
    const back = setBlockFormat(left.value, 0, 0, { align: 'justify' }, 'justify')
    expect(back.value).toBe('texto')
  })
})

describe('lista numerada separada por linha em branco', () => {
  it('continua a numeração escrita', () => {
    const b = parseRich('1) um\n\n2) dois')
    expect(b).toHaveLength(2)
    expect(b[1]).toMatchObject({ kind: 'ol', start: 2 })
    expect(b[0]).not.toHaveProperty('start')
  })
})
