import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  familyLine,
  firstName,
  formatCpfInput,
  formatPhoneInput,
  initials,
  isMemberOnlyAccount,
  isValidCpf,
  isValidPhone,
  missingLabel,
  untilLabel,
} from './memberArea'

describe('área do membro', () => {
  it('reconhece a conta criada pelo código do WhatsApp', () => {
    expect(isMemberOnlyAccount('mabc123@membros.invalid')).toBe(true)
    expect(isMemberOnlyAccount('MABC@MEMBROS.INVALID')).toBe(true)
    expect(isMemberOnlyAccount('pedro@gmail.com')).toBe(false)
    expect(isMemberOnlyAccount('')).toBe(false)
  })

  it('confere e formata o celular', () => {
    expect(isValidPhone('(81) 99876-5432')).toBe(true)
    expect(isValidPhone('+55 81 9876-5432')).toBe(true)
    expect(isValidPhone('99876-5432')).toBe(false)
    expect(formatPhoneInput('81998765432')).toBe('(81) 99876-5432')
    expect(formatPhoneInput('8198765432')).toBe('(81) 9876-5432')
    expect(formatPhoneInput('5581998765432')).toBe('(81) 99876-5432')
    expect(formatPhoneInput('81')).toBe('(81')
    expect(formatPhoneInput('')).toBe('')
  })

  it('valida e formata o CPF', () => {
    expect(isValidCpf('123.456.789-09')).toBe(true)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('123.456.789-00')).toBe(false)
    expect(formatCpfInput('12345678909')).toBe('123.456.789-09')
    expect(formatCpfInput('1234')).toBe('123.4')
  })

  it('monta nome, iniciais e família', () => {
    expect(firstName('Pedro Baade')).toBe('Pedro')
    expect(initials('Pedro de Souza Baade')).toBe('PB')
    expect(initials('Ana')).toBe('A')
    expect(familyLine({ kind: 'CONJUGE', gender: 'F', status: 'MEMBRO', age: 34 })).toBe(
      'Esposa · Membro',
    )
    expect(familyLine({ kind: 'FILHO', gender: 'M', status: 'CONGREGADO', age: 9 })).toBe(
      'Filho · Congregado · 9 anos',
    )
  })

  it('conta os dias até o evento', () => {
    expect(daysUntil('2026-12-06', '2026-11-28')).toBe(8)
    expect(untilLabel(8)).toBe('faltam 8 dias')
    expect(untilLabel(1)).toBe('amanhã')
    expect(untilLabel(0)).toBe('hoje')
  })

  it('diz o que falta no cadastro', () => {
    expect(missingLabel([])).toBe('')
    expect(missingLabel(['CPF'])).toBe('Falta CPF')
    expect(missingLabel(['CPF', 'endereço', 'cidade'])).toBe('Faltam CPF, endereço e cidade')
    expect(missingLabel(['CPF', 'endereço', 'cidade', 'bairro', 'CEP'])).toBe(
      'Faltam CPF, endereço, cidade e mais 2',
    )
  })
})
