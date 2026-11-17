import { describe, expect, it } from 'vitest'
import { blocksToBody, initialBlocks, usedImages } from './SiteAdminPageEditor'
import type { SitePage } from '@/services/site'

const page = (over: Partial<SitePage>): SitePage => ({
  id: 'p1',
  church_id: 'c1',
  title: 'Quem somos',
  slug: 'quem-somos',
  body: '',
  order: 1,
  active: true,
  ...over,
})

describe('editor de página em blocos', () => {
  it('página antiga (só texto) vira um bloco de texto', () => {
    expect(initialBlocks(page({ body: 'Somos a IBMA.\n\n# Propósito' }))).toEqual([
      { t: 'text', text: 'Somos a IBMA.\n\n# Propósito' },
    ])
    expect(initialBlocks(page({ body: '  ' }))).toEqual([])
  })

  it('mantém os blocos gravados', () => {
    const blocks = [{ t: 'h' as const, text: 'Título' }]
    expect(initialBlocks(page({ body: 'antigo', blocks }))).toBe(blocks)
  })

  it('gera o texto simples para servidor antigo', () => {
    expect(
      blocksToBody([
        { t: 'text', text: ' Olá ' },
        { t: 'h', text: 'Nosso propósito' },
        { t: 'image', img: 'a.jpg' },
        { t: 'text', text: '' },
      ]),
    ).toBe('Olá\n\n# Nosso propósito')
  })

  it('sabe quais fotos os blocos usam', () => {
    const used = usedImages([
      { t: 'image', img: 'a.jpg' },
      { t: 'gallery', imgs: ['b.jpg', 'c.jpg'] },
      { t: 'person', name: 'Pr. Luís', img: 'd.jpg' },
      { t: 'person', name: 'Sem foto' },
      { t: 'text', text: 'x' },
    ])
    expect([...used].sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
  })
})
