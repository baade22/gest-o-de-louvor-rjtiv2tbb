import pb from '@/lib/pocketbase/client'
import type { IntegrationItem, TestIntegrationResult } from '@/types'

/**
 * Lista as integrações da igreja logada com credenciais mascaradas.
 * Apenas ADMIN pode chamar este endpoint.
 */
export async function getChurchIntegrations(churchId: string): Promise<IntegrationItem[]> {
  if (!churchId) return []

  const response = await pb.send<{ items: IntegrationItem[] }>(
    `/backend/v1/integrations?church_id=${encodeURIComponent(churchId)}`,
    {
      method: 'GET',
    },
  )

  return response.items || []
}

/**
 * Salva ou atualiza a API Key / credencial de um provedor de forma segura.
 * A chave inteira só é enviada no salvamento e NUNCA é retornada inteira de volta.
 */
export async function saveIntegrationCredential(params: {
  churchId: string
  provider: string
  name: string
  apiKey: string
  configuration?: Record<string, unknown>
}): Promise<{ success: boolean; integration: IntegrationItem }> {
  const response = await pb.send<{ success: boolean; integration: IntegrationItem }>(
    '/backend/v1/integrations/save',
    {
      method: 'POST',
      body: {
        church_id: params.churchId,
        provider: params.provider,
        name: params.name,
        apiKey: params.apiKey,
        configuration: params.configuration || {},
      },
    },
  )

  return response
}

/**
 * Realiza teste real da credencial contra o provedor externo (ex: YouTube Data API v3).
 */
export async function testIntegrationConnection(params: {
  churchId: string
  provider: string
  apiKey?: string
}): Promise<TestIntegrationResult> {
  const response = await pb.send<TestIntegrationResult>('/backend/v1/integrations/test', {
    method: 'POST',
    body: {
      church_id: params.churchId,
      provider: params.provider,
      apiKey: params.apiKey,
    },
  })

  return response
}

/**
 * Desconecta / limpa credenciais da integração para a igreja.
 */
export async function disconnectIntegration(params: {
  churchId: string
  provider: string
}): Promise<{ success: boolean; message: string }> {
  const response = await pb.send<{ success: boolean; message: string }>(
    '/backend/v1/integrations/disconnect',
    {
      method: 'POST',
      body: {
        church_id: params.churchId,
        provider: params.provider,
      },
    },
  )

  return response
}
