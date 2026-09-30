import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { syncEventRepertoireWithHolyrics } from './holyricsAgent'

describe('Holyrics Repertoire & Song Sync (v0.0.24 Specification Tests)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('Teste 1: Cria música nova -> CreateSong OK -> ID salvo no LouvorFlow e adicionada à playlist', async () => {
    const mockSend = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      has_errors: false,
      event_id: 'event_culto_domingo',
      agent_id: 'agent_pc_projecao',
      items: [
        {
          order: 1,
          event_song_id: 'es_1',
          song_id: 's_nova_1',
          song_title: 'Grande é o Senhor',
          holyrics_song_id: '1790728009858',
          action: 'CREATED_AND_ADDED',
          status: 'SUCCESS',
          detail: 'Música criada no Holyrics (ID: 1790728009858) — Adicionada à playlist',
        },
      ],
      summary: {
        total: 1,
        created: 1,
        already_existed: 0,
        added: 1,
        already_in_playlist: 0,
        errors: 0,
      },
      message:
        'Sincronização concluída com sucesso! 1 músicas processadas: 1 adicionadas à playlist, 1 criadas no Holyrics.',
    })

    const res = await syncEventRepertoireWithHolyrics({
      churchId: 'church_alpha',
      eventId: 'event_culto_domingo',
    })

    expect(mockSend).toHaveBeenCalledWith(
      '/backend/v1/saas/holyrics/sync-event',
      expect.objectContaining({
        method: 'POST',
        body: {
          church_id: 'church_alpha',
          event_id: 'event_culto_domingo',
          agent_id: undefined,
        },
      }),
    )

    expect(res.success).toBe(true)
    expect(res.items?.[0].status).toBe('SUCCESS')
    expect(res.items?.[0].holyrics_song_id).toBe('1790728009858')
    expect(res.summary?.created).toBe(1)
    expect(res.summary?.added).toBe(1)
  })

  it('Teste 2: Sincronizar de novo -> CreateSong NÃO reexecutado, ID existente é reutilizado', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      has_errors: false,
      event_id: 'event_culto_domingo',
      items: [
        {
          order: 1,
          event_song_id: 'es_1',
          song_id: 's_nova_1',
          song_title: 'Grande é o Senhor',
          holyrics_song_id: '1790728009858',
          action: 'ALREADY_IN_PLAYLIST',
          status: 'SUCCESS',
          detail: 'Já cadastrada no Holyrics (ID: 1790728009858) — Já consta na playlist',
        },
      ],
      summary: {
        total: 1,
        created: 0,
        already_existed: 1,
        added: 0,
        already_in_playlist: 1,
        errors: 0,
      },
      message:
        'Sincronização concluída com sucesso! 1 músicas processadas: 1 já estavam na playlist.',
    })

    const res = await syncEventRepertoireWithHolyrics({
      churchId: 'church_alpha',
      eventId: 'event_culto_domingo',
    })

    expect(res.success).toBe(true)
    expect(res.summary?.created).toBe(0)
    expect(res.summary?.already_existed).toBe(1)
    expect(res.summary?.already_in_playlist).toBe(1)
    expect(res.items?.[0].action).toBe('ALREADY_IN_PLAYLIST')
  })

  it('Teste 3 & 4: Evento A, B, C -> playlist na mesma ordem exata e idempotência sem duplicação', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      has_errors: false,
      event_id: 'event_culto_domingo',
      items: [
        {
          order: 1,
          event_song_id: 'es_1',
          song_id: 's_1',
          song_title: 'Música A - Abertura',
          holyrics_song_id: '101',
          action: 'ADDED_TO_PLAYLIST',
          status: 'SUCCESS',
          detail: 'Já cadastrada no Holyrics — Adicionada à playlist',
        },
        {
          order: 2,
          event_song_id: 'es_2',
          song_id: 's_2',
          song_title: 'Música B - Louvor',
          holyrics_song_id: '102',
          action: 'ADDED_TO_PLAYLIST',
          status: 'SUCCESS',
          detail: 'Já cadastrada no Holyrics — Adicionada à playlist',
        },
        {
          order: 3,
          event_song_id: 'es_3',
          song_id: 's_3',
          song_title: 'Música C - Comunhão',
          holyrics_song_id: '103',
          action: 'ADDED_TO_PLAYLIST',
          status: 'SUCCESS',
          detail: 'Já cadastrada no Holyrics — Adicionada à playlist',
        },
      ],
      summary: {
        total: 3,
        created: 0,
        already_existed: 3,
        added: 3,
        already_in_playlist: 0,
        errors: 0,
      },
      message:
        'Sincronização concluída com sucesso! 3 músicas processadas: 3 adicionadas à playlist.',
    })

    const res = await syncEventRepertoireWithHolyrics({
      churchId: 'church_alpha',
      eventId: 'event_culto_domingo',
    })

    expect(res.success).toBe(true)
    expect(res.items?.[0].order).toBe(1)
    expect(res.items?.[1].order).toBe(2)
    expect(res.items?.[2].order).toBe(3)
    expect(res.summary?.total).toBe(3)
  })

  it('Teste 5: Adicionar música D nova -> apenas D é criada/adicionada, A/B/C mantidas', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      has_errors: false,
      event_id: 'event_culto_domingo',
      items: [
        {
          order: 1,
          event_song_id: 'es_1',
          song_id: 's_1',
          song_title: 'Música A',
          holyrics_song_id: '101',
          action: 'ALREADY_IN_PLAYLIST',
          status: 'SUCCESS',
          detail: 'Já cadastrada no Holyrics — Já consta na playlist',
        },
        {
          order: 2,
          event_song_id: 'es_2',
          song_id: 's_2',
          song_title: 'Música B',
          holyrics_song_id: '102',
          action: 'ALREADY_IN_PLAYLIST',
          status: 'SUCCESS',
          detail: 'Já cadastrada no Holyrics — Já consta na playlist',
        },
        {
          order: 3,
          event_song_id: 'es_3',
          song_id: 's_3',
          song_title: 'Música C',
          holyrics_song_id: '103',
          action: 'ALREADY_IN_PLAYLIST',
          status: 'SUCCESS',
          detail: 'Já cadastrada no Holyrics — Já consta na playlist',
        },
        {
          order: 4,
          event_song_id: 'es_4',
          song_id: 's_4',
          song_title: 'Música D Nova',
          holyrics_song_id: '104',
          action: 'CREATED_AND_ADDED',
          status: 'SUCCESS',
          detail: 'Música criada no Holyrics (ID: 104) — Adicionada à playlist',
        },
      ],
      summary: {
        total: 4,
        created: 1,
        already_existed: 3,
        added: 1,
        already_in_playlist: 3,
        errors: 0,
      },
      message:
        'Sincronização concluída com sucesso! 4 músicas processadas: 1 adicionadas à playlist, 3 já estavam na playlist, 1 criadas no Holyrics.',
    })

    const res = await syncEventRepertoireWithHolyrics({
      churchId: 'church_alpha',
      eventId: 'event_culto_domingo',
    })

    expect(res.summary?.created).toBe(1)
    expect(res.summary?.already_in_playlist).toBe(3)
    expect(res.summary?.added).toBe(1)
  })

  it('Teste 6: Agent desligado -> Agent offline sem criar estado falso', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      agent_online: false,
      error_code: 'AGENT_OFFLINE',
      message:
        '🔴 LouvorFlow Agent offline no computador "PC Projeção". Inicie o LouvorFlow Agent no computador do Holyrics.',
    })

    const res = await syncEventRepertoireWithHolyrics({
      churchId: 'church_alpha',
      eventId: 'event_culto_domingo',
    })

    expect(res.success).toBe(false)
    expect(res.agent_online).toBe(false)
    expect(res.error_code).toBe('AGENT_OFFLINE')
    expect(res.message).toContain('LouvorFlow Agent offline')
  })

  it('Teste 7: Holyrics fechado -> erro técnico claro, nunca "música não encontrada"', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: false,
      agent_online: true,
      holyrics_detected: false,
      error_code: 'HOLYRICS_NOT_DETECTED',
      message:
        'Não foi possível conectar ao Holyrics. Verifique: Agent conectado • Holyrics aberto • API Server ativo • Token válido.',
    })

    const res = await syncEventRepertoireWithHolyrics({
      churchId: 'church_alpha',
      eventId: 'event_culto_domingo',
    })

    expect(res.success).toBe(false)
    expect(res.error_code).toBe('HOLYRICS_NOT_DETECTED')
    expect(res.message).not.toContain('Música não encontrada')
    expect(res.message).toContain(
      'Verifique: Agent conectado • Holyrics aberto • API Server ativo • Token válido',
    )
  })

  it('Teste 8: Usuário sem holyrics.sync (ex: Músico) -> 403 do backend', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce({
      status: 403,
      message:
        'Apenas Administradores e Líderes possuem permissão para sincronizar com o Holyrics (holyrics.sync). Músicos não possuem autorização.',
    })

    await expect(
      syncEventRepertoireWithHolyrics({
        churchId: 'church_alpha',
        eventId: 'event_culto_domingo',
      }),
    ).rejects.toMatchObject({
      status: 403,
    })
  })

  it('Teste 9: Multi-tenant: congregação A não acessa cultos/agentes da congregação B', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce({
      status: 403,
      message: 'O culto informado pertence a outra congregação.',
    })

    await expect(
      syncEventRepertoireWithHolyrics({
        churchId: 'church_alpha',
        eventId: 'event_igreja_beta',
      }),
    ).rejects.toMatchObject({
      status: 403,
    })
  })
})
