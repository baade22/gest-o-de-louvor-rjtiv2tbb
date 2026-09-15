import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  getChurchIntegrations,
  saveIntegrationCredential,
  testIntegrationConnection,
  disconnectIntegration,
} from './integrations'

vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    send: vi.fn(),
  },
}))

describe('Serviço de Integrações do LouvorFlow (Requisito 9, 10, 11, 12, 14, 18)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista integrações da igreja retornando credenciais mascaradas', async () => {
    const mockItems = [
      {
        id: 'int_1',
        church_id: 'church_123',
        provider: 'youtube',
        name: 'YouTube Data API v3',
        enabled: true,
        status: 'CONNECTED',
        has_credentials: true,
        masked_key: 'AIza••••••••••••••••abcd',
        last_tested_at: '2025-05-10T12:00:00Z',
      },
    ]

    vi.mocked(pb.send).mockResolvedValueOnce({ items: mockItems })

    const result = await getChurchIntegrations('church_123')
    expect(result).toHaveLength(1)
    expect(result[0].provider).toBe('youtube')
    expect(result[0].has_credentials).toBe(true)
    expect(result[0].masked_key).toBe('AIza••••••••••••••••abcd')
    // Chave nunca deve ser exposta integralmente
    expect(result[0].masked_key).not.toBe('AIzaSyDSECRETKEY1234abcd')

    expect(pb.send).toHaveBeenCalledWith(
      '/backend/v1/integrations?church_id=church_123',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('salva credencial da integração enviando para backend seguro', async () => {
    vi.mocked(pb.send).mockResolvedValueOnce({
      success: true,
      integration: {
        id: 'int_1',
        church_id: 'church_123',
        provider: 'youtube',
        name: 'YouTube Data API v3',
        enabled: true,
        status: 'DISCONNECTED',
        has_credentials: true,
        masked_key: 'AIza••••••••••••••••9999',
      },
    })

    const result = await saveIntegrationCredential({
      churchId: 'church_123',
      provider: 'youtube',
      name: 'YouTube Data API v3',
      apiKey: 'AIzaSyD123456789999',
    })

    expect(result.success).toBe(true)
    expect(pb.send).toHaveBeenCalledWith(
      '/backend/v1/integrations/save',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          church_id: 'church_123',
          provider: 'youtube',
          apiKey: 'AIzaSyD123456789999',
        }),
      }),
    )
  })

  it('executa teste de conexão e retorna mensagem amigável em pt-BR', async () => {
    vi.mocked(pb.send).mockResolvedValueOnce({
      success: true,
      status: 'CONNECTED',
      message: '✓ Conexão realizada com sucesso. A API do YouTube está funcionando.',
      last_tested_at: '2025-05-10 14:00:00',
    })

    const result = await testIntegrationConnection({
      churchId: 'church_123',
      provider: 'youtube',
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('CONNECTED')
    expect(result.message).toContain('✓ Conexão realizada com sucesso')
  })

  it('desconecta a integração da igreja', async () => {
    vi.mocked(pb.send).mockResolvedValueOnce({
      success: true,
      message: 'Integração desconectada com sucesso.',
    })

    const result = await disconnectIntegration({
      churchId: 'church_123',
      provider: 'youtube',
    })

    expect(result.success).toBe(true)
    expect(pb.send).toHaveBeenCalledWith(
      '/backend/v1/integrations/disconnect',
      expect.objectContaining({
        method: 'POST',
        body: { church_id: 'church_123', provider: 'youtube' },
      }),
    )
  })
})
