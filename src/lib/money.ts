// Dinheiro em centavos (inteiros): evita erros de arredondamento do ponto flutuante.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 123456 → "R$ 1.234,56" */
export function formatCents(cents: number): string {
  // Intl usa espaço não separável entre "R$" e o número; normaliza para espaço comum.
  return BRL.format((cents || 0) / 100).replace(/ /g, ' ')
}

/**
 * Converte o que a pessoa digitou em centavos. Aceita "1.234,56", "1234,5", "1234.56",
 * "R$ 10" e "10". Devolve null quando não dá para entender o valor.
 */
export function parseMoneyToCents(input: string): number | null {
  let s = (input || '').replace(/R\$/gi, '').replace(/\s/g, '')
  if (!s) return null
  if (!/^-?[\d.,]+$/.test(s)) return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal; o outro é de milhar.
    const decimal = lastComma > lastDot ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    s = s.split(thousands).join('').replace(decimal, '.')
  } else if (lastComma >= 0) {
    if (s.indexOf(',') !== lastComma) return null
    s = s.replace(',', '.')
  } else if (lastDot >= 0) {
    // "1.234" (milhar) x "12.5" (decimal): com 3 dígitos depois do ponto é milhar.
    const parts = s.split('.')
    const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3
    if (isThousands) s = parts.join('')
  }

  const value = Number(s)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Centavos para o texto do campo de valor: 123456 → "1.234,56" */
export function centsToInput(cents: number): string {
  return formatCents(cents).replace(/^-?R\$\s?/, '')
}
