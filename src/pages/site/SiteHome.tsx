// Início do site/app da igreja: destaques, ao vivo/próximo culto, atalhos, avisos, agenda,
// mensagens recentes e horários.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  ChevronRight,
  Clock,
  HandHeart,
  Megaphone,
  MapPin,
  QrCode,
  Radio,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WEEKDAYS, formatTime, mapsUrl, nextService, serviceNow, whenLabel } from '@/lib/site'
import { getSiteVideos, siteFileUrl, type SiteVideos } from '@/services/site'
import { useSite } from './siteContext'
import { AgendaRow, Card, MoreLink, SectionTitle, SmartLink, VideoTile } from './siteParts'

function Highlights() {
  const { site } = useSite()
  const [index, setIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const list = site.highlights
  useEffect(() => {
    if (list.length < 2) return
    const t = setInterval(() => {
      const el = ref.current
      if (!el) return
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % list.length
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 6000)
    return () => clearInterval(t)
  }, [list.length])
  if (!list.length) return null
  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] lg:rounded-b-3xl"
      >
        {list.map((h) => (
          <div
            key={h.id}
            className="relative aspect-[16/10] w-full shrink-0 snap-center bg-gradient-to-br from-[var(--sa)] to-[var(--sp)] sm:aspect-[1920/635]"
          >
            {h.image_url && (
              <img
                src={siteFileUrl(h.image_url)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent lg:bg-gradient-to-r lg:from-black/70 lg:via-black/30" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white lg:bottom-auto lg:top-1/2 lg:max-w-2xl lg:-translate-y-1/2 lg:p-12">
              <p className="font-serif text-2xl font-bold leading-tight lg:text-5xl">{h.title}</p>
              {h.subtitle && <p className="mt-1 text-sm opacity-90 lg:mt-3 lg:text-lg">{h.subtitle}</p>}
              {h.link && (
                <SmartLink
                  href={h.link}
                  className="mt-3 inline-flex items-center gap-1 rounded-xl bg-[var(--sa)] px-4 py-2 text-sm font-semibold text-[var(--sa-text)] lg:mt-6 lg:px-6 lg:py-3 lg:text-base"
                >
                  {h.button_label || 'Saiba mais'} <ChevronRight className="h-4 w-4" />
                </SmartLink>
              )}
            </div>
          </div>
        ))}
      </div>
      {list.length > 1 && (
        <div className="absolute right-4 top-4 flex gap-1.5">
          {list.map((h, i) => (
            <span
              key={h.id}
              className={cn('h-1.5 rounded-full bg-white transition-all', i === index ? 'w-5' : 'w-1.5 opacity-60')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LiveCard({ videos }: { videos: SiteVideos | null }) {
  const { site, to } = useSite()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const current = serviceNow(site.service_times, now)
  const live = videos?.live || null
  const liveUrl = videos?.live_url || ''
  if (current || live) {
    const href = live ? `https://www.youtube.com/watch?v=${live.id}` : liveUrl
    const content = (
      <>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
          <Radio className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
            ● AO VIVO
          </span>
          <span className="mt-1 block font-semibold">{live?.title || current?.label || 'Culto'}</span>
          <span className="block text-[13px] text-slate-500">
            {href ? 'Toque para assistir no YouTube' : `Começou às ${formatTime(current!.time)}`}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </>
    )
    return href ? (
      <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-white p-4">
        {content}
      </a>
    ) : (
      <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-white p-4">{content}</div>
    )
  }
  const next = nextService(site.service_times, now)
  if (!next) return null
  return (
    <Link to={to('/agenda')} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--sa)_16%,white)] text-[var(--sp)]">
        <Clock className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-slate-500">Próximo culto</span>
        <span className="block font-semibold">
          {whenLabel(next.daysAhead, next.service.day)}, {formatTime(next.service.time)} · {next.service.label}
        </span>
        {site.address && <span className="block truncate text-[13px] text-slate-500">{site.address}</span>}
      </span>
      <ChevronRight className="h-5 w-5 text-slate-400" />
    </Link>
  )
}

export default function SiteHome() {
  const { site, slug, to } = useSite()
  const [videos, setVideos] = useState<SiteVideos | null>(null)

  useEffect(() => {
    if (!site.sections.assistir || !site.youtube) return
    getSiteVideos(slug || undefined)
      .then(setVideos)
      .catch(() => setVideos(null))
  }, [site.sections.assistir, site.youtube, slug])

  const map = mapsUrl(site.address, site.maps_url)
  const shortcuts = [
    site.sections.contribuir && (site.pix || site.campaigns.length)
      ? { to: to('/contribuir'), label: 'Pix', hint: 'Dízimos e ofertas', icon: QrCode, tone: 'bg-amber-50 text-amber-700' }
      : null,
    site.sections.oracao
      ? { to: to('/oracao'), label: 'Oração', hint: 'A pastoral ora por você', icon: HandHeart, tone: 'bg-indigo-50 text-indigo-700' }
      : null,
    map
      ? { href: map, label: 'Como chegar', hint: 'Abrir no mapa', icon: MapPin, tone: 'bg-emerald-50 text-emerald-700' }
      : null,
    site.sections.novo && site.signup_url
      ? { to: site.signup_url, label: 'Sou novo', hint: 'Primeira vez aqui?', icon: Sparkles, tone: 'bg-sky-50 text-sky-700' }
      : null,
  ].filter(Boolean) as { to?: string; href?: string; label: string; hint: string; icon: typeof MapPin; tone: string }[]

  const upcoming = site.agenda.slice(0, 4)
  const recent = (videos?.items || []).filter((v) => !v.live).slice(0, 4)

  return (
    <div className="space-y-6 lg:space-y-12">
      <Highlights />

      <div className={cn('space-y-6 px-4 lg:space-y-12 lg:px-8', site.highlights.length ? '' : 'pt-4 lg:pt-10')}>
        {!site.highlights.length && (
          <div className="rounded-3xl bg-[var(--sp)] p-6 text-[var(--sp-text)] lg:p-12">
            <p className="font-serif text-2xl font-bold lg:text-5xl">{site.title}</p>
            {site.tagline && <p className="mt-2 opacity-80 lg:text-lg">{site.tagline}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <LiveCard videos={videos} />
        </div>

        {shortcuts.length > 0 && (
          <div className={cn('grid gap-3', ['grid-cols-1', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][Math.min(shortcuts.length, 4)], 'lg:grid-cols-4')}>
            {shortcuts.map((s) => {
              const Icon = s.icon
              const inner = (
                <>
                  <span className={cn('grid h-12 w-12 place-items-center rounded-2xl lg:h-11 lg:w-11 lg:rounded-xl', s.tone)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold lg:text-[15px]">{s.label}</span>
                    <span className="hidden text-[13px] text-slate-500 lg:block">{s.hint}</span>
                  </span>
                </>
              )
              const cls =
                'flex flex-col items-center gap-1.5 text-center lg:flex-row lg:gap-3 lg:rounded-2xl lg:border lg:border-stone-200 lg:bg-white lg:p-4 lg:text-left'
              return s.href ? (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className={cls}>
                  {inner}
                </a>
              ) : (
                <Link key={s.label} to={s.to!} className={cls}>
                  {inner}
                </Link>
              )
            })}
          </div>
        )}

        {site.notices.length > 0 && (
          <section className="space-y-3">
            <SectionTitle>Avisos da semana</SectionTitle>
            <Card className="divide-y divide-stone-100 p-0">
              {site.notices.map((n) => (
                <div key={n.id} className="flex gap-3 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--sa)_16%,white)] text-[var(--sp)]">
                    <Megaphone className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{n.title}</p>
                    {n.body && <p className="whitespace-pre-line text-sm text-slate-600">{n.body}</p>}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {site.sections.agenda && upcoming.length > 0 && (
          <section className="space-y-3">
            <SectionTitle action={<MoreLink to={to('/agenda')}>Ver agenda →</MoreLink>}>Agenda</SectionTitle>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {upcoming.map((it) => (
                <AgendaRow key={`${it.kind}-${it.id}`} item={it} siteTitle={site.title} address={site.address} />
              ))}
            </div>
          </section>
        )}

        {site.sections.assistir && recent.length > 0 && (
          <section className="space-y-3">
            <SectionTitle action={<MoreLink to={to('/assistir')}>Ver todos →</MoreLink>}>
              Cultos e mensagens
            </SectionTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recent.map((v) => (
                <VideoTile key={v.id} video={v} layout="card" />
              ))}
            </div>
          </section>
        )}

        {site.service_times.length > 0 && (
          <section className="space-y-3">
            <SectionTitle>Horários dos cultos</SectionTitle>
            <Card className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {site.service_times.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="text-slate-600">
                    {WEEKDAYS[t.day]} · {t.label}
                  </span>
                  <b>{formatTime(t.time)}</b>
                </div>
              ))}
            </Card>
          </section>
        )}

        {site.about && (
          <section className="space-y-3">
            <SectionTitle>Quem somos</SectionTitle>
            <Card>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{site.about}</p>
              {site.pages.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {site.pages.map((p) => (
                    <Link
                      key={p.slug}
                      to={to(`/p/${p.slug}`)}
                      className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1.5 text-sm font-medium"
                    >
                      <BookOpen className="h-4 w-4" /> {p.title}
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </section>
        )}

        <Link
          to={to('/instalar')}
          className="flex items-center gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--sa)_40%,white)] bg-[color-mix(in_srgb,var(--sa)_12%,white)] p-4 lg:p-6"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--sp)] text-[var(--sp-text)]">
            <Smartphone className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-lg font-bold lg:text-2xl">Tenha a igreja no seu celular</span>
            <span className="block text-sm text-slate-600">
              Agenda, avisos, cultos e Pix num ícone na tela de início. Sem baixar nada da loja.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </Link>
      </div>
    </div>
  )
}
