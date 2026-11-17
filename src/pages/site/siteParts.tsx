// Peças repetidas do site da igreja: título de seção, cartão, data, item da agenda, vídeo.

import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, ChevronRight, MapPin, Play, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildIcs, dateRangeLabel, dayParts, formatTime, isExternal, safeLink } from '@/lib/site'
import { siteFileUrl, type PublicAgendaItem, type SiteVideo } from '@/services/site'

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-[18px] font-extrabold tracking-tight lg:text-2xl">{children}</h2>
      {action}
    </div>
  )
}

/** Título grande de tela (Agenda, Assistir...) com botão redondo opcional à direita. */
export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-[28px] font-extrabold leading-none tracking-tight lg:text-4xl">
        {children}
      </h1>
      {action}
    </div>
  )
}

/** Botão redondo branco (busca, compartilhar...). */
export function RoundButton({
  children,
  label,
  onClick,
  className,
}: {
  children: ReactNode
  label: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-white text-[var(--c-ink)] shadow-[0_2px_8px_rgba(20,34,58,0.06)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Abas em pílula (Cultos / Mensagens...). */
export function Pills<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K
  onChange: (k: K) => void
  options: [K, string][]
}) {
  return (
    <div className="c-scroll -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            'shrink-0 rounded-full px-4 py-2.5 text-[13px] font-bold',
            value === k
              ? 'bg-[var(--c-navy)] text-[var(--sp-text)]'
              : 'bg-white text-[var(--c-gray)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="shrink-0 text-[13px] font-bold text-[var(--c-blue)]">
      {children}
    </Link>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('c-card p-4', className)}>{children}</div>
}

/** Link que sabe se é interno (Link) ou externo (nova aba). */
export function SmartLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  const link = safeLink(href)
  if (!link) return <span className={className}>{children}</span>
  if (isExternal(link)) {
    return (
      <a href={link} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={link} className={className}>
      {children}
    </Link>
  )
}

export function DateBadge({ date, className }: { date: string; className?: string }) {
  const p = dayParts(date)
  return (
    <div
      className={cn(
        'grid h-[58px] w-[52px] shrink-0 place-items-center rounded-2xl bg-[var(--c-sky)] text-center leading-none text-[var(--c-navy)]',
        className,
      )}
    >
      <span>
        <span className="mb-[3px] block text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--c-blue)]">
          {p.weekday}
        </span>
        <b className="block text-[21px] font-extrabold">{p.day}</b>
      </span>
    </div>
  )
}

export function downloadIcs(item: PublicAgendaItem, siteTitle: string, address: string) {
  const url = item.url ? `${window.location.origin}${item.url}` : ''
  const ics = buildIcs({
    uid: `${item.kind}-${item.id}`,
    title: item.kind === 'CULTO' ? `${item.title} · ${siteTitle}` : item.title,
    date: item.date,
    end_date: item.end_date,
    time: item.time,
    location: item.location || address,
    description: item.description,
    url,
  })
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${item.title.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'evento'}.ics`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

export function AgendaRow({
  item,
  siteTitle,
  address,
}: {
  item: PublicAgendaItem
  siteTitle: string
  address: string
}) {
  const when = [
    item.end_date ? dateRangeLabel(item.date, item.end_date) : '',
    item.time ? formatTime(item.time) : '',
    item.location,
  ]
    .filter(Boolean)
    .join(' · ')
  const body = (
    <>
      <DateBadge date={item.date} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold leading-snug">{item.title}</p>
        <p className="text-[12.5px] font-medium text-[var(--c-gray)]">
          {when || (item.kind === 'CULTO' ? 'Culto' : 'Evento')}
        </p>
        {item.signup_open && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-[var(--c-sky)] px-2 py-1 text-[10.5px] font-extrabold text-[var(--c-blue)]">
            <Ticket className="h-3 w-3" /> Inscrições abertas
          </span>
        )}
      </div>
    </>
  )
  return (
    <Card className="flex items-center gap-3 p-3">
      {item.url ? (
        <Link to={item.url} className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <button
        type="button"
        aria-label="Salvar na agenda do celular"
        title="Salvar na agenda do celular"
        onClick={() => downloadIcs(item, siteTitle, address)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--c-bg)] text-[var(--c-gray)] hover:text-[var(--c-navy)]"
      >
        <CalendarPlus className="h-5 w-5" />
      </button>
    </Card>
  )
}

/** Evento com capa (destaque na agenda). */
export function EventCard({ item }: { item: PublicAgendaItem }) {
  return (
    <Card className="overflow-hidden p-0">
      <Link to={item.url} className="block">
        <div
          className="relative aspect-[16/7] bg-gradient-to-br from-[var(--c-blue)] to-[var(--c-navy)]"
          style={
            item.cover_url
              ? {
                  backgroundImage: `url(${siteFileUrl(item.cover_url)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          {!item.cover_url && (
            <p className="absolute bottom-3 left-4 right-4 text-[22px] font-extrabold leading-tight tracking-tight text-white">
              {item.title}
            </p>
          )}
          {item.signup_open && (
            <span className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-[var(--c-navy)]">
              Inscrições abertas
            </span>
          )}
        </div>
        <div className="space-y-1.5 p-4">
          {item.cover_url && <p className="text-[17px] font-extrabold">{item.title}</p>}
          <p className="text-sm font-medium text-[var(--c-gray)]">
            {dateRangeLabel(item.date, item.end_date)}
            {item.time ? ` · ${formatTime(item.time)}` : ''}
          </p>
          {item.location && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--c-gray)]">
              <MapPin className="h-4 w-4" /> {item.location}
            </p>
          )}
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--c-navy)] px-4 py-2.5 text-sm font-bold text-[var(--sp-text)]">
            {item.signup_open ? 'Quero me inscrever' : 'Saiba mais'}{' '}
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </Link>
    </Card>
  )
}

export function videoThumb(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

/** Miniatura do vídeo; ao tocar, abre o player do YouTube (sem cookies) no lugar. */
export function VideoTile({
  video,
  layout = 'row',
}: {
  video: SiteVideo
  layout?: 'row' | 'card'
}) {
  const [playing, setPlaying] = useState(false)
  if (playing) {
    return (
      <div className={cn(layout === 'row' && 'col-span-full')}>
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            title={video.title}
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <p className="mt-2 font-semibold leading-snug">{video.title}</p>
      </div>
    )
  }
  const thumb = (
    <span className="relative block aspect-video shrink-0 overflow-hidden rounded-[14px] bg-slate-800">
      <img
        src={videoThumb(video.id)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[var(--c-navy)]">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
      </span>
      {video.live ? (
        <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10.5px] font-bold text-white">
          ● AO VIVO
        </span>
      ) : video.duration ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-[color-mix(in_srgb,var(--sp)_85%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {video.duration}
        </span>
      ) : null}
    </span>
  )
  if (layout === 'card') {
    return (
      <button type="button" onClick={() => setPlaying(true)} className="text-left">
        {thumb}
        <p className="mt-2 line-clamp-2 text-[14px] font-bold leading-snug">{video.title}</p>
        {video.when && <p className="text-[12px] font-medium text-[var(--c-gray)]">{video.when}</p>}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="c-card flex items-center gap-3 p-2 text-left"
    >
      <span className="w-[124px] shrink-0 sm:w-40">{thumb}</span>
      <span className="min-w-0 pr-2">
        <span className="line-clamp-2 text-[14px] font-bold leading-snug">{video.title}</span>
        {video.when && (
          <span className="block text-[12px] font-medium text-[var(--c-gray)]">{video.when}</span>
        )}
      </span>
    </button>
  )
}
