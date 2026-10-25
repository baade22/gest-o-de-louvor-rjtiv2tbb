import { describe, expect, it } from 'vitest'
import type { EventRegistration } from '@/types'
import {
  eventDateLabel,
  filterRegistrations,
  isPastEvent,
  summarizeRegistrations,
} from './churchEvents'

const reg = (over: Partial<EventRegistration>): EventRegistration => ({
  id: over.name || 'r',
  church_id: 'c1',
  event_id: 'e1',
  name: 'Fulano',
  paid: false,
  attended: false,
  created: '',
  updated: '',
  ...over,
})

describe('summarizeRegistrations', () => {
  const regs = [
    reg({ name: 'Ana', paid: true, paid_amount: 150, payment_method: 'PIX', attended: true }),
    reg({ name: 'Bruno', paid: true, payment_method: 'DINHEIRO' }),
    reg({ name: 'Caio', paid: true, payment_method: 'ISENTO', attended: true }),
    reg({ name: 'Davi' }),
  ]

  it('soma o recebido (isento não conta), o que falta e as vagas', () => {
    expect(summarizeRegistrations({ price: 150, capacity: 10 }, regs)).toEqual({
      total: 4,
      paid: 3,
      pending: 1,
      attended: 2,
      collected: 300,
      toCollect: 150,
      spotsLeft: 6,
    })
  })

  it('evento gratuito não tem pendência nem limite de vagas', () => {
    const s = summarizeRegistrations({ price: 0, capacity: 0 }, regs)
    expect([s.pending, s.toCollect, s.spotsLeft]).toEqual([0, 0, null])
  })
})

describe('filterRegistrations', () => {
  const regs = [
    reg({ name: 'Júlia Prado', phone: '(81) 99999-1234', paid: true }),
    reg({ name: 'Ana Souza', attended: true }),
  ]
  it('busca sem acento ou por telefone e filtra por pagamento e presença', () => {
    expect(filterRegistrations(regs, 'julia').map((r) => r.name)).toEqual(['Júlia Prado'])
    expect(filterRegistrations(regs, '1234').map((r) => r.name)).toEqual(['Júlia Prado'])
    expect(filterRegistrations(regs, '', 'PENDENTES').map((r) => r.name)).toEqual(['Ana Souza'])
    expect(filterRegistrations(regs, '', 'AUSENTES').map((r) => r.name)).toEqual(['Júlia Prado'])
    expect(filterRegistrations(regs, '').map((r) => r.name)).toEqual(['Ana Souza', 'Júlia Prado'])
  })
})

describe('datas', () => {
  it('monta o rótulo do período e sabe quando o evento passou', () => {
    expect(eventDateLabel({ starts_on: '2026-11-20 00:00:00.000Z', ends_on: '2026-11-22' })).toBe(
      '20 a 22 de nov.',
    )
    expect(eventDateLabel({ starts_on: '2026-11-30', ends_on: '2026-12-02' })).toBe(
      '30 de nov. a 2 de dez.',
    )
    expect(eventDateLabel({ starts_on: '2026-11-08', start_time: '19:30' })).toBe(
      '8 de nov. · 19:30',
    )
    expect(isPastEvent({ starts_on: '2026-10-20', ends_on: '2026-10-25' }, '2026-10-25')).toBe(
      false,
    )
    expect(isPastEvent({ starts_on: '2026-10-20' }, '2026-10-25')).toBe(true)
  })
})
