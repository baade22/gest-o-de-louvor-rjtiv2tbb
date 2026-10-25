import { describe, expect, it } from 'vitest'
import type { Person, PersonEvent } from '@/types'
import { buildReport, reportTitle, toCSV, type ReportOptions } from './reports'

const person = (over: Partial<Person>): Person => ({
  id: over.name || 'x',
  church_id: 'c1',
  name: 'Fulano',
  status: 'MEMBRO',
  created: '2026-02-01 10:00:00.000Z',
  updated: '',
  ...over,
})

const opts: ReportOptions = {
  congregation: 'TODAS',
  statuses: ['MEMBRO', 'CONGREGADO'],
  month: 10,
  year: 2026,
  todayYMD: '2026-10-25',
}

const people = [
  person({ id: 'a', name: 'Ana', phone: '81 9999-0000', birth_date: '1989-10-27', congregation: 'Aldeia' }),
  person({ id: 'b', name: 'Bruno', status: 'CONGREGADO', congregation: 'Diamante' }),
  person({ id: 'c', name: 'Caio', status: 'VISITANTE', phone: '81 1111-2222', created: '2026-09-10 10:00:00.000Z' }),
  person({ id: 'd', name: 'Davi', status: 'TRANSFERIDO', congregation: 'Aldeia' }),
]

const ev = (over: Partial<PersonEvent>): PersonEvent => ({
  id: 'e',
  church_id: 'c1',
  person_id: 'd',
  kind: 'SITUACAO',
  date: '2026-05-03 00:00:00.000Z',
  title: 'Transferência enviada',
  from_status: 'MEMBRO',
  to_status: 'TRANSFERIDO',
  created: '',
  updated: '',
  ...over,
})

describe('relatórios', () => {
  it('rol respeita situação e congregação', () => {
    expect(buildReport('membros', people, [], opts).rows.map((r) => r[0])).toEqual(['Ana', 'Bruno'])
    const aldeia = buildReport('membros', people, [], { ...opts, congregation: 'Aldeia' })
    expect(aldeia.rows).toHaveLength(1)
    expect(aldeia.rows[0].slice(0, 3)).toEqual(['Ana', 'Membro', 'Aldeia'])
    expect(aldeia.rows[0][7]).toBe('36')
  })

  it('contatos só com telefone ou e-mail; aniversariantes do mês', () => {
    expect(buildReport('contatos', people, [], opts).rows.map((r) => r[0])).toEqual(['Ana'])
    expect(buildReport('aniversariantes', people, [], opts).rows).toEqual([
      ['27', 'Ana', 'Aniversário', '37 anos', '81 9999-0000', 'Aldeia'],
    ])
  })

  it('movimentação mostra quem saiu mesmo fora do filtro de situação', () => {
    const rows = buildReport('movimentacao', people, [ev({}), ev({ id: 'x', date: '2025-01-01' })], opts).rows
    expect(rows).toEqual([['03/05/2026', 'Davi', 'Membro', 'Transferido', 'Transferência enviada', '']])
    expect(buildReport('movimentacao', people, [ev({})], { ...opts, congregation: 'Diamante' }).rows).toEqual([])
  })

  it('visitantes do ano e fichas incompletas', () => {
    expect(buildReport('visitantes', people, [], opts).rows.map((r) => r[1])).toEqual(['Caio'])
    expect(buildReport('incompletas', people, [], opts).rows).toEqual([
      ['Ana', 'Membro', 'batismo', '81 9999-0000'],
      ['Bruno', 'Congregado', 'nascimento, telefone', ''],
    ])
  })

  it('título com mês e ano', () => {
    expect(reportTitle('aniversariantes', opts)).toBe('Aniversariantes de outubro de 2026')
  })
})

describe('CSV', () => {
  it('usa ponto e vírgula, BOM e aspas quando precisa', () => {
    const csv = toCSV({ columns: ['Nome', 'Obs'], rows: [['Ana', 'diz "oi"; tchau'], ['Bia', 'linha\noutra']] })
    expect(csv).toBe('﻿Nome;Obs\r\nAna;"diz ""oi""; tchau"\r\nBia;"linha\noutra"')
  })
})
