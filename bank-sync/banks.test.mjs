// Roda junto com os testes do site (vitest)
import { expect, test } from 'vitest'
import {
  bradescoBalance,
  bradescoError,
  bradescoLines,
  brlToCents,
  brtDate,
  coraLines,
  ddmmyyyy,
} from './banks.mjs'

test('formatos de data e valor', () => {
  expect(ddmmyyyy('2024-11-06')).toBe('06112024')
  expect(brlToCents('6.759,00')).toBe(675900)
  expect(brlToCents('1,15')).toBe(115)
  expect(brlToCents('')).toBe(null)
  expect(brtDate('2023-04-06T09:00:00+00')).toBe('2023-04-06')
  // 1h da manhã em UTC ainda é o dia anterior em Brasília
  expect(brtDate('2023-04-06T01:00:00Z')).toBe('2023-04-05')
})

test('extrato da Cora (exemplo da documentação)', () => {
  const lines = coraLines([
    {
      id: 'ent_AilRQw91CRTqNucwvoeiMwg',
      type: 'DEBIT',
      amount: 1500,
      createdAt: '2023-04-06T09:00:00+00',
      transaction: {
        id: 'trx_ucn77rFISfOlFcTy48GSFA',
        type: 'TRANSFER',
        description: 'Teste',
        counterParty: { name: 'Test Account Company Name', identity: '98537607000165' },
      },
    },
    {
      id: 'ent_2',
      type: 'CREDIT',
      amount: 5000,
      createdAt: '2023-04-07T15:00:00Z',
      transaction: { type: 'PIX', counterParty: { name: 'JOAO MENDES' } },
    },
    { id: 'ent_3', type: 'BLOCK', amount: 900, createdAt: '2023-04-07T15:00:00Z' },
    {
      id: 'ent_4',
      type: 'CREDIT',
      amount: 300,
      createdAt: '2023-04-07T15:00:00Z',
      transaction: { type: 'NOVO_TIPO' },
    },
  ])
  expect(lines).toEqual([
    {
      id: 'ent_AilRQw91CRTqNucwvoeiMwg',
      date: '2023-04-06',
      amount_cents: -1500,
      description: 'Teste · Test Account Company Name',
    },
    { id: 'ent_2', date: '2023-04-07', amount_cents: 5000, description: 'Pix · JOAO MENDES' },
    { id: 'ent_4', date: '2023-04-07', amount_cents: 300, description: 'NOVO_TIPO' },
  ])
})

const mov = (d) => ({
  sinalSaldo: '+',
  segundaLinhalLancamento: '',
  sinalLancamento: '+',
  identificacaoSubCodigo: 'N',
  codigoLancamento: '03205',
  descritivoLancamentoAbreviado: 'TRANSFE PIX',
  descritivoLancamentoCompleto: 'TRANSFERENCIA PIX',
  numeroDocumento: '0000001',
  ...d,
})

test('extrato do Bradesco junta as listas sem repetir', () => {
  const json = {
    extratoUltimosLancamentos: {
      codigoRetorno: '00',
      listaLancamentos: {
        'Saldo Anterior': [
          {
            sinalSaldo: '+',
            valorLancamento: '0,00',
            valorSaldoAposLancamento: '6.759,00',
            dataLancamento: '10/12/2024',
          },
        ],
        'Ultimos Lancamentos': [
          mov({
            valorLancamento: '1,15',
            codigoLancamento: '03584',
            descritivoLancamentoCompleto: 'RENTAB.INVEST FACILCRED*',
            dataLancamento: '17/01/2025',
          }),
          mov({ valorLancamento: '700,00', sinalLancamento: '-', dataLancamento: '20/01/2025' }),
        ],
        'Lancamentos Dia': [
          mov({
            valorLancamento: '15,00',
            segundaLinhalLancamento: 'REM: EMPRESA PAGADOR         22/01',
            numeroDocumento: '0936269',
            dataLancamento: '22/01/2025',
          }),
          mov({
            valorLancamento: '15,00',
            segundaLinhalLancamento: 'REM: EMPRESA PAGADOR         22/01',
            numeroDocumento: '0936269',
            dataLancamento: '22/01/2025',
          }),
        ],
      },
    },
    extratoLancamentosFuturos: {
      listaLancamentos: {
        'Lancamentos Futuros': [mov({ valorLancamento: '99,00', dataLancamento: '30/01/2025' })],
      },
    },
    extratoPorPeriodo: {
      codigoRetorno: '00',
      lstLancamentoMensal: [
        mov({
          valorLancamento: '0,00',
          codigoLancamento: '00000',
          descritivoLancamentoCompleto: 'Saldo Anterior',
          dataLancamento: '30/09/2024',
        }),
        // o mesmo débito de 20/01 que já veio nos últimos lançamentos
        mov({ valorLancamento: '700,00', sinalLancamento: '-', dataLancamento: '20/01/2025' }),
      ],
    },
  }
  const lines = bradescoLines(json)
  expect(lines.length).toBe(4)
  expect(lines[0]).toEqual({
    id: '2025-01-17|0000001|03584|115|1',
    date: '2025-01-17',
    amount_cents: 115,
    description: 'RENTAB.INVEST FACILCRED',
  })
  expect(lines[1].amount_cents).toBe(-70000)
  expect(lines[2].description).toBe('TRANSFERENCIA PIX · REM: EMPRESA PAGADOR         22/01')
  // dois Pix iguais no mesmo dia continuam sendo dois movimentos
  expect(lines[2].id).not.toBe(lines[3].id)
  expect(bradescoError(json)).toBe(null)
  expect(
    bradescoError({ extratoPorPeriodo: { codigoRetorno: '08', mensagem: 'ERRO NEGOCIO ' } }),
  ).toBe('08 ERRO NEGOCIO')
})

test('saldo do Bradesco', () => {
  const json = {
    saldoCC: {
      codigoRetorno: '00',
      lstLancamentosSaldos: [
        {
          nomeProduto: 'DISPONIVEL:',
          codigoProduto: 999,
          valorLancamento: '0,00',
          sinalSaldo: '+',
        },
        { nomeProduto: 'LINHA EM BRANCO', codigoProduto: 977, valorLancamento: '', sinalSaldo: '' },
        {
          nomeProduto: 'SALDO TOTAL',
          codigoProduto: 984,
          valorLancamento: '77,95',
          sinalSaldo: '+',
        },
      ],
    },
  }
  expect(bradescoBalance(json)).toEqual({ balance_cents: 7795, available_cents: 0 })
  expect(
    bradescoBalance({
      saldoCC: {
        lstLancamentosSaldos: [{ codigoProduto: 984, valorLancamento: '10,00', sinalSaldo: '-' }],
      },
    }),
  ).toEqual({ balance_cents: -1000, available_cents: -1000 })
})
