// Importação dos movimentos exportados pelo Eklesia (exportação contábil em CSV).
//
// O arquivo vem sem cabeçalho, separado por ponto e vírgula, uma linha por movimento:
//  0 data do movimento (AAAAMMDD)   1 data de pagamento (AAAAMMDD)
//  3 receita: categoria / pagamento: conta     5 receita: conta / pagamento: categoria
//  7 centro de custo   8 histórico   9 valor (ponto decimal)   10 código do movimento
// 12 R (receita) ou P (pagamento)   14 CPF/CNPJ da pessoa   16 nome da pessoa (ou ANÔNIMO)

export interface EklesiaRow {
  /** Código do movimento no Eklesia: evita importar duas vezes */
  code: string
  type: 'ENTRADA' | 'SAIDA'
  /** Data de pagamento, YYYY-MM-DD */
  date: string
  amount_cents: number
  account: string
  category: string
  costCenter: string
  description: string
  personName: string
  personDocument: string
  line: number
}

export interface EklesiaParse {
  rows: EklesiaRow[]
  /** Linhas que não deu para ler, com o número da linha no arquivo */
  errors: { line: number; reason: string }[]
}

const ymd = (s: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

/** Nome comparável: sem acento, sem pontuação, minúsculo. */
export function normalizeName(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[˚º°]/g, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '')

export function parseEklesiaCsv(text: string): EklesiaParse {
  const rows: EklesiaRow[] = []
  const errors: EklesiaParse['errors'] = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = i + 1
    if (!raw.trim()) return
    const c = raw.split(';').map((x) => x.trim())
    const kind = (c[12] || '').toUpperCase()
    if (c.length < 13 || (kind !== 'R' && kind !== 'P')) {
      errors.push({ line, reason: 'Linha fora do formato do Eklesia' })
      return
    }
    const date = ymd(c[1]) || ymd(c[0])
    const value = Number((c[9] || '').replace(',', '.'))
    if (!date) {
      errors.push({ line, reason: 'Data inválida' })
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      errors.push({ line, reason: 'Valor inválido' })
      return
    }
    const isIn = kind === 'R'
    const name = c[16] || ''
    const anonymous = !name || normalizeName(name) === 'anonimo'
    rows.push({
      code: c[10] || `${c[0]}-${line}`,
      type: isIn ? 'ENTRADA' : 'SAIDA',
      date,
      amount_cents: Math.round(value * 100),
      account: isIn ? c[5] : c[3],
      category: isIn ? c[3] : c[5],
      costCenter: c[7] || '',
      description: c[8] || '',
      personName: anonymous ? '' : name,
      personDocument: anonymous ? '' : onlyDigits(c[14] || ''),
      line,
    })
  })
  return { rows, errors }
}

/** Marca gravada nas observações do lançamento importado. */
export const eklesiaMark = (code: string) => `Importado do Eklesia #${code}`

/** Códigos do Eklesia já importados, lidos das observações dos lançamentos. */
export function importedCodes(notes: (string | undefined)[]) {
  const codes = new Set<string>()
  for (const n of notes) {
    for (const m of (n || '').matchAll(/Importado do Eklesia #(\S+)/g)) codes.add(m[1])
  }
  return codes
}

const STOP = new Set(['e', 'de', 'da', 'do', 'das', 'dos', 'a', 'o'])

/** Acha o cadastro do LouvorFlow com o mesmo nome (ignora acento e caixa). */
export function matchByName<T extends { id: string; name: string }>(name: string, items: T[]) {
  const n = normalizeName(name)
  if (!n) return undefined
  const words = (s: string) =>
    normalizeName(s)
      .split(' ')
      .filter((w) => w && !STOP.has(w))
      .sort()
      .join(' ')
  const w = words(name)
  return (
    items.find((it) => normalizeName(it.name) === n) ||
    items.find((it) => words(it.name) === w) ||
    items.find((it) => {
      const m = normalizeName(it.name)
      return m.length >= 4 && (m.includes(n) || n.includes(m))
    })
  )
}
