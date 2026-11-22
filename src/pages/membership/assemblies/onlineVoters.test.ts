import { describe, expect, it } from 'vitest'
import { onlineVoterRows, presenceRows, recifeTime, votersCsv } from './onlineVoters'

describe('votantes on-line', () => {
  it('mostra a hora de Recife', () => {
    expect(recifeTime('2026-11-22 16:40:05.123Z')).toBe('22/11/2026 13:40')
  })
  it('ordena por nome e monta o CSV', () => {
    const rows = onlineVoterRows(
      [
        {
          id: '2',
          person_id: '',
          name: 'Zélia',
          cpf: '111.444.777-35',
          birth_date: '1990-01-31',
          ip: '1.2.3.4',
          created: '2026-11-22 16:00:00Z',
        },
        { id: '1', person_id: 'p', name: '', created: '2026-11-22 15:00:00Z' },
      ],
      new Map([['p', { id: 'p', name: 'Ana "Bia"' } as never]]),
    )
    expect(rows.map((r) => r.name)).toEqual(['Ana "Bia"', 'Zélia'])
    expect(rows[1].birth).toBe('31/01/1990')
    expect(votersCsv(rows).split('\r\n')[1]).toBe('"Ana ""Bia""";"";"";"22/11/2026 12:00";"";""')
  })
})

describe('lista de presença com votantes on-line', () => {
  it('junta presentes e votantes e marca a assinatura digital', () => {
    const rows = presenceRows(
      [{ name: 'Luís Carlos da Silva' }, { name: 'Ana Lima' }],
      [
        {
          id: '1',
          name: 'Luis Carlos da Silva',
          cpf: '111.444.777-35',
          birth: '',
          when: '22/11/2026 13:40',
          ip: '1.2.3.4',
          device: '',
        },
        {
          id: '2',
          name: 'Bruno Sem Ficha',
          cpf: '529.982.247-25',
          birth: '',
          when: '22/11/2026 14:02',
          ip: '',
          device: '',
        },
      ],
    )
    expect(rows.map((r) => r.name)).toEqual(['Ana Lima', 'Bruno Sem Ficha', 'Luís Carlos da Silva'])
    expect(rows[0].signed).toBe('')
    expect(rows[2]).toMatchObject({
      cpf: '111.444.777-35',
      signed: 'Assinado digitalmente em 22/11/2026 às 13:40',
      ip: '1.2.3.4',
    })
  })
})
