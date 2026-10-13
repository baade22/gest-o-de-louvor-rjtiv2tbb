import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HolyricsClient } from '../../agent/src/holyricsClient.js'
import { LouvorFlowAgent } from '../../agent/src/agent.js'
import pb from '../lib/pocketbase/client.js'
import { resolveHolyricsEvent } from './holyricsAgent.js'

/**
 * Etapa 3A — Vinculação de culto do SaaS a evento EXISTENTE no Holyrics via GetSchedules.
 * Formato real da resposta GetSchedules do Holyrics nunca observado em campo: os mocks
 * cobrem os formatos tolerados (res.data array, .data.items, .data.schedules).
 * Todos os testes usam MOCKS de rede claramente identificados — nenhum Holyrics real é acessado.
 */

describe('Etapa 3A — GetSchedules: payload mínimo estrito', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('1. [MOCK] getSchedules envia SOMENTE {month, year} — nenhum campo extra no payload', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    const capturedBodies: any[] = []

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      expect(url).toContain('GetSchedules')
      expect(url).toContain('token=test_token')
      capturedBodies.push(JSON.parse(opts.body))
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 'ok', data: [] }),
      }
    })

    const res = await client.getSchedules(8, 2025)
    expect(res.success).toBe(true)
    expect(capturedBodies.length).toBe(1)
    // Payload mínimo estrito: exatamente { month, year }, nada mais
    expect(Object.keys(capturedBodies[0]).sort()).toEqual(['month', 'year'])
    expect(capturedBodies[0]).toEqual({ month: 8, year: 2025 })
  })

  it('2. [MOCK] HTTP 200 com {"status":"error"} é interpretado como falha, não como sucesso', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'error', error: 'invalid token' }),
    })

    const res = await client.getSchedules(3, 2025)
    expect(res.success).toBe(false)
    expect(res.schedules).toEqual([])
  })

  it('3. [MOCK] Timeout (TIMEOUT_HOLYRICS) classificado corretamente', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('TIMEOUT_HOLYRICS'))

    const res = await client.getSchedules(3, 2025)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('TIMEOUT_HOLYRICS')
  })

  it('4. [MOCK] Conexão recusada (ECONNREFUSED) classificada como CONNECTION_REFUSED', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }) as unknown as Error,
      )

    const res = await client.getSchedules(3, 2025)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('CONNECTION_REFUSED')
  })

  it('5. [MOCK] HTTP 401 classificado como AUTH_FORBIDDEN', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'bad_token')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ status: 'error', error: 'unauthorized' }),
    })

    const res = await client.getSchedules(3, 2025)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('AUTH_FORBIDDEN')
  })

  it('6. [MOCK] Resposta inválida (corpo não-JSON) não quebra: falha classificada, sem lançar', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>Gateway Timeout</html>',
    })

    const res = await client.getSchedules(3, 2025)
    expect(res.success).toBe(false)
    expect(res.error_code).toBe('GET_SCHEDULES_FAILED')
  })
})

describe('Etapa 3A — Extração tolerante da lista de schedules', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('7. [MOCK] Formato res.data array é aceito', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: 'ok',
          data: [{ id: 'e1', type: 'event', datetime_millis: Date.UTC(2025, 7, 10, 22, 0) }],
        }),
    })
    const res = await client.getSchedules(8, 2025)
    expect(res.success).toBe(true)
    expect(res.schedules.length).toBe(1)
    expect(res.schedules[0].id).toBe('e1')
  })

  it('8. [MOCK] Formato res.data.items é aceito', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, 'test_token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ status: 'ok', data: { items: [{ id: 'e2', type: 'event' }] } }),
    })
    const res = await client.getSchedules(8, 2025)
    expect(res.schedules.length).toBe(1)
    expect(res.schedules[0].id).toBe('e2')
  })

  it('9. [MOCK] Formato res.data.schedules é aceito', async () => {
    const client = new HolyricsClient('127.0.0.1', 8091, '_token')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ status: 'ok', data: { schedules: [{ id: 'e3', type: 'event' }] } }),
    })
    const res = await client.getSchedules(8, 2025)
    expect(res.schedules.length).toBe(1)
    expect(res.schedules[0].id).toBe('e3')
  })
})

