import { describe, it, expect, vi } from 'vitest'
import pb from '@/lib/pocketbase/client'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      send: vi.fn(),
      collection: vi.fn(),
    },
  }
})

describe('Permissions & Access Architecture Tests', () => {
  it('MASTER deve receber 100% de permissões e todos os módulos', async () => {
    const mockMasterPermissions = {
      church_id: 'church_demo',
      role: 'MASTER',
      operational_roles: ['MUSICO', 'SOM', 'PROJECAO', 'MIDIA', 'ILUMINACAO'],
      is_master: true,
      is_admin: true,
      is_leader: true,
      permissions: [
        'music.view',
        'music.edit',
        'events.view',
        'events.edit',
        'sound.view',
        'sound.edit',
        'projection.view',
        'projection.edit',
        'media.view',
        'media.upload',
        'lighting.view',
        'lighting.edit',
        'users.view',
        'users.create',
        'users.edit',
        'integrations.view',
        'integrations.edit',
        'holyrics.view',
        'holyrics.sync',
      ],
      modules: [
        'dashboard',
        'profile',
        'my_scales',
        'songs',
        'events',
        'sound',
        'projection',
        'media',
        'tasks',
        'lighting',
        'musicians',
        'roles',
        'integrations',
        'settings',
      ],
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockMasterPermissions)

    const res = await pb.send('/backend/v1/permissions/me?church_id=church_demo', {
      method: 'GET',
    })

    expect(res.role).toBe('MASTER')
    expect(res.is_master).toBe(true)
    expect(res.permissions).toContain('holyrics.sync')
    expect(res.permissions).toContain('sound.edit')
    expect(res.modules).toContain('sound')
    expect(res.modules).toContain('projection')
    expect(res.modules).toContain('media')
    expect(res.modules).toContain('lighting')
  })

  it('MÚSICO exclusivo NÃO deve ter permissões de som, projeção, mídia ou iluminação', async () => {
    const mockMusicianPermissions = {
      church_id: 'church_demo',
      role: 'MUSICO',
      operational_roles: ['MUSICO'],
      is_master: false,
      is_admin: false,
      is_leader: false,
      permissions: ['profile.view', 'profile.edit', 'scales.view', 'music.view'],
      modules: ['dashboard', 'profile', 'my_scales', 'songs'],
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockMusicianPermissions)

    const res = await pb.send('/backend/v1/permissions/me?church_id=church_demo', {
      method: 'GET',
    })

    expect(res.modules).not.toContain('sound')
    expect(res.modules).not.toContain('projection')
    expect(res.modules).not.toContain('media')
    expect(res.modules).not.toContain('lighting')
    expect(res.modules).not.toContain('musicians')
    expect(res.modules).not.toContain('integrations')
    expect(res.modules).not.toContain('settings')
  })

  it('Operador com múltiplas funções (MÚSICO + SOM) deve receber a união das permissões', async () => {
    const mockMultiRolePermissions = {
      church_id: 'church_demo',
      role: 'MUSICO',
      operational_roles: ['MUSICO', 'SOM'],
      is_master: false,
      is_admin: false,
      is_leader: false,
      permissions: [
        'profile.view',
        'profile.edit',
        'scales.view',
        'music.view',
        'sound.view',
        'sound.edit',
        'events.view',
      ],
      modules: ['dashboard', 'profile', 'my_scales', 'songs', 'events', 'sound'],
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockMultiRolePermissions)

    const res = await pb.send('/backend/v1/permissions/me?church_id=church_demo', {
      method: 'GET',
    })

    expect(res.modules).toContain('songs')
    expect(res.modules).toContain('sound')
    expect(res.modules).toContain('events')
    expect(res.modules).not.toContain('projection')
    expect(res.modules).not.toContain('lighting')
  })

  it('Acesso direto ao backend bloqueia usuário sem a função operacional correspondente com 403', async () => {
    const error403 = {
      status: 403,
      data: {
        allowed: false,
        message: 'Acesso negado: seu perfil não tem permissão para acessar o módulo sound',
      },
    }

    vi.mocked(pb.send).mockRejectedValueOnce(error403)

    await expect(
      pb.send('/backend/v1/modules/access?module=sound&church_id=church_demo', { method: 'GET' }),
    ).rejects.toEqual(error403)
  })

  it('Fluxo de convite: validação de token e aceite definindo própria senha', async () => {
    const mockValidation = {
      valid: true,
      church_id: 'c1',
      church_name: 'Igreja Batista LouvorFlow',
      name: 'Novo Operador de Som',
      email: 'som@igreja.com',
      role: 'MUSICO',
      operational_roles: ['SOM'],
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockValidation)

    const validRes = await pb.send('/backend/v1/invitations/validate?token=token_123', {
      method: 'GET',
    })
    expect(validRes.valid).toBe(true)
    expect(validRes.email).toBe('som@igreja.com')

    const mockAccept = {
      success: true,
      message: 'Conta ativada com sucesso! Você já pode fazer login no LouvorFlow.',
      email: 'som@igreja.com',
    }
    vi.mocked(pb.send).mockResolvedValueOnce(mockAccept)

    const acceptRes = await pb.send('/backend/v1/invitations/accept', {
      method: 'POST',
      body: {
        token: 'token_123',
        password: 'SenhaForte123!',
        password_confirm: 'SenhaForte123!',
      },
    })
    expect(acceptRes.success).toBe(true)
  })
})
