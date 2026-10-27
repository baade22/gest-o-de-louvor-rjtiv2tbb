import { describe, expect, it } from 'vitest'
import type { EventRegistration } from '@/types'
import { registrationDue, summarizeRegistrations } from './churchEvents'
import {
  addressLines,
  eventColor,
  fillMessage,
  findCoupon,
  formatCep,
  mapsUrl,
  messageVarsFor,
  normalizeCouponCode,
  parseRichText,
  parseViaCep,
  priceWithCoupon,
  registrationPixTxid,
  richToWhatsApp,
  signupClosedReason,
  todayBrazil,
  whatsappUrl,
} from './eventPage'

describe('parseRichText', () => {
  it('separa parágrafos, listas e títulos e marca negrito, itálico e links', () => {
    const blocks = parseRichText(
      '## Encontro para Casais\n**Tema:** Amar além\nVeja *mais* em https://igreja.org/x.\n\nIncluso:\n- Almoço\n- Jantar',
    )
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'paragraph', 'list'])
    const para = blocks[1] as Extract<(typeof blocks)[number], { type: 'paragraph' }>
    expect(para.lines[0][0]).toEqual({ text: 'Tema:', bold: true })
    expect(para.lines[1]).toEqual([
      { text: 'Veja ' },
      { text: 'mais', italic: true },
      { text: ' em ' },
      { text: 'https://igreja.org/x', href: 'https://igreja.org/x' },
      { text: '.' },
    ])
    const list = blocks[3] as Extract<(typeof blocks)[number], { type: 'list' }>
    expect(list.items.map((i) => i[0].text)).toEqual(['Almoço', 'Jantar'])
  })

  it('não cria link para javascript: nem trata asterisco solto como itálico', () => {
    const [b] = parseRichText('javascript:alert(1) e 2 * 3')
    expect(b.type).toBe('paragraph')
    const spans = (b as Extract<typeof b, { type: 'paragraph' }>).lines[0]
    expect(spans.every((s) => !s.href && !s.italic)).toBe(true)
  })
})

describe('mensagens', () => {
  it('preenche os campos e deixa chaves desconhecidas como estão', () => {
    expect(fillMessage('Oi {Nome}, {evento} {outro}', { nome: 'Ana', evento: 'Retiro' })).toBe(
      'Oi Ana, Retiro {outro}',
    )
  })

  it('converte para o formato do WhatsApp', () => {
    expect(richToWhatsApp('## Título\n**ok** e *leve*')).toBe('*Título*\n*ok* e _leve_')
  })

  it('monta os campos de uma inscrição', () => {
    const vars = messageVarsFor(
      {
        title: 'Retiro',
        location: '',
        address_street: 'Av. Vera Cruz',
        address_number: '117',
        price: 40,
      },
      { name: 'Maria  Souza', amount: 30 },
      '11 a 12 de abr.',
      'IBMA',
    )
    expect(vars).toMatchObject({
      nome: 'Maria',
      evento: 'Retiro',
      local: 'Av. Vera Cruz, 117',
      igreja: 'IBMA',
    })
    expect(vars.valor).toMatch(/30,00/)
  })
})

describe('cupons', () => {
  const coupons = [
    { code: 'CASAL10', kind: 'VALUE' as const, value: 10 },
    { code: 'PASTORES', kind: 'PERCENT' as const, value: 100, limit: 5 },
  ]
  it('normaliza o código e encontra o cupom', () => {
    expect(normalizeCouponCode(' casal-10 ')).toBe('CASAL10')
    expect(normalizeCouponCode('Promoção')).toBe('PROMOCAO')
    expect(findCoupon(coupons, 'casal10')?.value).toBe(10)
    expect(findCoupon(coupons, 'nada')).toBeNull()
  })
  it('aplica desconto em valor e em percentual sem ficar negativo', () => {
    expect(priceWithCoupon(40, coupons[0])).toBe(30)
    expect(priceWithCoupon(40, coupons[1])).toBe(0)
    expect(priceWithCoupon(5, coupons[0])).toBe(0)
    expect(priceWithCoupon(33.33, { code: 'X', kind: 'PERCENT', value: 15 })).toBe(28.33)
    expect(priceWithCoupon(40, null)).toBe(40)
  })
})