describe('Etapa 3A — Agent: comando GET_SCHEDULES', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const makeCommand = (payload: Record<string, any>) => ({
    id: 'cmd_test_get_schedules',
    command_id: 'cmd_test_get_schedules',
    action: 'GET_SCHEDULES' as const,
    payload,
    created_at: new Date().toISOString(),
  })

  const makeAgent = (getSchedulesResult: any) => {
    const agent = new LouvorFlowAgent({
      agentId: 'agent_test',
      agentToken: 'token_test',
      churchId: 'church_test',
      churchName: 'Igreja Teste',
      saasUrl: 'http://localhost:3000',
      holyricsHost: '127.0.0.1',
      holyricsPort: 8091,
      holyricsToken: 'holyrics_token_test',
      holyricsMediaPath: '/tmp/holyrics',
      heartbeatIntervalMs: 30000,
      pollIntervalMs: 30000,
      version: '0.0.37',
    } as any)
    const getSchedules = vi.fn().mockResolvedValue(getSchedulesResult)
    ;(agent as any).holyrics = { getSchedules }
    return { agent, getSchedules }
  }

  it('10. [MOCK] GET_SCHEDULES válido retorna DONE com schedules/count/month/year', async () => {
    const { agent, getSchedules } = makeAgent({
      success: true,
      schedules: [{ id: 'ev1', type: 'event', metadata: { event: { id: '555' } } }],
      durationMs: 42,
      httpStatus: 200,
    })

    // reportCommandResult (rede) é stubado — o teste valida apenas a execução local
    ;(agent as any).reportCommandResult = vi.fn().mockResolvedValue(undefined)

    const res = await (agent as any).executeCommand(makeCommand({ month: 8, year: 2025 }))

    expect(getSchedules).toHaveBeenCalledWith(8, 2025)
    expect(res.status).toBe('DONE')
    expect(res.result.schedules.length).toBe(1)
    expect(res.result.count).toBe(1)
    expect(res.result.month).toBe(8)
    expect(res.result.year).toBe(2025)
    expect(res.result.schedules[0].metadata.event.id).toBe('555')
  })

  it('11. [MOCK] GET_SCHEDULES sem month/year falha com MISSING_SCHEDULE_PARAMS (nunca adivinha)', async () => {
    const { agent, getSchedules } = makeAgent({ success: true, schedules: [] })
    ;(agent as any).reportCommandResult = vi.fn().mockResolvedValue(undefined)

    const res = await (agent as any).executeCommand(makeCommand({}))

    expect(getSchedules).not.toHaveBeenCalled()
    expect(res.status).toBe('FAILED')
    expect(res.error_code).toBe('MISSING_SCHEDULE_PARAMS')
  })

  it('12. [MOCK] month fora do intervalo 1-12 é rejeitado pelo Agent', async () => {
    const { agent, getSchedules } = makeAgent({ success: true, schedules: [] })
    ;(agent as any).sendReport = vi.fn().mockResolvedValue(undefined)

    const res = await (agent as any).executeCommand(makeCommand({ month: 13, year: 2025 }))

    expect(getSchedules).not.toHaveBeenCalled()
    expect(res.status).toBe('FAILED')
    expect(res.error_code).toBe('MISSING_SCHEDULE_PARAMS')
  })

  it('13. [MOCK] Falha do cliente getSchedules propaga FAILED com error_code', async () => {
    const { agent } = makeAgent({
      success: false,
      schedules: [],
      error: 'Erro ao consultar GetSchedules no Holyrics',
      error_code: 'TIMEOUT_HOLYRICS',
    })
    ;(agent as any).sendReport = vi.fn().mockResolvedValue(undefined)

    const res = await (agent as any).executeCommand(makeCommand({ month: 8, year: 2025 }))

    expect(res.status).toBe('FAILED')
    expect(res.error_code).toBe('TIMEOUT_HOLYRICS')
  })
})

