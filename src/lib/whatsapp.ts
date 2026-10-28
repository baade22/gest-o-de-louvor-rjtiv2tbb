/** Link do WhatsApp para o telefone da ficha (DDD sem +55 vira número do Brasil). */
export function waLink(phone?: string, text?: string): string {
  let digits = (phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 11) digits = `55${digits}`
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

// ---------- WhatsApp conectado (envio pelo servidor) ----------

export type WhatsAppAutoKind =
  | 'ESCALA'
  | 'LEMBRETE_ESCALA'
  | 'INSCRICAO'
  | 'PAGAMENTO'
  | 'ANIVERSARIO'
  | 'CASAMENTO'

/** Envios automáticos que a igreja liga em Configurações > WhatsApp, na ordem da tela. */
export const WHATSAPP_AUTO: Array<{
  kind: WhatsAppAutoKind
  label: string
  hint: string
}> = [
  {
    kind: 'ESCALA',
    label: 'Aviso de escala',
    hint: 'Quando alguém entra na escala de um culto. Sai 10 minutos depois, para dar tempo de ajustar a escala.',
  },
  {
    kind: 'LEMBRETE_ESCALA',
    label: 'Lembrete na véspera',
    hint: 'Às 8h do dia anterior, para quem está escalado (menos quem recusou).',
  },
  {
    kind: 'INSCRICAO',
    label: 'Confirmação de inscrição em evento',
    hint: 'Usa a mensagem de confirmação do evento.',
  },
  {
    kind: 'PAGAMENTO',
    label: 'Confirmação de pagamento de inscrição',
    hint: 'Quando a inscrição é marcada como paga. Usa a mensagem de pagamento do evento.',
  },
  {
    kind: 'ANIVERSARIO',
    label: 'Parabéns de aniversário',
    hint: 'Às 8h, com o modelo da tela de Aniversariantes. Fica registrado na linha do tempo.',
  },
  {
    kind: 'CASAMENTO',
    label: 'Parabéns de aniversário de casamento',
    hint: 'Às 8h, com o modelo da tela de Aniversariantes.',
  },
]

export const WHATSAPP_KIND_LABEL: Record<WhatsAppAutoKind | 'TESTE' | 'AVISO', string> = {
  ESCALA: 'Escala',
  LEMBRETE_ESCALA: 'Lembrete de escala',
  INSCRICAO: 'Inscrição',
  PAGAMENTO: 'Pagamento',
  ANIVERSARIO: 'Aniversário',
  CASAMENTO: 'Casamento',
  TESTE: 'Teste',
  AVISO: 'Aviso',
}

/** Número como o servidor guarda (55 + DDD + número) ou vazio quando não dá. */
export function normalizeWhatsAppPhone(phone?: string): string {
  let d = (phone || '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d.length >= 12 && d.length <= 13 ? d : ''
}

/** 5511987654321 -> (11) 98765-4321; outros formatos voltam como vieram. */
export function formatWhatsAppPhone(phone?: string): string {
  const d = (phone || '').replace(/\D/g, '')
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone || ''
}
