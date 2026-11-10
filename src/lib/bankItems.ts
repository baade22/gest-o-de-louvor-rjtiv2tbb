// Rendimentos e despesas bancárias (tarifas, IOF...), como as telas do Eklesia em
// Conciliação. O que entra em cada lista é a categoria do lançamento, não o jeito que ele foi
// feito: pela conciliação, pela regra das tarifas, avulso ou importado, aparece igual.

import type { FinBankLine, FinCategory, FinDirection } from '@/types/finance'

export type BankItemKind = 'RENDIMENTO' | 'DESPESA'

const YIELD = /rendiment|rentab/i
const FEE = /tarifa|despesas?\s+banc|encargos?\s+banc|\biof\b|cesta\s+de\s+serv/i

/** A categoria é desta lista? Rendimento vale nos dois lados (o negativo é uma saída). */
export function isBankItemCategory(
  c: Pick<FinCategory, 'name' | 'direction'> & { is_group?: boolean },
  kind: BankItemKind,
) {
  if (c.is_group) return false
  if (kind === 'RENDIMENTO') return YIELD.test(c.name)
  return c.direction === 'SAIDA' && FEE.test(c.name) && !YIELD.test(c.name)
}

/** Categoria criada quando a igreja ainda não tem nenhuma da lista. */
export function defaultCategoryName(kind: BankItemKind, direction: FinDirection) {
  if (kind === 'DESPESA') return 'Tarifas bancárias'
  return direction === 'ENTRADA' ? 'Rendimentos' : 'Rendimento negativo'
}

/** Lado do lançamento: rendimento é entrada (ou saída quando negativo); despesa é saída. */
export const itemDirection = (kind: BankItemKind, negative: boolean): FinDirection =>
  kind === 'RENDIMENTO' && !negative ? 'ENTRADA' : 'SAIDA'

const DESCRIBES = {
  RENDIMENTO: /RENTAB|RENDIM|JUROS|REMUNERA|CDB|FUNDO/i,
  DESPESA: /TARIFA|TAR[\s.]|CESTA|PACOTE|IOF|ENCARGO|ANUIDADE|MENSALIDADE/i,
}

const DAY = 24 * 60 * 60 * 1000
const distance = (a: string, b: string) =>
  Math.abs(
    new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime() -
      new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime(),
  ) / DAY

/**
 * Movimentos do extrato ainda pendentes que podem ser este rendimento ou despesa:
 * do lado certo (crédito ou débito), primeiro os de mesmo valor e data mais perto,
 * depois os que a descrição do banco já indica (RENTAB, TARIFA...).
 */
export function lineCandidates(
  lines: Pick<FinBankLine, 'id' | 'date' | 'amount_cents' | 'description' | 'status'>[],
  opts: { kind: BankItemKind; direction: FinDirection; amountCents?: number; date?: string },
) {
  const credit = opts.direction === 'ENTRADA'
  const wanted = opts.amountCents ? (credit ? opts.amountCents : -opts.amountCents) : 0
  const score = (l: (typeof lines)[number]) => {
    let s = 0
    if (wanted && l.amount_cents === wanted) s += 100
    if (DESCRIBES[opts.kind].test(l.description || '')) s += 10
    if (opts.date) s -= Math.min(distance(l.date, opts.date), 60) / 10
    return s
  }
  return lines
    .filter((l) => l.status === 'PENDENTE' && (credit ? l.amount_cents > 0 : l.amount_cents < 0))
    .map((l) => ({ line: l, score: score(l), exact: !!wanted && l.amount_cents === wanted }))
    .sort((a, b) => b.score - a.score || b.line.date.localeCompare(a.line.date))
}
