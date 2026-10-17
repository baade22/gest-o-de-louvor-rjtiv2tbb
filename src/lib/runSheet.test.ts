import { describe, expect, it } from 'vitest'
import { buildDefaultRunSheet, formatTime, parseTime, resolveMomentTimes } from './runSheet'

describe('runSheet', () => {
  it('converte horários', () => {
    expect(parseTime('17:05')).toBe(17 * 60 + 5)
    expect(parseTime('7:30')).toBe(450)
    expect(parseTime('25:00')).toBeNull()
    expect(parseTime('')).toBeNull()
    expect(formatTime(1445)).toBe('00:05')
  })

  it('modelo padrão encadeia os horários a partir do início do culto', () => {
    const sheet = buildDefaultRunSheet('17:00')
    expect(sheet.map((m) => m.start_time)).toEqual(['17:00', '17:05', '17:30', '17:40', '18:25'])
    expect(sheet.map((m) => m.order)).toEqual([1, 2, 3, 4, 5])
  })

  it('modelo padrão sem horário do culto deixa os horários em branco', () => {
    expect(buildDefaultRunSheet(undefined).every((m) => m.start_time === '')).toBe(true)
  })

  it('momentos sem horário continuam do anterior; horário salvo prevalece', () => {
    const times = resolveMomentTimes(
      [
        { duration_min: 5 },
        { duration_min: 20 },
        { start_time: '18:00', duration_min: 30 },
        { duration_min: 10 },
      ],
      '17:00',
    )
    expect(times).toEqual(['17:00', '17:05', '18:00', '18:30'])
  })

  it('sem início conhecido, só mostra horários a partir do primeiro salvo', () => {
    expect(
      resolveMomentTimes([{ duration_min: 5 }, { start_time: '19:00', duration_min: 5 }, {}]),
    ).toEqual([null, '19:00', '19:05'])
  })
})
