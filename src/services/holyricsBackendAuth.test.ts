import { describe, it, expect } from 'vitest'

// Simulação da lógica de verificação de permissão e regras de negócio
// implementada em pocketbase/hooks/saas_holyrics_sync_media_playlist.js
// e pocketbase/hooks/saas_holyrics_transfer_media.js
function authorizeMediaOperation(params: {
  member: {
    is_active: boolean
    role: string
    operational_roles: string[]
  } | null
}) {
  if (!params.member || !params.member.is_active) {
    return {
      allowed: false,
      status: 403,
      error_code: 'FORBIDDEN_MEMBER',
      message: 'Você não tem permissão ativa nesta congregação.',
    }
  }

  const role = params.member.role || ''
  const isMaster = role === 'MASTER'
  const isAdmin = role === 'ADMIN' || isMaster
  const hasProjection = params.member.operational_roles.includes('PROJECAO')

  if (!isAdmin && !hasProjection) {
    return {
      allowed: false,
      status: 403,
      error_code: 'FORBIDDEN_PROJECTION_ROLE',
      message:
        'Apenas Administradores ou membros com a função de PROJEÇÃO podem realizar operações de mídias.',
    }
  }

  return { allowed: true }
}

function validateBackendMediaExtension(mediaType: string, fileName: string) {
  const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/)
  const ext = extMatch ? extMatch[1].toLowerCase() : ''
  const allowedMap: Record<string, string[]> = {
    IMAGEM: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
    VIDEO: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'],
    AUDIO: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'flac'],
    DOCUMENTO: ['pdf', 'pptx', 'ppt', 'ppsx', 'pps'],
  }
  const allowed = allowedMap[mediaType.toUpperCase()]
  if (!allowed) return { valid: true }

  if (!allowed.includes(ext)) {
    return {
      valid: false,
      error_code: 'INVALID_FILE_EXTENSION',
      message: `Extensão .${ext} incompatível com o tipo ${mediaType}. Extensões permitidas: ${allowed.join(', ')}.`,
    }
  }
  return { valid: true }
}

function filterPlaylistMedia(mediaRecords: Array<{ id: string; name: string; status: string }>) {
  const ready = mediaRecords.filter(
    (m) => m.status === 'BAIXADA' || m.status === 'IMPORTADA_HOLYRICS',
  )
  const pending = mediaRecords.filter(
    (m) => m.status !== 'BAIXADA' && m.status !== 'IMPORTADA_HOLYRICS',
  )
  return { ready, pending }
}

describe('Testes de Autorização Backend P1 e Regras de Negócio de Mídias', () => {
  it('P1.1: Membro sem vínculo ativo (is_active = false) é rejeitado com 403 FORBIDDEN_MEMBER', () => {
    const res = authorizeMediaOperation({
      member: {
        is_active: false,
        role: 'ADMIN',
        operational_roles: ['PROJECAO'],
      },
    })
    expect(res.allowed).toBe(false)
    expect(res.status).toBe(403)
    expect(res.error_code).toBe('FORBIDDEN_MEMBER')
  })

  it('P1.2: Membro sem cadastro (null) é rejeitado com 403 FORBIDDEN_MEMBER', () => {
    const res = authorizeMediaOperation({ member: null })
    expect(res.allowed).toBe(false)
    expect(res.status).toBe(403)
    expect(res.error_code).toBe('FORBIDDEN_MEMBER')
  })

  it('P1.3: Membro ativo comum sem PROJECAO (ex: MUSICO) é rejeitado com 403 FORBIDDEN_PROJECTION_ROLE', () => {
    const res = authorizeMediaOperation({
      member: {
        is_active: true,
        role: 'MEMBER',
        operational_roles: ['MUSICO'],
      },
    })
    expect(res.allowed).toBe(false)
    expect(res.status).toBe(403)
    expect(res.error_code).toBe('FORBIDDEN_PROJECTION_ROLE')
  })

  it('P1.4: Membro ativo com função PROJECAO é autorizado', () => {
    const res = authorizeMediaOperation({
      member: {
        is_active: true,
        role: 'MEMBER',
        operational_roles: ['PROJECAO'],
      },
    })
    expect(res.allowed).toBe(true)
  })

  it('P1.5: Administrador (ADMIN) ativo é autorizado mesmo sem PROJECAO no array', () => {
    const res = authorizeMediaOperation({
      member: {
        is_active: true,
        role: 'ADMIN',
        operational_roles: [],
      },
    })
    expect(res.allowed).toBe(true)
  })

  it('P1.6: MASTER ativo é autorizado', () => {
    const res = authorizeMediaOperation({
      member: {
        is_active: true,
        role: 'MASTER',
        operational_roles: [],
      },
    })
    expect(res.allowed).toBe(true)
  })

  // Backend Validação Extensão × Tipo
  it('P2.4: Validação backend rejeita .mp4 marcado como AUDIO', () => {
    const res = validateBackendMediaExtension('AUDIO', 'video_falso.mp4')
    expect(res.valid).toBe(false)
    expect(res.error_code).toBe('INVALID_FILE_EXTENSION')
  })

  it('P2.5: Validação backend aceita .mp3 marcado como AUDIO', () => {
    const res = validateBackendMediaExtension('AUDIO', 'trilha.mp3')
    expect(res.valid).toBe(true)
  })

  it('P2.6: Validação backend aceita .mp4 marcado como VIDEO', () => {
    const res = validateBackendMediaExtension('VIDEO', 'abertura.mp4')
    expect(res.valid).toBe(true)
  })

  // Backend Filtro de Mídias para Playlist
  it('P3.3: Filtra mídias para playlist: apenas BAIXADA ou IMPORTADA_HOLYRICS entram na playlist', () => {
    const medias = [
      { id: '1', name: 'Avisos.mp4', status: 'BAIXADA' },
      { id: '2', name: 'Ofertas.png', status: 'IMPORTADA_HOLYRICS' },
      { id: '3', name: 'Abertura.mp4', status: 'ENVIADA' },
    ]
    const { ready, pending } = filterPlaylistMedia(medias)
    expect(ready.length).toBe(2)
    expect(pending.length).toBe(1)
    expect(pending[0].name).toBe('Abertura.mp4')
  })
})
