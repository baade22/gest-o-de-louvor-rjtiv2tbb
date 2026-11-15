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
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <h2 className="font-serif text-xl font-bold text-slate-900 lg:text-3xl">{children}</h2>
      {action}
    </div>
  )
}

export function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="shrink-0 text-sm font-semibold text-[var(--sa)]">
      {children}
    </Link>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-stone-200 bg-white p-4', className)}>
      {children}
    </div>
  )
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
        'w-12 shrink-0 rounded-xl bg-[color-mix(in_srgb,var(--sa)_16%,white)] py-1.5 text-center leading-tight',
        className,
      )}
    >
      <b className="block text-lg text-[var(--sp)]">{p.day}</b>
      <span className="text-[10.5px] font-bold uppercase text-[var(--sp)] opacity-70">{p.weekday}</span>
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
        <p className="font-semibold leading-snug text-slate-900">{item.title}</p>
        <p className="text-[13px] text-slate-500">{when || (item.kind === 'CULTO' ? 'Culto' : 'Evento')}</p>
        {item.signup_open && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
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
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-stone-100 hover:text-slate-700"
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
          className="relative aspect-[16/7] bg-gradient-to-br from-[var(--sa)] to-[var(--sp)]"
          style={
            item.cover_url
              ? { backgroundImage: `url(${siteFileUrl(item.cover_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        >
          {!item.cover_url && (
            <p className="absolute bottom-3 left-4 right-4 font-serif text-xl font-bold text-white">
              {item.title}
            </p>
          )}
          {item.signup_open && (
            <span className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              Inscrições abertas
            </span>
          )}
        </div>
        <div className="space-y-1.5 p-4">
          {item.cover_url && <p className="text-lg font-semibold">{item.title}</p>}
          <p className="text-sm text-slate-600">
            {dateRangeLabel(item.date, item.end_date)}
            {item.time ? ` · ${formatTime(item.time)}` : ''}
          </p>
          {item.location && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-4 w-4" /> {item.location}
            </p>
          )}
          <span className="mt-2 inline-flex items-center gap-1 rounded-xl bg-[var(--sa)] px-4 py-2 text-sm font-semibold text-[var(--sa-text)]">
            {item.signup_open ? 'Quero me inscrever' : 'Saiba mais'} <ChevronRight className="h-4 w-4" />
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
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
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
    <span className="relative block aspect-video shrink-0 overflow-hidden rounded-xl bg-slate-800">
      <img src={videoThumb(video.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white">
          <Play className="h-5 w-5 fill-white" />
        </span>
      </span>
      {video.live ? (
        <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10.5px] font-bold text-white">
          ● AO VIVO
        </span>
      ) : video.duration ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 text-[10.5px] text-white">
          {video.duration}
        </span>
      ) : null}
    </span>
  )
  if (layout === 'card') {
    return (
      <button type="button" onClick={() => setPlaying(true)} className="text-left">
        {thumb}
        <p className="mt-2 line-clamp-2 font-semibold leading-snug">{video.title}</p>
        {video.when && <p className="text-[13px] text-slate-500">{video.when}</p>}
      </button>
    )
  }
  return (
    <button type="button" onClick={() => setPlaying(true)} className="flex items-center gap-3 text-left">
      <span className="w-32 shrink-0 sm:w-40">{thumb}</span>
      <span className="min-w-0">
        <span className="line-clamp-2 font-semibold leading-snug">{video.title}</span>
        {video.when && <span className="block text-[13px] text-slate-500">{video.when}</span>}
      </span>
    </button>
  )
}
