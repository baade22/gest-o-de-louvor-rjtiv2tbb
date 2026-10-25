import { describe, expect, it } from 'vitest'
import { mailtoLink, receiptMessage, receiptNumber, whatsappLink } from './receipt'

describe('recibo', () => {
  it('número fixo pelo ano e id do lançamento', () => {
    expect(receiptNumber({ id: 'a1b2c3d4e5f6g7h', date: '2026-10-19 12:00:00.000Z' })).toBe(
      '2026-A1B2C3',
    )
  })

  it('mensagem com primeiro nome, valor, data e campanha', () => {
    const m = receiptMessage({
      personName: 'Carlos Alberto Souza',
      churchName: 'Igreja Batista Central',
      number: '2026-A1B2C3',
      categoryName: 'Oferta',
      amountCents: 45000,
      date: '2026-10-19 12:00:00.000Z',
      campaignName: 'Reforma do templo',
    })
    expect(m).toContain('Olá, Carlos!')
    expect(m).toContain('Recibo nº 2026-A1B2C3')
    expect(m).toContain('Oferta · Reforma do templo: R$ 450,00 em 19/10/2026')
  })

  it('WhatsApp só com DDD; põe o 55', () => {
    expect(whatsappLink('(81) 98765-4321', 'oi')).toBe('https://wa.me/5581987654321?text=oi')
    expect(whatsappLink('+55 81 3333-4444', 'a b')).toBe('https://wa.me/558133334444?text=a%20b')
    expect(whatsappLink('98765-4321', 'oi')).toBeNull()
    expect(whatsappLink('', 'oi')).toBeNull()
  })

  it('e-mail só com endereço válido', () => {
    expect(mailtoLink('a@b.com', 'Recibo', 'x y')).toBe('mailto:a@b.com?subject=Recibo&body=x%20y')
    expect(mailtoLink('sem-email', 'R', 'x')).toBeNull()
  })
})
