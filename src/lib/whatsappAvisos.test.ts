import { describe, it, expect } from 'vitest'
import {
  estimateEnd,
  fromLocalInput,
  nextSlot,
  previewText,
  toLocalInput,
  whenLabel,
} from './whatsappAvisos'

// dom 01/11/2026 10:00 em Brasília
const SAT_10 = Date.UTC(2026, 10, 1, 13, 0)
const at = (h: number, m = 0, day = 1) => Date.UTC(2026, 10, day, h + 3, m)

describe('janela de envio (Brasília)', () => {
  it('dentro da janela fica como está', () => {
    expect(nextSlot(SAT_10, 8 * 60, 20 * 60)).toBe(SAT_10)
  })
  it('antes da janela vai para o começo; depois, para o dia seguinte', () => {
    expect(nextSlot(at(6, 30), 8 * 60, 20 * 60)).toBe(at(8))
    expect(nextSlot(at(20, 0), 8 * 60, 20 * 60)).toBe(at(8, 0, 2))
    expect(nextSlot(at(23, 59), 8 * 60, 20 * 60)).toBe(at(8, 0, 2))
  })
})

describe('estimativa do envio', () => {
  it('120 pessoas, 1 a cada 3 a 5 min, das 8h às 20h: termina no mesmo dia', () => {
    const r = estimateEnd(at(8), 120, {
      windowStart: '08:00',
      windowEnd: '20:00',
      paceMin: 3,
      paceMax: 5,
    })
    expect(r.days).toBe(1)
    expect(r.end).toBe(at(8) + 119 * 4 * 60000) // 15:56
  })
  it('começando às 17h, passa para o dia seguinte', () => {
    const r = estimateEnd(at(17), 120, { paceMin: 3, paceMax: 5 })
    expect(r.days).toBe(2)
    expect(r.end).toBeGreaterThan(at(8, 0, 2))
  })
  it('ninguém: termina na hora', () => {
    expect(estimateEnd(SAT_10, 0, {})).toEqual({ end: SAT_10, days: 0 })
  })
})

describe('textos', () => {
  it('troca as variáveis e o negrito', () => {
    expect(
      previewText('Olá, {primeiro_nome}! **{evento}** {x}', {
        primeiro_nome: 'Ana',
        evento: 'Retiro',
      }),
    ).toBe('Olá, Ana! *Retiro* {x}')
  })
  it('diz quando, em palavras', () => {
    expect(whenLabel(at(16, 40), SAT_10)).toBe('hoje às 16:40')
    expect(whenLabel(at(9, 5, 2), SAT_10)).toBe('amanhã às 09:05')
    expect(whenLabel(at(10, 0, 5), SAT_10)).toBe('qui 05/11 às 10:00')
  })
  it('campo de data e hora em Brasília, ida e volta', () => {
    expect(toLocalInput(SAT_10)).toBe('2026-11-01T10:00')
    expect(fromLocalInput('2026-11-01T10:00')).toBe(new Date(SAT_10).toISOString())
  })
})