describe('signupClosedReason', () => {
  const base = { registration_open: true, capacity: 10 }
  it('segue a ordem encerrado > só divulgar > fechado > prazo > lotado', () => {
    expect(signupClosedReason(base, '2026-04-01', 3)).toBe('')
    expect(
      signupClosedReason({ ...base, closed_at: '2026-04-13 10:00:00Z' }, '2026-04-01', 0),
    ).toBe('ended')
    expect(signupClosedReason({ ...base, publish_only: true }, '2026-04-01', 0)).toBe('soon')
    expect(signupClosedReason({ ...base, registration_open: false }, '2026-04-01', 0)).toBe(
      'closed',
    )
    const deadline = { ...base, registration_deadline: '2026-04-10 00:00:00.000Z' }
    expect(signupClosedReason(deadline, '2026-04-10', 0)).toBe('')
    expect(signupClosedReason(deadline, '2026-04-11', 0)).toBe('deadline')
    expect(signupClosedReason(base, '2026-04-01', 10)).toBe('full')
  })
  it('usa a data de Brasília', () => {
    expect(todayBrazil(new Date('2026-04-11T02:00:00Z'))).toBe('2026-04-10')
  })
})

describe('endereço e links', () => {
  const a = {
    address_cep: '54786-770',
    address_street: 'Avenida Vera Cruz',
    address_number: '117',
    address_complement: 'IBMA',
    address_district: 'Vera Cruz',
    address_city: 'Camaragibe',
    address_state: 'PE',
  }
  it('monta as duas linhas e o link do mapa', () => {
    expect(addressLines(a)).toEqual(['Avenida Vera Cruz, 117, IBMA', 'Vera Cruz · Camaragibe-PE'])
    expect(mapsUrl(a)).toContain(encodeURIComponent('Avenida Vera Cruz, 117, Vera Cruz'))
    expect(mapsUrl({}, 'Sítio Recanto')).toContain(encodeURIComponent('Sítio Recanto'))
  })
  it('lê a resposta do ViaCEP', () => {
    expect(
      parseViaCep({ cep: '54786770', logradouro: 'Av X', bairro: 'B', localidade: 'C', uf: 'pe' }),
    ).toEqual({
      address_cep: '54786-770',
      address_street: 'Av X',
      address_district: 'B',
      address_city: 'C',
      address_state: 'PE',
    })
    expect(parseViaCep({ erro: true })).toBeNull()
    expect(formatCep('54786770')).toBe('54786-770')
  })
  it('gera o link do WhatsApp com DDI', () => {
    expect(whatsappUrl('(81) 99999-0000', 'Oi')).toBe('https://wa.me/5581999990000?text=Oi')
    expect(whatsappUrl('+55 81 99999-0000')).toBe('https://wa.me/5581999990000')
  })
  it('valida a cor e o identificador do Pix', () => {
    expect(eventColor('#873BFE')).toBe('#873BFE')
    expect(eventColor('red')).toBe('#0f766e')
    expect(registrationPixTxid('abc123def456ghi')).toBe('EVabc123def456ghi')
  })
})

describe('valor devido com cupom', () => {
  const reg = (over: Partial<EventRegistration>): EventRegistration => ({
    id: 'r',
    church_id: 'c',
    event_id: 'e',
    name: 'X',
    paid: false,
    attended: false,
    created: '',
    updated: '',
    ...over,
  })
  it('usa amount_due quando existe e o preço do evento nas inscrições antigas', () => {
    const event = { price: 40, capacity: 0 }
    expect(registrationDue(event, reg({ amount_due: 30 }))).toBe(30)
    expect(registrationDue(event, reg({ amount_due: 0 }))).toBe(40)
    const s = summarizeRegistrations(event, [
      reg({ amount_due: 30 }),
      reg({}),
      reg({ paid: true, payment_method: 'PIX', amount_due: 30, paid_amount: 30 }),
    ])
    expect(s.toCollect).toBe(70)
    expect(s.collected).toBe(30)
    expect(s.pending).toBe(2)
  })
})
