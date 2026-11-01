import { describe, expect, it } from 'vitest'
import { eklesiaMark, importedCodes, matchByName, parseEklesiaCsv } from './eklesiaImport'

const tail = 'Eklesia.Domain.Relatorios.Dtos.DadosExportacaoContabil;;'
const csv = [
  '﻿',
  `20260104;20260104;0;DÍZIMOS;1;CAIXA EM ESPECIE ALDEIA;0;ADMINISTRAÇÃO GERAL; ;48.00;5239;5103;R;C;;08489105000168;ANÔNIMO;${tail}`,
  `20260504;20260601;0;CAIXA EM ESPECIE ALDEIA;1;13˚ SALÁRIO;0;ADMINISTRAÇÃO GERAL;parcela;1250.50;5300;5200;P;D;123.456.789-00;08489105000168;FULANO DE TAL;${tail}`,
  'lixo;sem;formato',
].join('\r\n')

describe('parseEklesiaCsv', () => {
  it('lê receitas e pagamentos com conta e categoria no lugar certo', () => {
    const { rows, errors } = parseEklesiaCsv(csv)
    expect(errors).toEqual([{ line: 4, reason: 'Linha fora do formato do Eklesia' }])
    expect(rows[0]).toMatchObject({
      code: '5239',
      type: 'ENTRADA',
      date: '2026-01-04',
      amount_cents: 4800,
      account: 'CAIXA EM ESPECIE ALDEIA',
      category: 'DÍZIMOS',
      description: '',
      personName: '',
    })
    expect(rows[1]).toMatchObject({
      code: '5300',
      type: 'SAIDA',
      date: '2026-06-01', // data de pagamento
      amount_cents: 125050,
      account: 'CAIXA EM ESPECIE ALDEIA',
      category: '13˚ SALÁRIO',
      description: 'parcela',
      personName: 'FULANO DE TAL',
      personDocument: '12345678900',
    })
  })

  it('reconhece o que já foi importado pela marca nas observações', () => {
    const codes = importedCodes([eklesiaMark('5239'), 'outra coisa', undefined])
    expect(codes.has('5239')).toBe(true)
    expect(codes.has('5300')).toBe(false)
  })

  it('liga nomes sem ligar para acento e caixa', () => {
    const items = [
      { id: 'a', name: 'Dízimos' },
      { id: 'b', name: '13º salário' },
      { id: 'c', name: 'Caixa' },
    ]
    expect(matchByName('DÍZIMOS', items)?.id).toBe('a')
    expect(matchByName('13˚ SALÁRIO', items)?.id).toBe('b')
    expect(matchByName('CAIXA EM ESPECIE ALDEIA', items)?.id).toBe('c')
    expect(matchByName('ÁGUA/ESGOTO', items)).toBeUndefined()
    expect(matchByName('ÁGUA/ESGOTO', [{ id: 'd', name: 'Água e esgoto' }])?.id).toBe('d')
  })
})
