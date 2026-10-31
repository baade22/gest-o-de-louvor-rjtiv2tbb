// Roda junto com os testes do site (vitest)
import { expect, test } from 'vitest'
import {
  backfill,
  splitPeriod,
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
  expect(brlToCents(6759)).toBe(675900)
  expect(brlToCents(1.15)).toBe(115)
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
  // em produção o código vem como número
  expect(
    bradescoError({
      extratoPorPeriodo: { codigoRetorno: 0, mensagem: 'CTAS0673 - CONSULTA EFETUADA COM SUCESSO' },
    }),
  ).toBe(null)
  expect(bradescoError({ saldoCC: { codigoRetorno: 1 } })).toBe(null)
  expect(
    bradescoError({ saldoCC: { codigoRetorno: '12', mensagem: 'SISTEMA INDISPONIVEL' } }),
  ).toBe('12 SISTEMA INDISPONIVEL')
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
  expect(bradescoBalance(json)).toEqual({
    balance_cents: 7795,
    available_cents: 7795,
    invested_cents: null,
  })
  expect(
    bradescoBalance({
      saldoCC: {
        lstLancamentosSaldos: [{ codigoProduto: 984, valorLancamento: '10,00', sinalSaldo: '-' }],
      },
    }),
  ).toEqual({ balance_cents: -1000, available_cents: -1000, invested_cents: null })

  // Invest Fácil é caixa: soma na conta-corrente; outra aplicação fica à parte
  const cc = (total, checking) => ({
    codigoRetorno: 0,
    lstLancamentosSaldos: [
      { codigoProduto: 998, valorLancamento: checking, sinalSaldo: '+' },
      { codigoProduto: 977, valorLancamento: '', sinalSaldo: '' },
      { codigoProduto: 984, valorLancamento: total, sinalSaldo: '+' },
    ],
  })
  expect(
    bradescoBalance({
      saldoCC: cc('2.327,95', '1.077,95'),
      saldoAplicacaoCC: {
        codigoRetorno: 0,
        lstLancamentosSaldos: [
          {
            nomeProduto: 'INVEST FACIL BRADESCO',
            codigoProduto: 19,
            valorLancamento: '250,00',
            sinalSaldo: '+',
          },
          {
            nomeProduto: 'CDB-FACIL CDI',
            codigoProduto: 1,
            valorLancamento: '1.000,00',
            sinalSaldo: '+',
          },
          { codigoProduto: 977, valorLancamento: '', sinalSaldo: '' },
        ],
      },
    }),
  ).toEqual({ balance_cents: 132795, available_cents: 132795, invested_cents: 100000 })
  // Só Invest Fácil: tudo é saldo da conta
  expect(
    bradescoBalance({
      saldoCC: cc('1.327,95', '1.077,95'),
      saldoAplicacaoCC: {
        lstLancamentosSaldos: [
          {
            nomeProduto: 'INVEST FACIL BRADESCO',
            codigoProduto: 19,
            valorLancamento: '250,00',
            sinalSaldo: '+',
          },
        ],
      },
    }),
  ).toEqual({ balance_cents: 132795, available_cents: 132795, invested_cents: null })
  // Sem a lista das aplicações: vale o total
  expect(bradescoBalance({ saldoCC: cc('1.327,95', '1.077,95') })).toEqual({
    balance_cents: 132795,
    available_cents: 132795,
    invested_cents: null,
  })
})

const fakeBank = (oldest, fail = {}) => ({
  calls: [],
  async statement(from, to) {
    this.calls.push([from, to])
    if (fail[from]) {
      const f = fail[from].shift()
      if (f) throw Object.assign(new Error('falhou'), { status: f })
    }
    return to < oldest ? [] : [{ id: from, date: to, amount_cents: 100, description: 'x' }]
  },
})
const noWait = { log: () => {}, wait: async () => {} }

test('histórico até a data pedida, em partes de 3 meses, do mais novo para o mais antigo', async () => {
  const bank = fakeBank('2000-01-01')
  const pushes = []
  const res = await backfill(
    { id: 'c1', history: { from: '2026-01-01', before: '2026-10-01' } },
    bank,
    async (b) => pushes.push(b),
    noWait,
  )
  expect(res.done).toBe(true)
  expect(bank.calls[0]).toEqual(['2026-07-01', '2026-09-30'])
  expect(bank.calls.at(-1)[0]).toBe('2026-01-01')
  expect(pushes.at(-1)).toMatchObject({
    history: true,
    history_done: true,
    start_date: '2026-01-01',
  })
  expect(pushes.slice(0, -1).every((p) => p.history_done === false)).toBe(true)
})

test('o máximo para depois de um ano sem movimentos', async () => {
  const bank = fakeBank('2024-03-01')
  const pushes = []
  const res = await backfill(
    { id: 'c1', history: { from: '', before: '2026-10-01' } },
    bank,
    async (b) => pushes.push(b),
    noWait,
  )
  expect(res.done).toBe(true)
  const empties = pushes.filter((p) => p.lines.length === 0)
  expect(empties).toHaveLength(4)
  expect(pushes.at(-1).history_done).toBe(true)
})

test('período recusado pelo banco encerra; instabilidade tenta de novo', async () => {
  const pushes = []
  const refused = fakeBank('2000-01-01', { '2026-07-01': [400] })
  let res = await backfill(
    { id: 'c1', history: { from: '', before: '2026-10-01' } },
    refused,
    async (b) => pushes.push(b),
    noWait,
  )
  expect(res.done).toBe(true)
  expect(pushes).toEqual([
    { connection_id: 'c1', ok: true, history: true, history_done: true, lines: [] },
  ])

  const flaky = fakeBank('2000-01-01', { '2026-07-01': [503] })
  res = await backfill(
    { id: 'c1', history: { from: '2026-07-01', before: '2026-10-01' } },
    flaky,
    async () => {},
    noWait,
  )
  expect(res.done).toBe(true)
  expect(flaky.calls).toHaveLength(2)

  const down = fakeBank('2000-01-01', { '2026-07-01': [503, 503] })
  res = await backfill(
    { id: 'c1', history: { from: '2026-01-01', before: '2026-10-01' } },
    down,
    async () => {},
    noWait,
  )
  expect(res.done).toBe(false)
})

test('período longo vira partes de até 31 dias, sem parte de um dia só', () => {
  const parts = splitPeriod('2025-11-02', '2026-10-28', 31)
  expect(parts[0]).toEqual(['2025-11-02', '2025-12-02'])
  expect(parts.at(-1)[1]).toBe('2026-10-28')
  expect(parts.every(([a, b]) => a < b)).toBe(true)
  for (let i = 1; i < parts.length; i++) expect(parts[i][0] > parts[i - 1][1]).toBe(true)
  expect(splitPeriod('2026-10-01', '2026-11-01', 31)).toEqual([['2026-10-01', '2026-11-01']])
  expect(splitPeriod('2026-10-28', '2026-10-28', 31)).toEqual([['2026-10-28', '2026-10-29']])
})
