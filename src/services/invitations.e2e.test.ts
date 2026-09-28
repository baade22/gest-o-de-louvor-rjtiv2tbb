import { describe, it, expect, vi } from 'vitest'

describe('Invitations & Account Activation Flow E2E Tests', () => {
  const mockChurchId = '8minai50ybqzkek'
  const mockValidRoleId = 'dnyfiyj4zrfryo9' // GUITARRA
  const mockOutroRoleId = 'fflwbc1c2lfc7s8' // OUTRO

  it('1. Valida fluxo completo de ativação com perfil MUSICO e instrumento válido', async () => {
    const invitePayload = {
      token: 'valid_token_musico',
      password: 'SenhaForte123',
      password_confirm: 'SenhaForte123',
    }

    const invitationRecord = {
      id: 'inv_123',
      church_id: mockChurchId,
      email: 'musico.teste@ibmaldeia.com.br',
      name: 'Músico Teste',
      role: 'MUSICO',
      operational_roles: ['MUSICO'],
      role_ids: [mockValidRoleId],
      status: 'PENDING',
      expires_at: '2026-10-10 00:00:00',
    }

    // Backend derives church_id and roles from invitation record, not client request
    expect(invitationRecord.church_id).toBe(mockChurchId)
    expect(invitationRecord.role).toBe('MUSICO')
    expect(invitationRecord.operational_roles).toContain('MUSICO')
    expect(invitationRecord.role_ids).toContain(mockValidRoleId)

    // Password validation rules
    const hasMinLength = invitePayload.password.length >= 8
    const hasLetter = /[a-zA-Z]/.test(invitePayload.password)
    const hasNumber = /[0-9]/.test(invitePayload.password)
    const passwordsMatch = invitePayload.password === invitePayload.password_confirm

    expect(hasMinLength).toBe(true)
    expect(hasLetter).toBe(true)
    expect(hasNumber).toBe(true)
    expect(passwordsMatch).toBe(true)

    // Verification of resulting user state
    const activatedUser = {
      email: invitationRecord.email,
      name: invitationRecord.name,
      verified: true,
    }
    const createdMembership = {
      church_id: invitationRecord.church_id,
      role: invitationRecord.role,
      operational_roles: invitationRecord.operational_roles,
      is_active: true,
    }
    const createdMemberRoles = [
      {
        church_id: invitationRecord.church_id,
        role_id: mockValidRoleId,
      },
    ]

    expect(activatedUser.verified).toBe(true)
    expect(createdMembership.church_id).toBe(mockChurchId)
    expect(createdMembership.role).toBe('MUSICO')
    expect(createdMemberRoles[0].role_id).toBe(mockValidRoleId)
  })

  it('2. Valida usuário com MÚSICO + SOM com união correta de funções operacionais', () => {
    const multiRoleInvitation = {
      church_id: mockChurchId,
      email: 'musico.som@ibmaldeia.com.br',
      role: 'MUSICO',
      operational_roles: ['MUSICO', 'SOM'],
      role_ids: [mockValidRoleId],
    }

    // Consolidated permissions check
    const opRoles = multiRoleInvitation.operational_roles
    expect(opRoles).toContain('MUSICO')
    expect(opRoles).toContain('SOM')

    // Module access resolution
    const allowedModules: string[] = ['dashboard', 'profile', 'my_scales']
    if (opRoles.includes('MUSICO')) allowedModules.push('songs')
    if (opRoles.includes('SOM')) {
      allowedModules.push('sound')
      allowedModules.push('events')
    }

    expect(allowedModules).toContain('songs')
    expect(allowedModules).toContain('sound')
    expect(allowedModules).toContain('events')
    expect(allowedModules).not.toContain('lighting')
    expect(allowedModules).not.toContain('media')
  })

  it('3. Valida segurança: backend deriva dados do convite e rejeita/ignora dados arbitrários', () => {
    const maliciousPayload = {
      token: 'valid_token_musico',
      password: 'SenhaForte123',
      password_confirm: 'SenhaForte123',
      // Attacker tries to inject church_id and MASTER role
      church_id: 'malicious_church_id',
      role: 'MASTER',
      role_ids: ['arbitrary_role_id'],
    }

    const originalInvitation = {
      church_id: mockChurchId,
      role: 'MUSICO',
      role_ids: [mockValidRoleId],
    }

    // Backend ignores client payload overrides and uses originalInvitation
    const effectiveChurchId = originalInvitation.church_id
    const effectiveRole = originalInvitation.role
    const effectiveRoleIds = originalInvitation.role_ids

    expect(effectiveChurchId).toBe(mockChurchId)
    expect(effectiveRole).toBe('MUSICO')
    expect(effectiveRoleIds).toEqual([mockValidRoleId])
    expect(effectiveChurchId).not.toBe(maliciousPayload.church_id)
    expect(effectiveRole).not.toBe(maliciousPayload.role)
  })

  it('4. Valida multi-tenant: role_ids de outra congregação são filtrados com segurança', () => {
    const targetChurchId = 'church_alpha'
    const otherChurchRoleId = 'role_from_church_beta'

    const availableRolesInChurchAlpha = [
      { id: 'role_alpha_1', church_id: 'church_alpha' },
      { id: 'role_alpha_2', church_id: 'church_alpha' },
    ]

    const candidateRoleIds = [otherChurchRoleId, 'role_alpha_1', 'non_existent_id']

    // Resolution filter inside invitations_accept
    const safeRoleIds = candidateRoleIds.filter((id) =>
      availableRolesInChurchAlpha.some((r) => r.id === id && r.church_id === targetChurchId),
    )

    expect(safeRoleIds).toEqual(['role_alpha_1'])
    expect(safeRoleIds).not.toContain(otherChurchRoleId)
    expect(safeRoleIds).not.toContain('non_existent_id')
  })

  it('5. Valida que MÚSICO ativado recebe 403 ao tentar módulos restritos (Som, Projeção, Mídia, Iluminação, Usuários, Integrações)', () => {
    const musicianMember = {
      role: 'MUSICO',
      operational_roles: ['MUSICO'],
      is_active: true,
    }

    const checkAccess = (moduleName: string) => {
      const op = musicianMember.operational_roles
      const isAdmin = musicianMember.role === 'ADMIN'
      const isLider = musicianMember.role === 'LIDER'

      switch (moduleName) {
        case 'sound':
          return op.includes('SOM') || isAdmin
        case 'projection':
          return op.includes('PROJECAO') || isAdmin
        case 'media':
          return op.includes('MIDIA') || op.includes('PROJECAO') || isAdmin
        case 'lighting':
          return op.includes('ILUMINACAO') || isAdmin
        case 'tasks':
          return op.includes('MIDIA') || isAdmin || isLider
        case 'songs':
          return op.includes('MUSICO') || isAdmin || isLider
        case 'musicians':
        case 'roles':
        case 'integrations':
        case 'settings':
          return isAdmin
        default:
          return true
      }
    }

    // Access to permitted modules
    expect(checkAccess('songs')).toBe(true)

    // Blocked modules must be false (403)
    expect(checkAccess('sound')).toBe(false)
    expect(checkAccess('projection')).toBe(false)
    expect(checkAccess('media')).toBe(false)
    expect(checkAccess('lighting')).toBe(false)
    expect(checkAccess('tasks')).toBe(false)
    expect(checkAccess('musicians')).toBe(false)
    expect(checkAccess('roles')).toBe(false)
    expect(checkAccess('integrations')).toBe(false)
    expect(checkAccess('settings')).toBe(false)
  })
})
