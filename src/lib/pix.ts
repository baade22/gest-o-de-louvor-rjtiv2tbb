// PIX "copia e cola" estático (BR Code, padrão EMV do Banco Central) a partir da chave da igreja.
// O QR é gerado no navegador; o dinheiro cai direto na conta da chave e a tesouraria confere
// pelo extrato, como qualquer PIX recebido.

export type PixKeyType = 'CPF_CNPJ' | 'TELEFONE' | 'EMAIL' | 'ALEATORIA'

export interface PixInput {
  key: string
  keyType?: PixKeyType
  /** Nome de quem recebe (até 25 caracteres, sem acento). */
  name: string
  /** Cidade de quem recebe (até 15 caracteres, sem acento). */
  city: string
  amountCents?: number
  /** Identificador (até 25 letras e números); sem ele vai "***". */
  txid?: string
  /** Mensagem que aparece para quem paga, quando o banco mostra. */
  message?: string
}

/** Tira acentos e o que o padrão não aceita. */
export function pixText(text: string, max: number) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/** Deixa a chave no formato que os bancos esperam. */
export function normalizePixKey(key: string, type?: PixKeyType) {
  const k = (key || '').trim()
  const digits = k.replace(/\D/g, '')
  switch (type) {
    case 'CPF_CNPJ':
      return digits
    case 'TELEFONE':
      return `+${digits.length <= 11 ? `55${digits}` : digits}`
    case 'EMAIL':
    case 'ALEATORIA':
      return k.toLowerCase()
    default:
      if (k.includes('@')) return k.toLowerCase()
      if (k.startsWith('+')) return `+${digits}`
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k))
        return k.toLowerCase()
      return digits.length === 11 || digits.length === 14 ? digits : k
  }
}

/** Confere a chave conforme o tipo; devolve o problema ou ''. */
export function pixKeyProblem(key: string, type: PixKeyType) {
  const k = normalizePixKey(key, type)
  if (!key.trim()) return 'Informe a chave PIX.'
  if (type === 'CPF_CNPJ' && k.length !== 11 && k.length !== 14)
    return 'CPF tem 11 dígitos e CNPJ tem 14.'
  if (type === 'TELEFONE' && !/^\+55\d{10,11}$/.test(k))
    return 'Telefone com DDD, ex.: 81 98765-4321.'
  if (type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)) return 'E-mail inválido.'
  if (
    type === 'ALEATORIA' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)
  )
    return 'A chave aleatória tem o formato 123e4567-e89b-12d3-a456-426614174000.'
  return ''
}

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o padrão. */
export function crc16(payload: string) {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Monta o código "copia e cola" do PIX. */
export function pixPayload(input: PixInput) {
  const key = normalizePixKey(input.key, input.keyType)
  const keyPart = field('00', 'br.gov.bcb.pix') + field('01', key)
  // O campo 26 tem no máximo 99 caracteres: a mensagem usa o que sobra.
  const room = 99 - keyPart.length - 4
  const message = input.message && room > 0 ? pixText(input.message, Math.min(room, 72)) : ''
  const account = keyPart + (message ? field('02', message) : '')
  const txid = (input.txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const amount =
    input.amountCents && input.amountCents > 0
      ? field('54', (input.amountCents / 100).toFixed(2))
      : ''
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    amount +
    field('58', 'BR') +
    field('59', pixText(input.name, 25) || 'IGREJA') +
    field('60', pixText(input.city, 15) || 'BRASIL') +
    field('62', field('05', txid)) +
    '6304'
  return body + crc16(body)
}
