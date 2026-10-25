import { describe, expect, it } from 'vitest'
import { crc16, normalizePixKey, pixKeyProblem, pixPayload, pixText } from './pix'

describe('crc16', () => {
  it('confere com o valor de referência do CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1')
  })
})

describe('pixPayload', () => {
  it('gera o exemplo do manual do BR Code', () => {
    expect(
      pixPayload({
        key: '123e4567-e12b-12d1-a456-426655440000',
        name: 'Fulano de Tal',
        city: 'BRASILIA',
      }),
    ).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    )
  })

  it('leva valor, identificador e mensagem', () => {
    const p = pixPayload({
      key: '12.345.678/0001-90',
      keyType: 'CPF_CNPJ',
      name: 'Igreja Batista Central de Recife',
      city: 'São José da Coroa Grande',
      amountCents: 10050,
      txid: 'C-abc 123',
      message: 'Reforma do templo',
    })
    expect(p).toContain('011412345678000190')
    expect(p).toContain('0217Reforma do templo')
    expect(p).toContain('5406100.50')
    expect(p).toContain('5925Igreja Batista Central de')
    expect(p).toContain('6015Sao Jose da Cor')
    expect(p).toContain('62110507Cabc123')
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)))
  })
})

describe('chave PIX', () => {
  it('normaliza pelo tipo', () => {
    expect(normalizePixKey('(81) 98765-4321', 'TELEFONE')).toBe('+5581987654321')
    expect(normalizePixKey('Tesouraria@Igreja.org', 'EMAIL')).toBe('tesouraria@igreja.org')
    expect(normalizePixKey('123.456.789-01', 'CPF_CNPJ')).toBe('12345678901')
  })
  it('aponta chave inválida', () => {
    expect(pixKeyProblem('1234', 'CPF_CNPJ')).not.toBe('')
    expect(pixKeyProblem('81 98765-4321', 'TELEFONE')).toBe('')
    expect(pixKeyProblem('x@y', 'EMAIL')).not.toBe('')
  })
  it('tira acentos', () => {
    expect(pixText('Missões & Ação', 25)).toBe('Missoes Acao')
  })
})
