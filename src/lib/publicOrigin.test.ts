import { describe, expect, it } from 'vitest'
import { publicOrigin } from './publicOrigin'

describe('publicOrigin', () => {
  it('troca o preview e o endereço técnico do Skip pelo domínio oficial', () => {
    expect(publicOrigin('https://gestao-de-louvor-f51d5--preview.goskip.app')).toBe('https://gestao.ibmaldeia.com.br')
    expect(publicOrigin('https://gestao-de-louvor-f51d5.goskip.app')).toBe('https://gestao.ibmaldeia.com.br')
  })
  it('mantém domínio próprio e localhost', () => {
    expect(publicOrigin('https://gestao.ibmaldeia.com.br')).toBe('https://gestao.ibmaldeia.com.br')
    expect(publicOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })
})