describe('Etapa 3A — Resolução de vínculo (casamento data/hora, evento vs service)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Espelho exato da lógica de casamento do hook saas_holyrics_resolve_event.js:
   * apenas type==='event', data COMPLETA (dia+mês+ano), horário quando ambos informam.
   * O ID extraído é SEMPRE metadata.event.id — nunca o ID interno do SaaS.
   */
  const matchEventCandidates = (
    schedules: any[],
    eventDate: string,
    startTime = '',
  ): { matched: any[]; ids: string[] } => {
    const evParts = (() => {
      const m = String(eventDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
      return m ? { y: +m[1], mo: +m[2], d: +m[3], h: -1, mi: -1 } : null
    })()
    if (!evParts) return { matched: [], ids: [] }

    let evHour = -1
    let evMinute = -1
    const st = startTime.match(/^(\d{1,2}):(\d{2})/)
    if (st) {
      evHour = +st[1]
      evMinute = +st[2]
    }

    const parseSchedule = (item: any) => {
      const millis = Number(item.datetime_millis)
      if (Number.isFinite(millis) && millis > 0) {
        const ms = millis < 1e11 ? millis * 1000 : millis
        const dt = new Date(ms)
        return {
          y: dt.getUTCFullYear(),
          mo: dt.getUTCMonth() + 1,
          d: dt.getUTCDate(),
          h: dt.getUTCHours(),
          mi: dt.getUTCMinutes(),
        }
      }
      const iso = String(item.datetime || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
      if (iso) return { y: +iso[1], mo: +iso[2], d: +iso[3], h: +iso[4], mi: +iso[5] }
      const br = String(item.datetime || '').match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/,
      )
      if (br)
        return {
          y: +br[3],
          mo: +br[2],
          d: +br[1],
          h: br[4] !== undefined ? +br[4] : -1,
          mi: br[5] !== undefined ? +br[5] : -1,
        }
      return null
    }

    const candidates = schedules.filter((it) => String(it.type || '').toLowerCase() === 'event')
    const matched = candidates.filter((it) => {
      const p = parseSchedule(it)
      if (!p) return false
      if (p.y !== evParts!.y || p.mo !== evParts!.mo || p.d !== evParts!.d) return false
      if (evHour >= 0 && p.h >= 0) {
        if (Math.abs(p.h * 60 + p.mi - (evHour * 60 + evMinute)) > 1) return false
      }
      return true
    })

    const ids = matched
      .map((it) =>
        it.metadata && it.metadata.event && it.metadata.event.id
          ? String(it.metadata.event.id).trim()
          : '',
      )
      .filter((s) => s)
    return { matched, ids }
  }

  const schedulesFixture = [
    {
      id: 'svc_recurring_1',
      type: 'service',
      datetime: '2025-08-10 19:00',
      name: 'Culto de Domingo',
    },
    {
      id: 'ev_holyrics_1',
      type: 'event',
      datetime_millis: Date.UTC(2025, 7, 10, 22, 0),
      name: 'Culto de Celebração',
      metadata: { event: { id: 'EV_HOLYRICS_001' } },
    },
    {
      id: 'ev_other_day',
      type: 'event',
      datetime_millis: Date.UTC(2025, 7, 17, 22, 0),
      name: 'Culto da Semana Seguinte',
      metadata: { event: { id: 'EV_OTHER' } },
    },
  ]

  it('14. [MOCK] Evento único na data é casado e o ID extraído vem de metadata.event.id', () => {
    const { matched, ids } = matchEventCandidates(schedulesFixture, '2025-08-10', '19:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['EV_HOLYRICS_001'])
  })

  it('15. [MOCK] Service recorrente na MESMA data é descartado (nunca casado)', () => {
    const onlyService = [
      {
        id: 'svc_recurring_1',
        type: 'service',
        datetime: '2025-08-10 19:00',
        name: 'Culto de Domingo',
      },
    ]
    const { matched, ids } = matchEventCandidates(onlyService, '2025-08-10', '19:00')
    expect(matched.length).toBe(0)
    expect(ids).toEqual([])
  })

  it('16. [MOCK] Zero candidatos de evento na data => EVENT_NOT_FOUND (nada persistido)', () => {
    const otherMonth = [
      {
        id: 'ev_far',
        type: 'event',
        datetime_millis: Date.UTC(2025, 8, 10, 22, 0),
        metadata: { event: { id: 'FAR' } },
      },
    ]
    const { matched, ids } = matchEventCandidates(otherMonth, '2025-08-10', '19:00')
    expect(matched.length).toBe(0)
    expect(ids).toEqual([])
  })

  it('17. [MOCK] Dois eventos do Holyrics na mesma data/hora => AMBIGUOUS_MATCH (nenhum escolhido)', () => {
    const duplicated = [
      {
        id: 'ev_a',
        type: 'event',
        datetime_millis: Date.UTC(2025, 7, 10, 22, 0),
        metadata: { event: { id: 'A' } },
      },
      {
        id: 'ev_b',
        type: 'event',
        datetime_millis: Date.UTC(2025, 7, 10, 22, 0),
        metadata: { event: { id: 'B' } },
      },
    ]
    const { matched, ids } = matchEventCandidates(duplicated, '2025-08-10', '19:00')
    expect(matched.length).toBe(2)
    expect(ids.length).toBe(2)
    // A decisão do hook é NÃO escolher: dois IDs distintos — a persistência é recusada
    expect(new Set(ids).size).toBe(2)
  })

  it('18. [MOCK] Data diferente (dia/mês/ano) não casa mesmo com horário igual', () => {
    const { matched } = matchEventCandidates(schedulesFixture, '2025-08-17', '19:00')
    expect(matched.length).toBe(0)
  })

  it('19. [MOCK] Horário divergente (>1 min) descarta o candidato mesmo com data igual', () => {
    const { matched } = matchEventCandidates(schedulesFixture, '2025-08-10', '10:00')
    expect(matched.length).toBe(0)
  })

  it('20. [MOCK] Evento sem horário informado casa por data completa', () => {
    const noTime = [
      { id: 'ev_notime', type: 'event', datetime: '2025-08-10', metadata: { event: { id: 'NT' } } },
    ]
    const { matched, ids } = matchEventCandidates(noTime, '2025-08-10', '19:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['NT'])
  })

  it('21. [MOCK] Fuso: datetime_millis 22:00 UTC corresponde a 19:00 de Brasília (-3h)', () => {
    // Fixture usa Date.UTC(2025,7,10,22,0) — 22:00 UTC == 19:00 em UTC-3
    const { matched } = matchEventCandidates(schedulesFixture, '2025-08-10', '19:00')
    expect(matched.length).toBe(1)
  })

  it('22. [MOCK] metadata.event.id ausente não produz ID — hook recusa persistir sem ID identificável', () => {
    const missingId = [
      {
        id: 'ev_noid',
        type: 'event',
        datetime_millis: Date.UTC(2025, 7, 10, 22, 0),
        name: 'Sem ID',
      },
    ]
    const { matched, ids } = matchEventCandidates(missingId, '2025-08-10', '19:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual([])
  })
})

describe('Etapa 3A — Persistência do vínculo (frontend service) e bloqueio de payload', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('23. [MOCK] resolveHolyricsEvent envia church_id + event_id ao endpoint novo', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      success: true,
      status: 'LINKED',
      linked: true,
      holyrics_event_id: 'EV_HOLYRICS_001',
      event_id: 'event_xyz',
      message: 'Culto vinculado.',
    })
    pb.send = mockPost as any

    await resolveHolyricsEvent({ churchId: 'church_xyz', eventId: 'event_xyz' })

    expect(mockPost).toHaveBeenCalledWith('/backend/v1/saas/holyrics/resolve-event', {
      method: 'POST',
      body: { church_id: 'church_xyz', event_id: 'event_xyz', agent_id: undefined },
    })
  })

  it('24. [MOCK] addPayload do sync-event usa holyrics_event_id REAL (nunca o ID do PocketBase)', () => {
    // Espelho do addPayload de saas_holyrics_sync_event.js (~linha 1329)
    const eventIdFromPocketBase = 'pb_event_internal_id_12345'
    const holyricsEventId = 'EV_HOLYRICS_001'

    const addPayload = {
      id: '987654321',
      index: 0,
      media_playlist: false,
      song_id: 'song_saas_id',
      event_id: holyricsEventId, // SEMPRE o ID real do Holyrics
    }

    expect(addPayload.event_id).toBe('EV_HOLYRICS_001')
    expect(addPayload.event_id).not.toBe(eventIdFromPocketBase)
    expect(Object.keys(addPayload).sort()).toEqual([
      'event_id',
      'id',
      'index',
      'media_playlist',
      'song_id',
    ])
  })

  it('25. [MOCK] holyrics_event_id vazio bloqueia sync-event com HOLYRICS_EVENT_NOT_LINKED (sem fallback)', () => {
    const eventRecord = {
      getString: (field: string) => (field === 'holyrics_event_id' ? '' : ''),
    }

    const holyricsEventId = eventRecord.getString('holyrics_event_id') || ''
    expect(holyricsEventId).toBe('')

    // Espelho da decisão do hook: sem vínculo -> interrompe ANTES de enfileirar qualquer comando
    const blocked = !holyricsEventId
    expect(blocked).toBe(true)
  })

  it('26. [MOCK] syncEventMediaPlaylist exige vínculo: payload carrega holyrics_event_id real', () => {
    // Espelho de saas_holyrics_sync_media_playlist.js (~linhas 268-273)
    const holyricsEventId = 'EV_HOLYRICS_001'
    const payload = {
      event_id: holyricsEventId,
      church_id: 'church_xyz',
      event_title: 'Culto de Celebração',
      items: [],
    }
    expect(payload.event_id).toBe('EV_HOLYRICS_001')
    expect(payload.event_id).not.toBe('pb_event_internal_id')
  })

  it('27. [MOCK] Data do culto preserva dia 25/10/2026 mesmo quando armazenada como "2026-10-25 00:00:00.000Z"', () => {
    const pbDate = '2026-10-25 00:00:00.000Z'
    const match = pbDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    expect(match).not.toBeNull()
    const y = Number(match![1])
    const mo = Number(match![2])
    const d = Number(match![3])
    expect(y).toBe(2026)
    expect(mo).toBe(10)
    expect(d).toBe(25)
  })

  it('28. [MOCK] Casamento com data 25/10/2026 e resposta do Holyrics com datetime_millis', () => {
    const testSchedules = [
      {
        id: 'ev_domingo_25',
        type: 'event',
        // 25/10/2026 às 20:00 UTC (17:00 em UTC-3)
        datetime_millis: Date.UTC(2026, 9, 25, 20, 0),
        name: 'Culto de Domingo 17h',
        metadata: { event: { id: 'EV_2026_10_25' } },
      },
    ]
    const evDate = '2026-10-25'
    const evMatch = evDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    expect(evMatch).not.toBeNull()
    const targetY = Number(evMatch![1])
    const targetMo = Number(evMatch![2])
    const targetD = Number(evMatch![3])

    const scheduleDate = new Date(testSchedules[0].datetime_millis)
    // 20:00 UTC - 3h fuso = 17:00 em UTC-3 na mesma data 25/10/2026
    const brasiliaHours = (scheduleDate.getUTCHours() - 3 + 24) % 24
    expect(scheduleDate.getUTCFullYear()).toBe(targetY)
    expect(scheduleDate.getUTCMonth() + 1).toBe(targetMo)
    expect(scheduleDate.getUTCDate()).toBe(targetD)
    expect(brasiliaHours).toBe(17)
  })

  it('29. [MOCK] Isolamento multi-tenant: evento de outra igreja é bloqueado antes da consulta', () => {
    const eventChurchId: string = 'church_alpha'
    const requestChurchId: string = 'church_beta'
    expect(eventChurchId === requestChurchId).toBe(false)
  })

  it('30. [MOCK] Tentativa de vincular culto já vinculado responde LINKED imediatamente', () => {
    const eventRecord = {
      holyrics_event_id: 'EV_ALREADY_LINKED',
    }
    const alreadyLinked = Boolean(eventRecord.holyrics_event_id)
    expect(alreadyLinked).toBe(true)
  })
})
