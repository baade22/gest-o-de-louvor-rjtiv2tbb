// Contribuições de cada pessoa: a aba Financeiro da ficha do membro e o informe anual.
// Só entram entradas com nome (nunca as anônimas), não estornadas, em categoria de contribuição.

import type { FinCategory, FinTransaction } from '@/types/finance'

type Tx = Pick<FinTransaction, 'type' | 'date' | 'amount_cents' | 'status'> &
  Partial<
    Pick<FinTransaction, 'id' | 'category_id' | 'person_id' | 'is_anonymous' | 'payment_method'>
  >
type Category = Pick<FinCategory, 'id' | 'name'> & Partial<Pick<FinCategory, 'is_contribution'>>

const year = (tx: Tx) => Number((tx.date || '').slice(0, 4))
const month = (tx: Tx) => Number((tx.date || '').slice(5, 7)) - 1

/** Ids das categorias de contribuição (dízimo, ofertas, missões...). */
export const contributionIds = (categories: Category[]) =>
  new Set(categories.filter((c) => c.is_contribution).map((c) => c.id))

/** Contribuição com nome, válida, da pessoa (ou de qualquer pessoa, sem personId). */
export function isNamedContribution(tx: Tx, contributions: Set<string>, personId?: string) {
  return (
    tx.type === 'ENTRADA' &&
    tx.status !== 'ESTORNADO' &&
    !tx.is_anonymous &&
    !!tx.person_id &&
    (!personId || tx.person_id === personId) &&
    !!tx.category_id &&
    contributions.has(tx.category_id)
  )
}

export interface AnnualStatement {
  personId: string
  year: number
  total: number
  count: number
  /** Total de cada mês, de janeiro (0) a dezembro (11). */
  byMonth: number[]
  byCategory: { id: string; label: string; cents: number; count: number }[]
}

/** O informe do ano de cada pessoa que contribuiu com nome. */
export function annualStatements(
  txs: Tx[],
  categories: Category[],
  forYear: number,
): Map<string, AnnualStatement> {
  const contributions = contributionIds(categories)
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const out = new Map<string, AnnualStatement>()
  for (const tx of txs) {
    if (!isNamedContribution(tx, contributions) || year(tx) !== forYear) continue
    let s = out.get(tx.person_id!)
    if (!s) {
      s = {
        personId: tx.person_id!,
        year: forYear,
        total: 0,
        count: 0,
        byMonth: Array(12).fill(0),
        byCategory: [],
      }
      out.set(tx.person_id!, s)
    }
    s.total += tx.amount_cents
    s.count += 1
    s.byMonth[month(tx)] += tx.amount_cents
    let row = s.byCategory.find((r) => r.id === tx.category_id)
    if (!row) {
      row = {
        id: tx.category_id!,
        label: names.get(tx.category_id!) || 'Contribuição',
        cents: 0,
        count: 0,
      }
      s.byCategory.push(row)
    }
    row.cents += tx.amount_cents
    row.count += 1
  }
  for (const s of out.values()) s.byCategory.sort((a, b) => b.cents - a.cents)
  return out
}

export interface GivingSummary {
  year: number
  total: number
  byMonth: number[]
  monthsWithGift: number
  previousTotal: number
  /** A contribuição mais recente (de qualquer ano). */
  last: Tx | null
  /** Anos com contribuição, do mais recente ao mais antigo. */
  years: number[]
}

/** Resumo da aba Financeiro da ficha: o ano corrente, o anterior e a última contribuição. */
export function givingSummary(
  txs: Tx[],
  categories: Category[],
  personId: string,
  currentYear: number,
): GivingSummary {
  const contributions = contributionIds(categories)
  const mine = txs.filter((tx) => isNamedContribution(tx, contributions, personId))
  const byMonth = Array(12).fill(0)
  let total = 0
  let previousTotal = 0
  let last: Tx | null = null
  const years = new Set<number>()
  for (const tx of mine) {
    const y = year(tx)
    years.add(y)
    if (y === currentYear) {
      total += tx.amount_cents
      byMonth[month(tx)] += tx.amount_cents
    } else if (y === currentYear - 1) previousTotal += tx.amount_cents
    if (!last || tx.date > last.date) last = tx
  }
  return {
    year: currentYear,
    total,
    byMonth,
    monthsWithGift: byMonth.filter((v) => v > 0).length,
    previousTotal,
    last,
    years: [...years].sort((a, b) => b - a),
  }
}

// ---- Valor por extenso ----

const UNITS = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
]
const TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
]
const HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
]
const SCALES: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
]

function upTo999(n: number) {
  if (n === 100) return 'cem'
  const parts: string[] = []
  const rest = n % 100
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)])
  if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)])
    if (rest % 10) parts.push(UNITS[rest % 10])
  } else if (rest) parts.push(UNITS[rest])
  return parts.join(' e ')
}

function integerInWords(n: number) {
  if (n === 0) return 'zero'
  const groups: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 1000)) groups.push(v % 1000)
  const pieces: { word: string; group: number }[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (!g) continue
    const word =
      i === 0
        ? upTo999(g)
        : i === 1 && g === 1
          ? 'mil'
          : `${upTo999(g)} ${g === 1 ? SCALES[i][0] : SCALES[i][1]}`
    pieces.push({ word, group: g })
  }
  // O "e" só entra antes do último grupo quando ele é uma palavra só:
  // "mil e cem", "mil e cinquenta", "um milhão e duzentos mil", mas "mil duzentos e trinta".
  return pieces
    .map((p, k) => {
      if (k === 0) return p.word
      const single = p.group < 100 || p.group % 100 === 0
      return (k === pieces.length - 1 && single ? ' e ' : ' ') + p.word
    })
    .join('')
}

/** 123456 → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos" */
export function amountInWords(cents: number) {
  const value = Math.abs(Math.round(cents))
  const reais = Math.floor(value / 100)
  const centavos = value % 100
  const parts: string[] = []
  if (reais) {
    const millions = reais >= 1_000_000 && reais % 1_000_000 === 0
    parts.push(`${integerInWords(reais)}${millions ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (centavos) parts.push(`${integerInWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  return parts.length ? parts.join(' e ') : 'zero reais'
}
