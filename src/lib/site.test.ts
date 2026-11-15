import { describe, expect, it } from 'vitest'
import {
  buildIcs,
  cleanServiceTimes,
  contrastText,
  dateRangeLabel,
  dayParts,
  formatTime,
  groupByMonth,
  nextService,
  parseBlocks,
  safeLink,
  sections,
  serviceNow,
  slugify,
  whatsappUrl,
  instagramUrl,
  youtubeUrl,
} from './site'

// Domingo, 15/11/2026, 18:30 em Brasília = 21:30 UTC
const SUNDAY_1830 = new Date('2026-11-15T21:30:00Z')

describe('horários dos cultos', () => {
  const times = cleanServiceTimes([
    { day: 0, time: '18:00', label: 'Culto' },
    { day: 0, time: '9:00', label: 'EBD' },
    { day: 3, time: '19:30', label: 'Oração' },
    { day: 9, time: '10:00', label: 'inválido' },
    { day: 1, time: 'xx', label: 'inválido' },
  ])

  it('limpa e ordena', () => {
    expect(times.map((t) => `${t.day} ${t.time}`)).toEqual(['0 09:00', '0 18:00', '3 19:30'])
  })

  it('ao vivo agora durante o culto (horário de Brasília)', () => {
    expect(serviceNow(times, SUNDAY_1830)?.label).toBe('Culto')
    // 10 minutos antes já conta
    expect(serviceNow(times, new Date('2026-11-15T20:52:00Z'))?.label).toBe('Culto')
    // depois de 2 horas acabou
    expect(serviceNow(times, new Date('2026-11-15T23:01:00Z'))).toBeNull()
  })

  it('próximo culto', () => {
    const n = nextService(times, SUNDAY_1830)
    expect(n?.service.label).toBe('Oração')
    expect(n?.daysAhead).toBe(3)
    // Domingo 8h: o próximo é a EBD de hoje
    const m = nextService(times, new Date('2026-11-15T11:00:00Z'))
    expect(m?.service.label).toBe('EBD')
    expect(m?.daysAhead).toBe(0)
    expect(nextService([], SUNDAY_1830)).toBeNull()
  })

  it('formata hora', () => {
    expect(formatTime('18:00')).toBe('18h')
    expect(formatTime('19:30')).toBe('19h30')
    expect(formatTime('')).toBe('')
  })
})

describe('agenda', () => {
  it('agrupa por mês', () => {
    const g = groupByMonth([{ date: '2026-11-16' }, { date: '2026-11-29' }, { date: '2026-12-01' }])
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ['novembro de 2026', 2],
      ['dezembro de 2026', 1],
    ])
  })

  it('partes da data e intervalo', () => {
    expect(dayParts('2026-11-15')).toEqual({ day: '15', weekday: 'dom', month: 'nov' })
    expect(dateRangeLabel('2026-11-29', '2026-11-30')).toBe('29 a 30 de novembro')
    expect(dateRangeLabel('2026-11-30', '2026-12-01')).toBe('30 de novembro a 1 de dezembro')
    expect(dateRangeLabel('2026-11-29')).toBe('29 de novembro')
  })

  it('arquivo .ics com hora e de dia inteiro', () => {
    const now = new Date('2026-11-15T12:00:00Z')
    const a = buildIcs({ uid: 'x', title: 'Culto, Ceia', date: '2026-11-16', time: '18:00', now })
    expect(a).toContain('DTSTART;TZID=America/Recife:20261116T180000')
    expect(a).toContain('DTEND;TZID=America/Recife:20261116T200000')
    expect(a).toContain('SUMMARY:Culto\\, Ceia')
    const b = buildIcs({
      uid: 'y',
      title: 'Encontro',
      date: '2026-11-29',
      end_date: '2026-11-30',
      now,
    })
    expect(b).toContain('DTSTART;VALUE=DATE:20261129')
    expect(b).toContain('DTEND;VALUE=DATE:20261201')
  })
})

describe('links e texto', () => {
  it('links de contato', () => {
    expect(whatsappUrl('(81) 99999-0000')).toBe('https://wa.me/5581999990000')
    expect(whatsappUrl('')).toBe('')
    expect(instagramUrl('@ibmaldeia')).toBe('https://instagram.com/ibmaldeia')
    expect(youtubeUrl('ibmaldeia')).toBe('https://www.youtube.com/@ibmaldeia')
  })

  it('só aceita link do site ou https', () => {
    expect(safeLink('/inscricao/abc')).toBe('/inscricao/abc')
    expect(safeLink('https://x.com/a')).toBe('https://x.com/a')
    expect(safeLink('ibmaldeia.com.br/x')).toBe('https://ibmaldeia.com.br/x')
    expect(safeLink('javascript:alert(1)')).toBe('')
    expect(safeLink('//evil.com')).toBe('')
  })

  it('texto das páginas', () => {
    const b = parseBlocks('# Quem somos\nSomos uma igreja\nem Aldeia.\n\n- Culto\n- EBD\nFim')
    expect(b).toEqual([
      { kind: 'h', text: 'Quem somos' },
      { kind: 'p', text: 'Somos uma igreja em Aldeia.' },
      { kind: 'ul', items: ['Culto', 'EBD'] },
      { kind: 'p', text: 'Fim' },
    ])
  })

  it('slug, contraste e seções', () => {
    expect(slugify('Quem Somos?')).toBe('quem-somos')
    expect(slugify('Ministérios & Grupos')).toBe('ministerios-grupos')
    expect(contrastText('#ffffff')).toBe('#111827')
    expect(contrastText('#14213d')).toBe('#ffffff')
    expect(sections({ oracao: false }).oracao).toBe(false)
    expect(sections(null).agenda).toBe(true)
  })
})
