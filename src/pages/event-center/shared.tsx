import React from 'react'
import { Images, LampCeiling, MicVocal, MonitorPlay, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  ChurchMember,
  EventMember,
  HolyricsSyncStatus,
  MediaStatus,
  TaskPriority,
  TaskStatus,
  TeamArea,
  User,
} from '@/types'

export const TEAM_AREAS: { value: TeamArea; label: string; icon: React.ElementType }[] = [
  { value: 'LOUVOR', label: 'Louvor', icon: MicVocal },
  { value: 'SOM', label: 'Som', icon: SlidersHorizontal },
  { value: 'PROJECAO', label: 'Projeção', icon: MonitorPlay },
  { value: 'MIDIA', label: 'Mídia', icon: Images },
  { value: 'ILUMINACAO', label: 'Iluminação', icon: LampCeiling },
]

export const areaLabel = (area?: string) =>
  TEAM_AREAS.find((a) => a.value === area)?.label || 'Louvor'

/** Membros sem área gravada são do louvor (dados antigos). */
export const memberArea = (m: Pick<EventMember, 'team_area'>): TeamArea =>
  (m.team_area as TeamArea) || 'LOUVOR'

type MemberWithUser = ChurchMember & { expand?: { user_id?: User } }

export const churchMemberName = (m?: MemberWithUser | null) => m?.expand?.user_id?.name || 'Membro'

export const eventMemberName = (m: EventMember) =>
  m.expand?.member_id?.expand?.user_id?.name || 'Membro'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-teal-100 text-teal-800',
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-emerald-100 text-emerald-800',
]

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: 'sm' | 'md'
  className?: string
}) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      title={name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-white',
        size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs',
        AVATAR_COLORS[hash % AVATAR_COLORS.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

export type Tone = 'ok' | 'warn' | 'danger' | 'teal' | 'violet' | 'neutral'

const TONES: Record<Tone, { chip: string; dot: string }> = {
  ok: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  warn: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  danger: { chip: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  teal: { chip: 'bg-teal-50 text-teal-700 ring-teal-200', dot: 'bg-teal-500' },
  violet: { chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  neutral: { chip: 'bg-white text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
}

export function Chip({
  tone,
  dot = true,
  className,
  title,
  children,
}: {
  tone: Tone
  dot?: boolean
  className?: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONES[tone].chip,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', TONES[tone].dot)} />}
      {children}
    </span>
  )
}

export function SectionCard({
  title,
  subtitle,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-3.5">
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export const MEMBER_STATUS: Record<string, { label: string; tone: Tone }> = {
  CONFIRMADO: { label: 'Confirmado', tone: 'ok' },
  RECUSADO: { label: 'Recusou', tone: 'danger' },
  PENDENTE: { label: 'Sem resposta', tone: 'warn' },
}

export const MEDIA_STATUS: Record<MediaStatus, { label: string; tone: Tone }> = {
  ENVIADA: { label: 'Aguardando transferência', tone: 'warn' },
  RECEBIDA: { label: 'Aguardando transferência', tone: 'warn' },
  BAIXADA: { label: 'No computador', tone: 'teal' },
  IMPORTADA_HOLYRICS: { label: 'No Holyrics', tone: 'ok' },
  CONCLUIDA: { label: 'Concluída', tone: 'ok' },
}

export const MEDIA_CATEGORY_LABELS: Record<string, string> = {
  AGENDA: 'Agenda',
  ANIVERSARIANTES: 'Aniversariantes',
  AVISOS: 'Avisos',
  CULTOS: 'Cultos',
  EVENTOS: 'Eventos',
  VIDEO_ESPECIAL: 'Vídeo especial',
  OUTROS: 'Outros',
}

export const MEDIA_TYPE_LABELS: Record<string, string> = {
  VIDEO: 'Vídeo',
  IMAGEM: 'Imagem',
  AUDIO: 'Áudio',
  DOCUMENTO: 'Documento',
}

export function songSyncStatus(
  status: HolyricsSyncStatus | undefined,
  playlistOrder?: number,
): { label: string; tone: Tone } {
  switch (status) {
    case 'ADDED_TO_PLAYLIST':
      return {
        label: playlistOrder ? `Na playlist (${playlistOrder}º)` : 'Na playlist',
        tone: 'ok',
      }
    case 'ALREADY_IN_PLAYLIST':
      return { label: 'Na playlist', tone: 'ok' }
    case 'CREATED':
      return { label: 'Criada no Holyrics', tone: 'teal' }
    case 'VERIFYING_CREATED_SONG':
      return { label: 'Verificando', tone: 'violet' }
    case 'CREATING':
      return { label: 'Criando…', tone: 'violet' }
    case 'CHECKING':
      return { label: 'Consultando…', tone: 'violet' }
    case 'CHECKING_PLAYLIST':
      return { label: 'Conferindo playlist…', tone: 'violet' }
    case 'ADDING_TO_PLAYLIST':
      return { label: 'Adicionando…', tone: 'violet' }
    case 'VERIFYING_PLAYLIST':
      return { label: 'Confirmando…', tone: 'violet' }
    case 'ERROR':
      return { label: 'Erro', tone: 'danger' }
    default:
      return { label: 'Não enviada', tone: 'neutral' }
  }
}

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  PENDENTE: { label: 'A fazer', tone: 'neutral' },
  EM_ANDAMENTO: { label: 'Em andamento', tone: 'teal' },
  CONCLUIDA: { label: 'Concluída', tone: 'ok' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral' },
}

export const TASK_PRIORITY: Record<TaskPriority, { label: string; tone: Tone }> = {
  BAIXA: { label: 'Baixa', tone: 'neutral' },
  NORMAL: { label: 'Normal', tone: 'neutral' },
  ALTA: { label: 'Alta', tone: 'warn' },
  URGENTE: { label: 'Urgente', tone: 'danger' },
}

/** "há 3 h", "há 2 dias" */
export function timeAgo(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ''
  const min = Math.round(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}
