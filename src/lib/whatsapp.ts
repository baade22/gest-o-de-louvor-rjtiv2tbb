/** Link do WhatsApp para o telefone da ficha (DDD sem +55 vira número do Brasil). */
export function waLink(phone?: string, text?: string): string {
  let digits = (phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 11) digits = `55${digits}`
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
