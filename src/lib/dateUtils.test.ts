import { describe, it, expect } from 'vitest'
import {
  parseCalendarDate,
  getLocalTodayYMD,
  toCalendarYMD,
  formatCalendarDateDisplay,
} from './dateUtils.js'

describe('Etapa 3A — Preservação estrita de datas de calendário (sem recuo de fuso)', () => {
  it('1. Selecionar 25/10/2026 e confirmar que continua sendo 25/10/2026', () => {
    const raw = '2026-10-25'
    const parts = parseCalendarDate(raw)
    expect(parts).not.toBeNull()
    expect(parts?.year).toBe(2026)
    expect(parts?.month).toBe(10)
    expect(parts?.day).toBe(25)

    expect(toCalendarYMD(raw)).toBe('2026-10-25')
    expect(formatCalendarDateDisplay(raw, 'numeric')).toBe('25/10/2026')
    const full = formatCalendarDateDisplay(raw, 'full')
    expect(full).toContain('25')
    expect(full).toContain('outubro')
    expect(full).toContain('2026')
    expect(full).toContain('domingo')
  })

  it('2. Formato gravado no PocketBase ("2026-10-25 00:00:00.000Z") preserva 25/10/2026', () => {
    const pbStored = '2026-10-25 00:00:00.000Z'
    const parts = parseCalendarDate(pbStored)
    expect(parts).toEqual({ year: 2026, month: 10, day: 25 })
    expect(toCalendarYMD(pbStored)).toBe('2026-10-25')
    expect(formatCalendarDateDisplay(pbStored, 'numeric')).toBe('25/10/2026')
  })

  it('3. Formato ISO padrão ("2026-10-25T00:00:00.000Z") preserva 25/10/2026', () => {
    const iso = '2026-10-25T00:00:00.000Z'
    expect(toCalendarYMD(iso)).toBe('2026-10-25')
    expect(formatCalendarDateDisplay(iso, 'numeric')).toBe('25/10/2026')
  })

  it('4. Testar datas próximas à meia-noite (23:59:59 e 00:00:01)', () => {
    // Quando gravado apenas a data de calendário, deve preservar a data especificada
    expect(toCalendarYMD('2026-10-25 23:59:59.000Z')).toBe('2026-10-25')
    expect(toCalendarYMD('2026-10-25 00:00:01.000Z')).toBe('2026-10-25')
  })

  it('5. Confirmar que o mês e o ano extraídos para GetSchedules correspondem à data selecionada', () => {
    const selected = '2026-10-25 00:00:00.000Z'
    const parts = parseCalendarDate(selected)
    expect(parts?.month).toBe(10)
    expect(parts?.year).toBe(2026)
  })

  it('6. Virada de ano: 01/01/2027 preserva 01/01/2027 sem retroceder para 31/12/2026', () => {
    const newYear = '2027-01-01 00:00:00.000Z'
    expect(toCalendarYMD(newYear)).toBe('2027-01-01')
    expect(formatCalendarDateDisplay(newYear, 'numeric')).toBe('01/01/2027')
    const full = formatCalendarDateDisplay(newYear, 'full')
    expect(full).toContain('2027')
    expect(full).toContain('janeiro')
  })

  it('7. getLocalTodayYMD retorna formato YYYY-MM-DD válido', () => {
    const today = getLocalTodayYMD()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
