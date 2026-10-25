// Recibo de contribuição com nome: número, mensagem e links para mandar pelo WhatsApp ou e-mail
// do próprio celular ou computador da tesouraria (sem servidor de envio).

import { formatCents } from './money'

/** Número do recibo: ano do lançamento + início do id ("2026-A1B2C3"). Não muda nunca. */
export const receiptNumber = (tx: { id: string; date: string }) =>
  `${tx.date.slice(0, 4)}-${tx.id.slice(0, 6).toUpperCase()}`

const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || ''

/** "2026-10-19 12:00:00.000Z" → "19/10/2026" */
const brDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`

export function receiptMessage(r: {
  personName: string
  churchName: string
  number: string
  categoryName: string
  amountCents: number
  date: string
  campaignName?: string
}) {
  const what = r.campaignName ? `${r.categoryName} · ${r.campaignName}` : r.categoryName
  return [
    `Olá, ${firstName(r.personName)}! A ${r.churchName} recebeu sua contribuição. Obrigado pela fidelidade! 🙏`,
    '',
    `Recibo nº ${r.number}`,
    `${what}: ${formatCents(r.amountCents)} em ${brDate(r.date)}`,
  ].join('\n')
}

/** Link do WhatsApp para o telefone do cadastro (DDD obrigatório); null quando não dá. */
export function whatsappLink(phone: string | undefined, text: string) {
  let d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  if (d.length < 12 || d.length > 13) return null
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`
}

export function mailtoLink(email: string | undefined, subject: string, body: string) {
  const e = (email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  return `mailto:${e}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
