// Leitura do extrato bancário em OFX (o arquivo que o internet banking exporta).
// Aceita o formato antigo (SGML, sem fechar as tags, comum nos bancos brasileiros) e o XML.

export interface OfxLine {
  /** Identificador do movimento no banco; o mesmo movimento importado de novo é ignorado. */
  fitid: string
  date: string // YYYY-MM-DD
  /** Positivo = entrou na conta, negativo = saiu. */
  amount_cents: number
  description: string
}

export interface OfxStatement {
  bankId: string
  accountNumber: string
  startDate: string
  endDate: string
  /** Saldo informado pelo banco (LEDGERBAL), quando o arquivo traz. */
  balanceCents: number | null
  balanceDate: string
  lines: OfxLine[]
}

/** Lê os bytes do arquivo respeitando o CHARSET do cabeçalho (muitos bancos usam 1252). */
export function decodeOfx(bytes: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 600))
  const charset = /CHARSET:\s*(1252|ISO-8859-1|NONE)/i.test(head) ? 'windows-1252' : 'utf-8'
  const text = new TextDecoder(charset).decode(bytes)
  // Arquivo marcado como UTF-8 mas gravado em 1252 vira "�": tenta de novo
  return charset === 'utf-8' && text.includes('�')
    ? new TextDecoder('windows-1252').decode(bytes)
    : text
}

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))
  return m ? decodeEntities(m[1].trim()) : ''
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')

/** "20261012120000" (com ou sem o fuso no fim) → "2026-10-12" */
export function ofxDate(raw: string): string {
  const d = (raw || '').replace(/\D/g, '').slice(0, 8)
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : ''
}

/** "-1.234,56", "-1234.56", "+50" → centavos */
export function ofxAmountToCents(raw: string): number | null {
  let s = (raw || '').trim().replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export function parseOfx(text: string): OfxStatement {
  if (!/<OFX>/i.test(text)) throw new Error('Este arquivo não parece ser um extrato OFX.')
  const body = text.slice(text.search(/<OFX>/i))
  const lines: OfxLine[] = []
  const seen = new Map<string, number>()
  const blocks = body.split(/<STMTTRN>/i).slice(1)
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]
    const date = ofxDate(tag(block, 'DTPOSTED'))
    const cents = ofxAmountToCents(tag(block, 'TRNAMT'))
    if (!date || cents === null) continue
    const name = tag(block, 'NAME')
    const memo = tag(block, 'MEMO')
    const description = [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' · ')
    let fitid = tag(block, 'FITID')
    if (!fitid) {
      // Sem FITID: monta um a partir do movimento, numerando os repetidos do mesmo dia
      const key = `${date}|${cents}|${description}`
      const n = (seen.get(key) || 0) + 1
      seen.set(key, n)
      fitid = `sem-id:${key}|${n}`
    }
    lines.push({ fitid, date, amount_cents: cents, description: description || 'Movimento' })
  }
  const ledger = body.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i)
  const balanceCents = ledger ? ofxAmountToCents(tag(ledger[1], 'BALAMT')) : null
  const dates = lines.map((l) => l.date).sort()
  return {
    bankId: tag(body, 'BANKID'),
    accountNumber: tag(body, 'ACCTID'),
    startDate: ofxDate(tag(body, 'DTSTART')) || dates[0] || '',
    endDate: ofxDate(tag(body, 'DTEND')) || dates[dates.length - 1] || '',
    balanceCents,
    balanceDate: ledger ? ofxDate(tag(ledger[1], 'DTASOF')) : '',
    lines,
  }
}
