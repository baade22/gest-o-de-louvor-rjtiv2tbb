import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  saveMusician,
  getMusician,
  listMusicians,
  removeMusician,
  type MusicianPayload,
} from './musicians'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      send: vi.fn(),
      collection: vi.fn(),
    },
  }
})

describe('musicians service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deve chamar /backend/v1/musicians/save com payload correto na criação', async () => {
    const payload: MusicianPayload = {
      church_id: 'church_123',
      name: 'João Silva',
      email: 'joao.silva@example.com',
      phone: '11999999999',
      role: 'MUSICO',
      is_active: true,
      role_ids: ['role_1', 'role_2'],
    }

    const mockResponse = {
      success: true,
      message: 'Músico cadastrado com sucesso!',
      member: {
        id: 'member_123',
        church_id: 'church_123',
        user_id: 'user_123',
        name: 'João Silva',
        email: 'joao.silva@example.com',
        phone: '11999999999',
        role: 'MUSICO',
        is_active: true,
      },
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockResponse)

    const result = await saveMusician(payload)

    expect(pb.send).toHaveBeenCalledTimes(1)
    expect(pb.send).toHaveBeenCalledWith('/backend/v1/musicians/save', {
      method: 'POST',
      body: payload,
    })
    expect(result).toEqual(mockResponse)
    expect(result.member.name).toBe('João Silva')
    expect(result.member.email).toBe('joao.silva@example.com')
  })

  it('deve chamar /backend/v1/musicians/save na edição com member_id e persistir novo nome e e-mail', async () => {
    const editPayload: MusicianPayload = {
      church_id: 'church_123',
      member_id: 'member_123',
      name: 'Vinni Silva Ferreira',
      email: 'vinicius.atualizado@gmail.com',
      phone: '81998375039',
      role: 'LIDER',
      is_active: true,
      role_ids: ['role_violao'],
    }

    const mockResponse = {
      success: true,
      message: 'Músico atualizado com sucesso!',
      member: {
        id: 'member_123',
        church_id: 'church_123',
        user_id: 'user_vinni',
        name: 'Vinni Silva Ferreira',
        email: 'vinicius.atualizado@gmail.com',
        phone: '81998375039',
        role: 'LIDER',
        is_active: true,
      },
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockResponse)

    const result = await saveMusician(editPayload)

    expect(pb.send).toHaveBeenCalledWith('/backend/v1/musicians/save', {
      method: 'POST',
      body: editPayload,
    })
    expect(result.success).toBe(true)
    expect(result.member.name).toBe('Vinni Silva Ferreira')
    expect(result.member.email).toBe('vinicius.atualizado@gmail.com')
  })

  it('deve buscar dados consolidados com getMusician retornando name e email do usuário', async () => {
    const mockMemberDetail = {
      id: 'member_123',
      church_id: 'church_123',
      user_id: 'user_123',
      role: 'LIDER' as const,
      phone: '81998375039',
      is_active: true,
      created: '2026-09-18T12:00:00Z',
      updated: '2026-09-18T12:00:00Z',
      name: 'Vinni Silva',
      email: 'viniciuslva.ferreira@gmail.com',
      role_ids: ['role_1'],
      roles: [
        {
          id: 'role_1',
          name: 'Vocal',
          church_id: 'church_123',
          color: '#10b981',
          description: '',
          created: '',
          updated: '',
        },
      ],
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockMemberDetail)

    const result = await getMusician('member_123', 'church_123')

    expect(pb.send).toHaveBeenCalledWith('/backend/v1/musicians/member_123?church_id=church_123', {
      method: 'GET',
    })
    expect(result.name).toBe('Vinni Silva')
    expect(result.email).toBe('viniciuslva.ferreira@gmail.com')
    expect(result.role).toBe('LIDER')
    expect(result.role_ids).toEqual(['role_1'])
  })

  it('deve listar membros com listMusicians trazendo nomes, emails e papéis consolidados', async () => {
    const mockListResponse = {
      items: [
        {
          id: 'member_1',
          church_id: 'church_123',
          user_id: 'user_1',
          role: 'ADMIN' as const,
          phone: '',
          is_active: true,
          created: '2026-09-14T02:59:25Z',
          updated: '2026-09-14T02:59:25Z',
          name: 'Admin Pastor',
          email: 'admin@igreja.com',
          role_ids: ['r1'],
          roles: [],
        },
        {
          id: 'member_2',
          church_id: 'church_123',
          user_id: 'user_2',
          role: 'LIDER' as const,
          phone: '81998375039',
          is_active: true,
          created: '2026-09-18T12:42:02Z',
          updated: '2026-09-18T12:42:02Z',
          name: 'Vinni Silva',
          email: 'viniciuslva.ferreira@gmail.com',
          role_ids: ['r2'],
          roles: [],
        },
      ],
      totalItems: 2,
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockListResponse)

    const list = await listMusicians('church_123')

    expect(pb.send).toHaveBeenCalledWith('/backend/v1/musicians?church_id=church_123', {
      method: 'GET',
    })
    expect(list).toHaveLength(2)
    expect(list[1].name).toBe('Vinni Silva')
    expect(list[1].email).toBe('viniciuslva.ferreira@gmail.com')
  })

  it('deve propagar erro de permissão (403) ou violação multi-tenant', async () => {
    const errorResponse = {
      status: 403,
      data: { message: 'Acesso negado: este membro pertence a outra igreja.' },
    }

    vi.mocked(pb.send).mockRejectedValueOnce(errorResponse)

    await expect(
      saveMusician({
        church_id: 'church_other',
        member_id: 'member_foreign',
        name: 'Tentativa Invasão',
        email: 'invasao@teste.com',
        role: 'MUSICO',
        is_active: true,
        role_ids: ['r1'],
      }),
    ).rejects.toEqual(errorResponse)
  })

  it('deve desvincular músico usando removeMusician', async () => {
    const mockDelete = vi.fn().mockResolvedValueOnce(true)
    vi.mocked(pb.collection).mockReturnValue({
      delete: mockDelete,
    } as unknown as ReturnType<typeof pb.collection>)

    await removeMusician('member_del_123')

    expect(pb.collection).toHaveBeenCalledWith('church_members')
    expect(mockDelete).toHaveBeenCalledWith('member_del_123')
  })
})
