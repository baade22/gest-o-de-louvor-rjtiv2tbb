import { describe, expect, it } from 'vitest'
import { brtDateTime, brtDay, statementCsv, statementSummary, timeAgo } from './bankStatement'

describe('saldos e extratos', () => {
  const lines = [
    {
      date: '2026-10-12 12:00:00.000Z',
      amount_cents: 15000,
      description: 'Pix; JOAO',
      status: 'CONCILIADO',
    },
    {
      date: '2026-10-11 12:00:00.000Z',
      amount_cents: -990,
      description: 'Tarifa',
      status: 'PENDENTE',
    },
    {
      date: '2026-10-12 12:00:00.000Z',
      amount_cents: 2000,
      description: 'Pix',
      status: 'PENDENTE',
    },
  ]

  it('soma entradas e saídas e agrupa por dia', () => {
    const s = statementSummary(lines)
    expect(s.credits).toBe(17000)
    expect(s.debits).toBe(990)
    expect(s.net).toBe(16010)
    expect(s.days.map((d) => [d.date, d.lines.length, d.net])).toEqual([
      ['2026-10-11', 1, -990],
      ['2026-10-12', 2, 17000],
    ])
  })

  it('mostra hora de Brasília e quanto tempo faz', () => {
    expect(brtDateTime('2026-10-18 17:05:00.000Z')).toBe('18/10 14:05')
    expect(brtDay('2026-10-18 01:00:00.000Z')).toBe('2026-10-17')
    const now = Date.parse('2026-10-18T17:05:00Z')
    expect(timeAgo('2026-10-18 17:04:50.000Z', now)).toBe('agora')
    expect(timeAgo('2026-10-18 16:50:00.000Z', now)).toBe('há 15 min')
    expect(timeAgo('2026-10-18 12:00:00.000Z', now)).toBe('há 5 h')
    expect(timeAgo('2026-10-17 12:00:00.000Z', now)).toBe('há 1 dia')
  })

  it('exporta planilha que o Excel em português abre', () => {
    const csv = statementCsv(lines, (s) => (s === 'CONCILIADO' ? 'Conciliado' : 'A conciliar'))
    expect(csv.split('\n')).toEqual([
      '﻿Data;Descrição;Valor;Situação',
      '11/10/2026;Tarifa;-9,90;A conciliar',
      '12/10/2026;"Pix; JOAO";150,00;Conciliado',
      '12/10/2026;Pix;20,00;A conciliar',
    ])
  })
})
