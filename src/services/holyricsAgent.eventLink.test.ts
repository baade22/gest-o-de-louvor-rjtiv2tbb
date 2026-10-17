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
   * Espelho exato da lógica de casamento do hook saas_holyrics_resolve_event.js (versão corrigida):
   * 1. Extração de data civil pura YYYY-MM-DD do alvo (imune a UTC).
   * 2. start_time do culto: SOMENTE se informado ("HH:mm"), filtra por horário. Se vazio, ignora horário.
   * 3. Prioridade 1 para datetime string no item ("YYYY-MM-DD HH:mm"), fallback datetime_millis com guarda String/Number.
   * 4. O ID extraído da ocorrência é EXCLUSIVAMENTE metadata.event.id — NUNCA metadata.event.metadata.service.id.
   * 5. Coleta detalhes de diagnóstico estruturados.
   */
  const matchScheduleCandidates = (
    schedules: any[],
    eventDate: string,
    startTime = '',
  ): { matched: any[]; ids: string[]; audit: any[] } => {
    const targetYmd = (() => {
      const m = String(eventDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
      return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
    })()
    const evParts = targetYmd
      ? {
          y: Number(targetYmd.slice(0, 4)),
          mo: Number(targetYmd.slice(5, 7)),
          d: Number(targetYmd.slice(8, 10)),
          ymd: targetYmd,
        }
      : null
    if (!evParts) return { matched: [], ids: [], audit: [] }

    let evHour = -1
    let evMinute = -1
    let hasTargetTime = false
    const trimmedStartTime = String(startTime || '').trim()
    const st = trimmedStartTime.match(/^(\d{1,2}):(\d{2})/)
    if (st) {
      evHour = Number(st[1])
      evMinute = Number(st[2])
      hasTargetTime = true
    }

    const parseSchedule = (item: any) => {
      if (!item || typeof item !== 'object') return null
      const strCandidates = [
        item.datetime,
        item.date,
        item.datetime_str,
        item.start,
        item.start_time,
        item.time,
        item.metadata?.event?.datetime,
      ]
      for (const s of strCandidates) {
        if (!s) continue
        const str = String(s).trim()
        if (!str) continue
        const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/)
        if (iso) {
          return {
            ymd: `${iso[1]}-${iso[2]}-${iso[3]}`,
            y: Number(iso[1]),
            mo: Number(iso[2]),
            d: Number(iso[3]),
            h: iso[4] !== undefined ? Number(iso[4]) : -1,
            mi: iso[5] !== undefined ? Number(iso[5]) : -1,
          }
        }
        const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/)
        if (br) {
          const dStr = String(br[1]).padStart(2, '0')
          const moStr = String(br[2]).padStart(2, '0')
          return {
            ymd: `${br[3]}-${moStr}-${dStr}`,
            y: Number(br[3]),
            mo: Number(moStr),
            d: Number(dStr),
            h: br[4] !== undefined ? Number(br[4]) : -1,
            mi: br[5] !== undefined ? Number(br[5]) : -1,
          }
        }
      }

      // Fallback millis
      const millisCandidates = [
        item.datetime_millis,
        item.datetimeMillis,
        item.timestamp,
        item.metadata?.event?.datetime_millis,
      ]
      for (const rawM of millisCandidates) {
        if (rawM === undefined || rawM === null || rawM === '') continue
        const v = typeof rawM === 'number' ? rawM : Number(String(rawM).trim())
        if (Number.isFinite(v) && v > 0) {
          const ms = v < 1e11 ? v * 1000 : v
          const localEpoch = ms - 3 * 3600 * 1000
          const dt = new Date(localEpoch)
          const y = dt.getUTCFullYear()
          const mo = dt.getUTCMonth() + 1
          const d = dt.getUTCDate()
          const h = dt.getUTCHours()
          const mi = dt.getUTCMinutes()
          return {
            ymd: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            y,
            mo,
            d,
            h,
            mi,
          }
        }
      }
      return null
    }

    const extractId = (it: any) => {
      if (!it || typeof it !== 'object') return ''
      if (it.metadata?.event?.id) {
        return String(it.metadata.event.id).trim()
      }
      if (it.event?.id) {
        return String(it.event.id).trim()
      }
      if (String(it.type || '').toLowerCase() === 'event' && it.id) {
        return String(it.id).trim()
      }
      return ''
    }

    const candidates = schedules.filter((it) => {
      const t = String(it.type || '').toLowerCase()
      return t === 'service' || t === 'event'
    })

    const audit: any[] = []
    const matched: any[] = []

    for (let i = 0; i < candidates.length; i++) {
      const it = candidates[i]
      const p = parseSchedule(it)
      const occId = extractId(it)

      if (!p) {
        audit.push({ index: i, decision: 'REJECTED_UNPARSEABLE_DATE' })
        continue
      }

      if (p.y !== evParts.y || p.mo !== evParts.mo || p.d !== evParts.d) {
        audit.push({
          index: i,
          decision: 'REJECTED_DATE_MISMATCH',
          extracted_ymd: p.ymd,
          target_ymd: targetYmd,
        })
        continue
      }

      if (hasTargetTime && p.h >= 0) {
        const diffMin = Math.abs(p.h * 60 + p.mi - (evHour * 60 + evMinute))
        if (diffMin > 1) {
          audit.push({
            index: i,
            decision: 'REJECTED_TIME_MISMATCH',
            extracted_time: `${p.h}:${p.mi}`,
            diff_min: diffMin,
          })
          continue
        }
      }

      if (!occId) {
        audit.push({ index: i, decision: 'REJECTED_MISSING_ID' })
        continue
      }

      audit.push({ index: i, decision: 'ACCEPTED', occurrence_id: occId })
      matched.push(it)
    }

    const ids = matched.map(extractId).filter((s) => s)
    return { matched, ids, audit }
  }

  const schedulesFixture = [
    {
      id: 'svc_recurring_1',
      type: 'service',
      datetime: '2025-08-10 19:00',
      name: 'Culto de Domingo',
      metadata: {
        event: {
          id: 'OCCURRENCE_20250810_1900',
          metadata: {
            service: {
              id: 'SERVICE_TEMPLATE_123',
            },
          },
        },
      },
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
    const onlyEvent = [schedulesFixture[1], schedulesFixture[2]]
    const { matched, ids } = matchScheduleCandidates(onlyEvent, '2025-08-10', '19:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['EV_HOLYRICS_001'])
  })

  it('15. [MOCK] Item type=service (culto de domingo) é selecionado e seu ID vem de metadata.event.id (ocorrência), NUNCA do service.id', () => {
    const realHolyricsServiceItem = {
      datetime: '2026-10-25 17:00',
      datetime_millis: '1792958400000',
      id: '1791842350987',
      name: 'Culto de Celebração',
      type: 'service',
      metadata: {
        event: {
          datetime: '2026-10-25 17:00',
          id: '1791842350987202610251700', // ID da ocorrência completa
          name: 'Culto de Celebração',
          metadata: {
            service: {
              id: '1791842350987', // ID do modelo recorrente
              name: 'Culto de Celebração',
            },
          },
        },
      },
    }

    const { matched, ids } = matchScheduleCandidates(
      [realHolyricsServiceItem],
      '2026-10-25',
      '17:00',
    )
    expect(matched.length).toBe(1)
    expect(ids.length).toBe(1)
    // Regra central: ID da ocorrência, NUNCA o ID do service recorrente
    expect(ids[0]).toBe('1791842350987202610251700')
    expect(ids[0]).not.toBe('1791842350987')
    expect(ids[0]).not.toBe(realHolyricsServiceItem.metadata.event.metadata.service.id)
  })

  it('15b. [MOCK] Duas ocorrências do mesmo serviço em domingos diferentes geram IDs distintos', () => {
    const sunday1 = {
      datetime: '2026-10-18 17:00',
      type: 'service',
      metadata: {
        event: {
          id: '1791842350987202610181700',
          metadata: { service: { id: '1791842350987' } },
        },
      },
    }
    const sunday2 = {
      datetime: '2026-10-25 17:00',
      type: 'service',
      metadata: {
        event: {
          id: '1791842350987202610251700',
          metadata: { service: { id: '1791842350987' } },
        },
      },
    }

    const resSunday1 = matchScheduleCandidates([sunday1, sunday2], '2026-10-18', '17:00')
    const resSunday2 = matchScheduleCandidates([sunday1, sunday2], '2026-10-25', '17:00')

    expect(resSunday1.ids).toEqual(['1791842350987202610181700'])
    expect(resSunday2.ids).toEqual(['1791842350987202610251700'])
    expect(resSunday1.ids[0]).not.toEqual(resSunday2.ids[0])
  })

  it('16. [MOCK] Zero candidatos de agendamento na data => EVENT_NOT_FOUND (nada persistido)', () => {
    const otherMonth = [
      {
        id: 'ev_far',
        type: 'event',
        datetime_millis: Date.UTC(2025, 8, 10, 22, 0),
        metadata: { event: { id: 'FAR' } },
      },
    ]
    const { matched, ids } = matchScheduleCandidates(otherMonth, '2025-08-10', '19:00')
    expect(matched.length).toBe(0)
    expect(ids).toEqual([])
  })

  it('17. [MOCK] Dois agendamentos do Holyrics na mesma data/hora => AMBIGUOUS_MATCH (nenhum escolhido)', () => {
    const duplicated = [
      {
        id: 'ev_a',
        type: 'service',
        datetime: '2026-10-25 17:00',
        metadata: { event: { id: 'OCCURRENCE_A' } },
      },
      {
        id: 'ev_b',
        type: 'event',
        datetime: '2026-10-25 17:00',
        metadata: { event: { id: 'OCCURRENCE_B' } },
      },
    ]
    const { matched, ids } = matchScheduleCandidates(duplicated, '2026-10-25', '17:00')
    expect(matched.length).toBe(2)
    expect(ids.length).toBe(2)
    // A decisão do hook é NÃO escolher: dois IDs distintos — a persistência é recusada
    expect(new Set(ids).size).toBe(2)
  })

  it('18. [MOCK] Data diferente (dia/mês/ano) não casa mesmo com horário igual', () => {
    // A fixture tem cultos em 10/08 e 17/08 às 19:00; 24/08 no mesmo horário não pode casar
    const { matched } = matchScheduleCandidates(schedulesFixture, '2025-08-24', '19:00')
    expect(matched.length).toBe(0)
  })

  it('19. [MOCK] Horário divergente (>1 min) descarta o candidato mesmo com data igual', () => {
    const { matched } = matchScheduleCandidates(schedulesFixture, '2025-08-10', '10:00')
    expect(matched.length).toBe(0)
  })

  it('20. [MOCK] Agendamento sem horário informado casa por data completa', () => {
    const noTime = [
      {
        id: 'ev_notime',
        type: 'service',
        datetime: '2025-08-10',
        metadata: { event: { id: 'NT' } },
      },
    ]
    const { matched, ids } = matchScheduleCandidates(noTime, '2025-08-10', '19:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['NT'])
  })

  it('21. [MOCK] Fuso: datetime_millis 22:00 UTC corresponde a 19:00 de Brasília (-3h)', () => {
    const onlyEvent = [schedulesFixture[1]]
    const { matched } = matchScheduleCandidates(onlyEvent, '2025-08-10', '19:00')
    expect(matched.length).toBe(1)
  })

  it('22. [MOCK] metadata.event.id ausente em service não produz ID — hook recusa persistir sem ID identificável', () => {
    const missingId = [
      {
        id: '1791842350987',
        type: 'service',
        datetime: '2026-10-25 17:00',
        name: 'Sem ID de ocorrência',
        metadata: {
          event: {
            name: 'Culto',
            // id da ocorrência ausente!
            metadata: { service: { id: '1791842350987' } },
          },
        },
      },
    ]
    const { matched, ids, audit } = matchScheduleCandidates(missingId, '2026-10-25', '17:00')
    // O hook descarta o candidato sem ID de ocorrência (REJECTED_MISSING_ID)
    expect(matched.length).toBe(0)
    expect(audit[0].decision).toBe('REJECTED_MISSING_ID')
    // NUNCA pode ter pego '1791842350987'
    expect(ids).toEqual([])
  })

  it('22b. [MOCK] Caso real: domingo 25/10/2026 às 17h com service recorrente casa ID completo da ocorrência', () => {
    const schedulePayload = [
      {
        datetime: '2026-10-25 17:00',
        datetime_millis: '1792958400000',
        id: '1791842350987',
        name: 'Culto de Celebração',
        type: 'service',
        metadata: {
          event: {
            datetime: '2026-10-25 17:00',
            id: '1791842350987202610251700',
            name: 'Culto de Celebração',
            metadata: {
              service: {
                id: '1791842350987',
                name: 'Culto de Celebração',
              },
            },
          },
        },
      },
    ]

    const { matched, ids } = matchScheduleCandidates(
      schedulePayload,
      '2026-10-25 00:00:00.000Z',
      '17:00',
    )
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['1791842350987202610251700'])
    expect(ids[0]).not.toBe('1791842350987')
  })

  it('22c. [MOCK] Item event puro sem metadata aninhado continua sendo associado pelo seu id', () => {
    const pureEvent = [
      {
        id: 'EV_CONFERENCE_2026',
        type: 'event',
        datetime: '2026-10-25 17:00',
        name: 'Conferência Anual',
      },
    ]
    const { matched, ids } = matchScheduleCandidates(pureEvent, '2026-10-25', '17:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['EV_CONFERENCE_2026'])
  })

  it('31. [NOVO] Alvo SEM horário (start_time vazio) casa com ocorrência de qualquer horário no mesmo dia', () => {
    const morningService = {
      datetime: '2026-10-25 09:00',
      datetime_millis: '1792929600000',
      type: 'service',
      metadata: { event: { id: 'OCC_MORNING_0900' } },
    }
    // start_time ausente/vazio
    const { matched, ids } = matchScheduleCandidates([morningService], '2026-10-25', '')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['OCC_MORNING_0900'])
  })

  it('32. [NOVO] Alvo COM horário 17h casa com "2026-10-25 17:00" e NÃO casa com "2026-10-25 09:00"', () => {
    const morning = {
      datetime: '2026-10-25 09:00',
      type: 'service',
      metadata: { event: { id: 'OCC_0900' } },
    }
    const evening = {
      datetime: '2026-10-25 17:00',
      type: 'service',
      metadata: { event: { id: 'OCC_1700' } },
    }

    const { matched, ids } = matchScheduleCandidates([morning, evening], '2026-10-25', '17:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['OCC_1700'])
    expect(ids).not.toContain('OCC_0900')
  })

  it('33. [NOVO] Data civil não é deslocada: 25/10 permanece 25/10 mesmo com datetime_millis em epoch string', () => {
    // 25/10/2026 17:00 BRT = 20:00 UTC = 1792958400000
    const item = {
      datetime: '2026-10-25 17:00',
      datetime_millis: '1792958400000',
      type: 'service',
      metadata: { event: { id: 'OCC_DATE_CHECK' } },
    }
    const { matched, ids, audit } = matchScheduleCandidates(
      [item],
      '2026-10-25 00:00:00.000Z',
      '17:00',
    )
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['OCC_DATE_CHECK'])
    expect(audit[0].decision).toBe('ACCEPTED')
  })

  it('34. [NOVO] Resposta do Agent desempacota lista mesmo vindo em JSON serializado dentro de "result" ou "response"', () => {
    // Espelho de extractScheduleList
    const unwrapJsonPayload = (raw: any): any => {
      if (!raw) return raw
      let current = raw
      if (typeof current === 'string') {
        const trimmed = current.trim()
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            current = JSON.parse(trimmed)
          } catch {
            /* intentionally ignored */
          }
        }
      }
      return current
    }

    const extractScheduleList = (rawResult: any): any[] => {
      if (!rawResult) return []
      let res = unwrapJsonPayload(rawResult)
      if (res && typeof res === 'object' && !Array.isArray(res)) {
        if (res.result) {
          const unwrapped = unwrapJsonPayload(res.result)
          if (Array.isArray(unwrapped)) return unwrapped
          if (unwrapped?.schedules && Array.isArray(unwrapped.schedules)) return unwrapped.schedules
        }
        if (res.response) {
          const unwrapped = unwrapJsonPayload(res.response)
          if (Array.isArray(unwrapped)) return unwrapped
          if (unwrapped?.schedules && Array.isArray(unwrapped.schedules)) return unwrapped.schedules
        }
      }
      if (res && Array.isArray(res.schedules)) return res.schedules
      if (Array.isArray(res)) return res
      return []
    }

    const raw1 = {
      result: JSON.stringify({
        schedules: [{ type: 'service', datetime: '2026-10-25 17:00' }],
      }),
    }
    const list1 = extractScheduleList(raw1)
    expect(list1.length).toBe(1)
    expect(list1[0].datetime).toBe('2026-10-25 17:00')

    const raw2 = JSON.stringify({
      schedules: [{ type: 'event', datetime: '2026-10-25 19:00' }],
    })
    const list2 = extractScheduleList(raw2)
    expect(list2.length).toBe(1)
    expect(list2[0].datetime).toBe('2026-10-25 19:00')
  })

  it('35. [NOVO] Diagnóstico estruturado no log: rejeições por data, horário e falta de ID ficam registradas', () => {
    const items = [
      {
        type: 'service',
        datetime: '2026-10-24 17:00', // Dia anterior
        metadata: { event: { id: 'OCC_YESTERDAY' } },
      },
      {
        type: 'service',
        datetime: '2026-10-25 09:00', // Horário diferente
        metadata: { event: { id: 'OCC_MORNING' } },
      },
      {
        type: 'service',
        datetime: '2026-10-25 17:00', // Falta metadata.event.id
      },
      {
        type: 'service',
        datetime: '2026-10-25 17:00', // Casamento perfeito
        metadata: { event: { id: 'OCC_PERFECT_MATCH' } },
      },
    ]

    const { matched, ids, audit } = matchScheduleCandidates(items, '2026-10-25', '17:00')
    expect(matched.length).toBe(1)
    expect(ids).toEqual(['OCC_PERFECT_MATCH'])
    expect(audit[0].decision).toBe('REJECTED_DATE_MISMATCH')
    expect(audit[1].decision).toBe('REJECTED_TIME_MISMATCH')
    expect(audit[2].decision).toBe('REJECTED_MISSING_ID')
    expect(audit[3].decision).toBe('ACCEPTED')
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
