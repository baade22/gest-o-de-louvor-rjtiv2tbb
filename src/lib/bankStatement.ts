// Contas da aba Saldos e extratos: totais do período, agrupamento por dia e exportação.

export interface StatementLine {
  date: string
  amount_cents: number
  description?: string
  status?: string
}

export interface StatementDay<T extends StatementLine> {
  date: string // YYYY-MM-DD
  lines: T[]
  net: number
}

export function statementSummary<T extends StatementLine>(lines: T[]) {
  let credits = 0
  let debits = 0
  const days: StatementDay<T>[] = []
  for (const l of [...lines].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    if (l.amount_cents > 0) credits += l.amount_cents
    else debits += -l.amount_cents
    const date = l.date.slice(0, 10)
    const last = days[days.length - 1]
    if (last && last.date === date) {
      last.lines.push(l)
      last.net += l.amount_cents
    } else days.push({ date, lines: [l], net: l.amount_cents })
  }
  return { credits, debits, net: credits - debits, days }
}

/** Quanto tempo faz, em palavras: "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function timeAgo(iso: string, now = Date.now()) {
  const t = Date.parse(String(iso || '').replace(' ', 'T'))
  if (Number.isNaN(t)) return ''
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Data e hora de Brasília de um instante do servidor: "18/10 14:05". */
export function brtDateTime(iso: string) {
  const t = Date.parse(String(iso || '').replace(' ', 'T'))
  if (Number.isNaN(t)) return ''
  const d = new Date(t - 3 * 60 * 60 * 1000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}

/** Dia (YYYY-MM-DD) de Brasília de um instante do servidor. */
export function brtDay(iso: string) {
  const t = Date.parse(String(iso || '').replace(' ', 'T'))
  return Number.isNaN(t) ? '' : new Date(t - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const csvCell = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** Planilha (CSV com ; e vírgula decimal, como o Excel em português abre). */
export function statementCsv(
  lines: StatementLine[],
  statusLabel: (s?: string) => string = (s) => s || '',
) {
  const rows = [['Data', 'Descrição', 'Valor', 'Situação']]
  for (const l of [...lines].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const [y, m, d] = l.date.slice(0, 10).split('-')
    rows.push([
      `${d}/${m}/${y}`,
      l.description || '',
      (l.amount_cents / 100).toFixed(2).replace('.', ','),
      statusLabel(l.status),
    ])
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n')
}
