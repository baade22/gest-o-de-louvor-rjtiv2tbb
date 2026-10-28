/**
 * Avisos pelo WhatsApp (aba Avisos da Mídia): textos da tela e contas que a tela mostra antes
 * de o servidor enviar. O envio de verdade é do servidor (pocketbase/hooks/whatsapp_avisos.js);
 * a estimativa daqui usa a mesma regra: uma mensagem a cada pace_min a pace_max minutos, só
 * dentro da janela, no horário de Brasília.
 */

export type AvisoType = 'AVULSO' | 'REGRA_CULTO' | 'CULTO'
export type AvisoMediaType = 'TEXTO' | 'IMAGEM' | 'VIDEO' | 'DOCUMENTO' | 'AUDIO'
export type AvisoStatus =
  | 'RASCUNHO'
  | 'PROGRAMADO'
  | 'AGUARDANDO'
  | 'ENVIANDO'
  | 'PAUSADO'
  | 'CONCLUIDO'
  | 'CANCELADO'
  | 'ATIVA'
  | 'INATIVA'
export type AudienceType = 'TODOS' | 'GRUPO' | 'EVENTO' | 'PESSOAS'

export interface AvisoAudience {
  type: AudienceType
  congregation?: string
  statuses?: string[]
  group_id?: string
  event_id?: string
  person_ids?: string[]
}

export const MEDIA_TYPES: Array<{
  value: AvisoMediaType
  label: string
  accept: string
  hint: string
}> = [
  { value: 'TEXTO', label: 'Só texto', accept: '', hint: '' },
  {
    value: 'IMAGEM',
    label: 'Imagem',
    accept: '.jpg,.jpeg,.png,.webp',
    hint: 'JPG, PNG ou WEBP, até 16 MB.',
  },
  {
    value: 'VIDEO',
    label: 'Vídeo',
    accept: '.mp4,.3gp,.mov',
    hint: 'MP4, até 16 MB. De preferência com menos de 1 minuto.',
  },
  {
    value: 'DOCUMENTO',
    label: 'Documento',
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
    hint: 'PDF, Word, Excel ou PowerPoint, até 16 MB.',
  },
  {
    value: 'AUDIO',
    label: 'Áudio',
    accept: '.mp3,.ogg,.m4a,.aac,.opus,.wav',
    hint: 'MP3, OGG ou M4A, até 16 MB. Chega como áudio gravado; o texto vai logo depois.',
  },
]

export const MEDIA_LABEL: Record<AvisoMediaType, string> = {
  TEXTO: 'Só texto',
  IMAGEM: 'Imagem',
  VIDEO: 'Vídeo',
  DOCUMENTO: 'Documento',
  AUDIO: 'Áudio',
}

export function mediaSummary(type: AvisoMediaType, hasText: boolean): string {
  if (type === 'TEXTO') return 'Só texto'
  return MEDIA_LABEL[type] + (hasText ? ' + texto' : '')
}

