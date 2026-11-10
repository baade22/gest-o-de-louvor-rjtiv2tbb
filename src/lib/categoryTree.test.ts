import { describe, expect, it } from 'vitest'
import { treeOrder } from './categoryTree'

describe('treeOrder', () => {
  it('põe cada grupo antes das categorias de dentro, em ordem alfabética', () => {
    const rows = [
      { id: 'agua', name: 'Água', parent_id: 'fixas' },
      { id: 'fixas', name: 'Despesas fixas', parent_id: 'desp' },
      { id: 'desp', name: 'Despesas' },
      { id: 'aluguel', name: 'Aluguel', parent_id: 'fixas' },
      { id: 'tarifa', name: 'Tarifas' },
    ]
    expect(treeOrder(rows).map((r) => `${r.depth}:${r.row.id}`)).toEqual([
      '0:desp',
      '1:fixas',
      '2:agua',
      '2:aluguel',
      '0:tarifa',
    ])
  })

  it('pai que não está na lista (arquivado ou de outro tipo) leva o item ao primeiro nível', () => {
    const rows = [{ id: 'a', name: 'A', parent_id: 'sumiu' }]
    expect(treeOrder(rows)).toEqual([{ row: rows[0], depth: 0 }])
  })

  it('não trava numa volta', () => {
    const rows = [
      { id: 'a', name: 'A', parent_id: 'b' },
      { id: 'b', name: 'B', parent_id: 'a' },
    ]
    expect(
      treeOrder(rows)
        .map((r) => r.row.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})
