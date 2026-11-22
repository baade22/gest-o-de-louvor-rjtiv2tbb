import { describe, expect, it } from 'vitest'
import { onlineVoterRows, recifeTime, votersCsv } from './onlineVoters'

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