export const STATUS_INFO: Record<AvisoStatus, { label: string; className: string }> = {
  RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PROGRAMADO: { label: 'Programado', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  AGUARDANDO: { label: 'Aguardando', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  ENVIANDO: { label: 'Enviando', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  PAUSADO: { label: 'Pausado', className: 'bg-orange-50 text-orange-800 border-orange-200' },
  CONCLUIDO: { label: 'Enviado', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CANCELADO: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  ATIVA: { label: 'Automático', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  INATIVA: { label: 'Desligado', className: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export const AUDIENCE_TYPES: Array<{ value: AudienceType; label: string }> = [
  { value: 'TODOS', label: 'Membros da igreja' },
  { value: 'GRUPO', label: 'Um ministério ou grupo' },
  { value: 'EVENTO', label: 'Inscritos de um evento' },
  { value: 'PESSOAS', label: 'Escolher pessoas' },
]

export const PERSON_STATUS_OPTIONS = [
  { value: 'MEMBRO', label: 'Membros' },
  { value: 'CONGREGADO', label: 'Congregados' },
  { value: 'VISITANTE', label: 'Visitantes' },
  { value: 'AFASTADO', label: 'Afastados' },
]

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Variáveis que o servidor troca na hora do envio. */
export const TEXT_VARIABLES: Array<{
  key: string
  label: string
  scope: 'sempre' | 'culto' | 'evento'
}> = [
  { key: 'primeiro_nome', label: 'primeiro nome', scope: 'sempre' },
  { key: 'nome', label: 'nome completo', scope: 'sempre' },
  { key: 'igreja', label: 'igreja', scope: 'sempre' },
  { key: 'culto', label: 'nome do culto', scope: 'culto' },
  { key: 'data', label: 'data do culto', scope: 'culto' },
  { key: 'hora', label: 'hora do culto', scope: 'culto' },
  { key: 'evento', label: 'nome do evento', scope: 'evento' },
  { key: 'data_evento', label: 'data do evento', scope: 'evento' },
  { key: 'local', label: 'local do evento', scope: 'evento' },
  { key: 'link_inscricao', label: 'link de inscrição', scope: 'evento' },
]

/** Prévia do texto como chega no WhatsApp: troca as variáveis por exemplos. */
export function previewText(text: string, sample: Record<string, string>): string {
  return text
    .replace(/\{(\w+)\}/g, (all, k: string) => (k in sample ? sample[k] : all))
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
}

const BRT = 3 * 3600 * 1000

export function parseHm(s: string | undefined, def: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return def
  const v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  return v >= 0 && v < 24 * 60 ? v : def
}

/** Põe um horário (ms) dentro da janela de envio, no horário de Brasília. */
export function nextSlot(t: number, ws: number, we: number): number {
  const b = new Date(t - BRT)
  const min = b.getUTCHours() * 60 + b.getUTCMinutes()
  const day = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
  if (min < ws) return day + ws * 60000 + BRT
  if (min >= we) return day + 24 * 3600 * 1000 + ws * 60000 + BRT
  return t
}

/**
 * Quando termina um envio de `count` mensagens começando em `start`, no ritmo médio.
 * Devolve o horário (ms) da última mensagem e em quantos dias o envio se espalha.
 */
export function estimateEnd(
  start: number,
  count: number,
  opts: { windowStart?: string; windowEnd?: string; paceMin?: number; paceMax?: number },
): { end: number; days: number } {
  const ws = parseHm(opts.windowStart, 8 * 60)
  const we = parseHm(opts.windowEnd, 20 * 60)
  const pmin = Math.max(1, opts.paceMin || 3)
  const pmax = Math.max(pmin, opts.paceMax || 5)
  const step = ((pmin + pmax) / 2) * 60000
  let t = start
  let last = start
  for (let i = 0; i < count; i++) {
    t = nextSlot(t, ws, we)
    last = t
    t += step
  }
  const dayOf = (ms: number) => Math.floor((ms - BRT) / (24 * 3600 * 1000))
  return { end: last, days: count === 0 ? 0 : dayOf(last) - dayOf(nextSlot(start, ws, we)) + 1 }
}

/** "hoje às 16:40", "amanhã às 09:12" ou "qua 05/11 às 10:00" (horário de Brasília). */
export function whenLabel(ms: number, now = Date.now()): string {
  const b = new Date(ms - BRT)
  const n = new Date(now - BRT)
  const hhmm = `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diff = Math.round((day(b) - day(n)) / (24 * 3600 * 1000))
  if (diff === 0) return `hoje às ${hhmm}`
  if (diff === 1) return `amanhã às ${hhmm}`
  if (diff === -1) return `ontem às ${hhmm}`
  const wd = WEEKDAYS[b.getUTCDay()].slice(0, 3).toLowerCase()
  const dm = `${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}`
  return `${wd} ${dm} às ${hhmm}`
}

/** Data do servidor ("2026-11-01 13:00:00.000Z") em ms. */
export function serverMs(s: string | undefined): number {
  if (!s) return 0
  const t = new Date(s.replace(' ', 'T')).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Valor para <input type="datetime-local"> (horário de Brasília) e de volta para ISO. */
export function toLocalInput(ms: number): string {
  return new Date(ms - BRT).toISOString().slice(0, 16)
}
export function fromLocalInput(v: string): string {
  const t = new Date(v + ':00Z').getTime() + BRT
  return Number.isNaN(t) ? '' : new Date(t).toISOString()
}
