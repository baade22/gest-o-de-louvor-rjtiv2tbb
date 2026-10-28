import { describe, expect, it } from 'vitest'
import { formatWhatsAppPhone, normalizeWhatsAppPhone, waLink, WHATSAPP_AUTO } from './whatsapp'

describe('normalizeWhatsAppPhone', () => {
  it('põe o 55 em número com DDD', () => {
    expect(normalizeWhatsAppPhone('(81) 98888-7777')).toBe('5581988887777')
    expect(normalizeWhatsAppPhone('81 3333-4444')).toBe('558133334444')
  })
  it('aceita número que já vem com 55 e tira zero do começo', () => {
    expect(normalizeWhatsAppPhone('+55 11 98765-4321')).toBe('5511987654321')
    expect(normalizeWhatsAppPhone('011 98765-4321')).toBe('5511987654321')
  })
  it('recusa número sem DDD ou vazio', () => {
    expect(normalizeWhatsAppPhone('98765-4321')).toBe('')
    expect(normalizeWhatsAppPhone('')).toBe('')
    expect(normalizeWhatsAppPhone(undefined)).toBe('')
  })
})

describe('formatWhatsAppPhone', () => {
  it('mostra o número como no Brasil', () => {
    expect(formatWhatsAppPhone('5581988887777')).toBe('(81) 98888-7777')
    expect(formatWhatsAppPhone('558133334444')).toBe('(81) 3333-4444')
  })
  it('deixa outros formatos como vieram', () => {
    expect(formatWhatsAppPhone('123')).toBe('123')
  })
})

describe('WhatsApp', () => {
  it('lista cada envio automático uma vez só', () => {
    const kinds = WHATSAPP_AUTO.map((a) => a.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })
  it('waLink continua igual', () => {
    expect(waLink('81988887777', 'Oi')).toBe('https://wa.me/5581988887777?text=Oi')
  })
})
