import { describe, it, expect } from 'vitest'
import { decodeOfx, ofxAmountToCents, ofxDate, parseOfx } from './ofx'
import { personInDescription, suggestMatches } from './reconcile'

// Fuso como os bancos mandam; montado em partes para o Tailwind não ler como classe
const TZ = '[' + '-3:BRT]'

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0237<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261001120000${TZ}
<DTEND>20261015120000${TZ}
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261012120000${TZ}
<TRNAMT>850.00
<FITID>202610120001
<MEMO>PIX RECEBIDO JOAO S MENDES
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261013
<TRNAMT>-12,90
<FITID>202610130002
<NAME>TARIFA
<MEMO>TARIFA BANCARIA PACOTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261014
<TRNAMT>-5.00
<MEMO>SAQUE &amp; OUTROS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261014
<TRNAMT>-5.00
<MEMO>SAQUE &amp; OUTROS
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1234.56<DTASOF>20261015</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const XML = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261002</DTPOSTED><TRNAMT>100.5</TRNAMT><FITID>A1</FITID><NAME>Oferta</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

describe('extrato OFX', () => {
  it('lê o formato SGML dos bancos', () => {
    const st = parseOfx(SGML)
    expect(st.bankId).toBe('0237')
    expect(st.accountNumber).toBe('12345-6')
    expect(st.startDate).toBe('2026-10-01')
    expect(st.endDate).toBe('2026-10-15')
    expect(st.balanceCents).toBe(123456)
    expect(st.balanceDate).toBe('2026-10-15')
    expect(st.lines).toHaveLength(4)
    expect(st.lines[0]).toEqual({
      fitid: '202610120001',
      date: '2026-10-12',
      amount_cents: 85000,
      description: 'PIX RECEBIDO JOAO S MENDES',
    })
    expect(st.lines[1].amount_cents).toBe(-1290)
    expect(st.lines[1].description).toBe('TARIFA · TARIFA BANCARIA PACOTE')
    // Sem FITID, dois saques iguais no mesmo dia continuam sendo dois movimentos
    expect(st.lines[2].description).toBe('SAQUE & OUTROS')
    expect(st.lines[2].fitid).not.toBe(st.lines[3].fitid)
  })

  it('lê o formato XML', () => {
    const st = parseOfx(XML)
    expect(st.lines).toEqual([
      { fitid: 'A1', date: '2026-10-02', amount_cents: 10050, description: 'Oferta' },
    ])
    expect(st.balanceCents).toBeNull()
  })

  it('recusa arquivo que não é OFX', () => {
    expect(() => parseOfx('data;valor\n')).toThrow()
  })

  it('converte datas, valores e acentos de arquivos 1252', () => {
    expect(ofxDate(`20260131235959${TZ}`)).toBe('2026-01-31')
    expect(ofxAmountToCents('-1.234,56')).toBe(-123456)
    expect(ofxAmountToCents('+50')).toBe(5000)
    expect(ofxAmountToCents('')).toBeNull()
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('CHARSET:1252\n<OFX>CORA'),
      0xc7,
      0xc3,
      0x4f,
    ])
    expect(decodeOfx(bytes.buffer)).toContain('CORAÇÃO')
    const latin = new Uint8Array([...new TextEncoder().encode('<OFX>JO'), 0xc3, 0x4f])
    expect(decodeOfx(latin.buffer)).toContain('JOÃO')
  })
})

describe('sugestões da conciliação', () => {
  const people = [
    { id: 'p1', name: 'João Mendes' },
    { id: 'p2', name: 'Maria da Silva' },
    { id: 'p3', name: 'Ana Souza', is_active: false },
  ]

  it('acha a pessoa pelo primeiro e último nome', () => {
    expect(personInDescription('PIX RECEBIDO JOAO S MENDES', people)?.id).toBe('p1')
    expect(personInDescription('PIX MARIA SILVA', people)?.id).toBe('p2')
    expect(personInDescription('PIX ANA SOUZA', people)).toBeUndefined()
    expect(personInDescription('PIX JOAO', people)).toBeUndefined()
  })

  it('sugere lançamento, conta e pessoa sem repetir', () => {
    const lines = [
      {
        id: 'l1',
        account_id: 'bb',
        date: '2026-10-12',
        amount_cents: 85000,
        description: 'PIX JOAO MENDES',
      },
      { id: 'l2', account_id: 'bb', date: '2026-10-13', amount_cents: 85000, description: 'PIX' },
      {
        id: 'l3',
        account_id: 'bb',
        date: '2026-10-14',
        amount_cents: -45000,
        description: 'BOLETO',
      },
      { id: 'l4', account_id: 'bb', date: '2026-10-15', amount_cents: -30000, description: 'TED' },
    ]
    const tx = (d: Record<string, unknown>) => ({
      status: 'CONFIRMADO',
      account_id: 'bb',
      date: '2026-10-12 12:00:00.000Z',
      ...d,
    })
    const txs = [
      tx({ id: 't1', type: 'ENTRADA', amount_cents: 85000, date: '2026-10-11 12:00:00.000Z' }),
      tx({ id: 't2', type: 'ENTRADA', amount_cents: 85000, account_id: 'caixa' }),
      tx({ id: 't3', type: 'SAIDA', amount_cents: 45000, bank_line_id: 'x' }),
      tx({
        id: 't4',
        type: 'TRANSFERENCIA',
        amount_cents: 30000,
        to_account_id: 'caixa',
        date: '2026-10-16',
      }),
      tx({ id: 't5', type: 'SAIDA', amount_cents: 30000, status: 'ESTORNADO', date: '2026-10-15' }),
    ] as {
      id: string
      type: string
      status: string
      account_id: string
      to_account_id?: string
      amount_cents: number
      date: string
      bank_line_id?: string
    }[]
    const bills = [
      { id: 'b1', kind: 'PAGAR', status: 'ABERTO', amount_cents: 45000, due_date: '2026-10-20' },
      { id: 'b2', kind: 'PAGAR', status: 'ABERTO', amount_cents: 45000, due_date: '2026-11-20' },
    ]
    const s = suggestMatches(lines, txs, bills, people)
    expect(s.get('l1')?.tx?.id).toBe('t1')
    expect(s.get('l1')?.person?.id).toBe('p1')
    // t1 já foi usado e t2 é de outra conta
    expect(s.get('l2')?.tx).toBeUndefined()
    // t3 já está conciliado: sugere a conta a pagar que vence perto
    expect(s.get('l3')).toEqual({ bill: bills[0] })
    expect(s.get('l4')?.tx?.id).toBe('t4')
  })
})
