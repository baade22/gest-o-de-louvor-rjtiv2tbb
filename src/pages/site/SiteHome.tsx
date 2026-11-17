// Início do site/app da igreja (visual "Azul IBMA", 2026-11-17): foto da igreja no topo com o
// próximo culto (ou "ao vivo"), campo de oração, atalhos em círculo, avisos, agenda, destaques,
// mensagens recentes, horários e quem somos.

import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  ChevronRight,
  Clock,
  Heart,
  HeartHandshake,
  MapPin,
  Megaphone,
  Music,
  Play,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WEEKDAYS, brtClock, formatTime, mapsUrl, nextService, serviceNow } from '@/lib/site'
import { getSiteVideos, siteFileUrl, type SiteVideos } from '@/services/site'
import { useSite } from './siteContext'
import { DateBadge, MoreLink, SectionTitle, SmartLink, VideoTile } from './siteParts'

/** "Domingo às 18h" / "Hoje às 19h30" / "Amanhã às 9h" */
function whenText(daysAhead: number, day: number, time: string) {
  const d = daysAhead === 0 ? 'Hoje' : daysAhead === 1 ? 'Amanhã' : WEEKDAYS[day]
  return `${d} às ${formatTime(time)}`
}

function Hero({ videos }: { videos: SiteVideos | null }) {
  const { site, to } = useSite()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const current = serviceNow(site.service_times, now)
  const live = videos?.live || null
  const liveHref = live ? `https://www.youtube.com/watch?v=${live.id}` : videos?.live_url || ''
  const next = nextService(site.service_times, now)
  const photo = siteFileUrl(site.hero_url) || siteFileUrl(site.highlights[0]?.image_url)
  const map = mapsUrl(site.address, site.maps_url)
  const onAir = !!(live || current)

  const chip = onAir
    ? 'Ao vivo agora'
    : next
      ? whenText(next.daysAhead, next.service.day, next.service.time)
      : ''
  const title = onAir
    ? live?.title || current?.label || 'Culto'
    : next?.service.label || site.short_name || site.title

  return (
    <section className="relative isolate h-[440px] overflow-hidden text-white lg:mx-8 lg:mt-8 lg:h-[460px] lg:rounded-[32px]">
      {photo ? (
        <img src={photo} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[var(--c-blue)] to-[var(--c-navy)]" />
      )}
      <div className="c-hero-shade absolute inset-0 -z-10" />
      <div className="absolute inset-x-5 bottom-16 lg:bottom-14 lg:left-12 lg:max-w-2xl">
        {chip && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[12px] font-bold backdrop-blur">
            {onAir && <span className="h-[7px] w-[7px] rounded-full bg-[#ff6b6b]" />}
            {chip}
          </span>
        )}
        <h1 className="mt-3 text-[31px] font-extrabold leading-[1.08] tracking-tight lg:text-5xl">
          {title}
        </h1>
        {site.tagline && (
          <p className="mt-2 max-w-xl text-[14px] font-medium leading-snug text-white/80 lg:text-lg">
            {site.tagline}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onAir && liveHref ? (
            <a
              href={liveHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-[14px] font-bold text-[var(--c-navy)]"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Assistir agora
            </a>
          ) : site.sections.assistir ? (
            <Link
              to={to('/assistir')}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-[14px] font-bold text-[var(--c-navy)]"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Assistir
            </Link>
          ) : null}
          {map && (
            <a
              href={map}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-[14px] font-bold backdrop-blur"
            >
              <MapPin className="h-4 w-4" /> Como chegar
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

interface Shortcut {
  key: string
  label: string
  icon: typeof MapPin
  to?: string
  href?: string
}

function Circles({ items }: { items: Shortcut[] }) {
  if (!items.length) return null
  return (
    <div
      className={cn(
        'c-scroll flex gap-1 overflow-x-auto px-[18px] pt-[22px] lg:gap-4 lg:px-0',
        items.length <= 5 && 'justify-between lg:justify-start',
      )}
    >
      {items.map((s) => {
        const Icon = s.icon
        const inner = (
          <>
            <span className="grid h-[58px] w-[58px] place-items-center rounded-full border-[1.6px] border-[var(--c-ring)] bg-white text-[var(--c-blue)] lg:h-16 lg:w-16">
              <Icon className="h-[23px] w-[23px]" strokeWidth={1.8} />
            </span>
            <span className="text-[11.5px] font-bold leading-tight lg:text-[13px]">{s.label}</span>
          </>
        )
        const cls = 'flex w-[66px] shrink-0 flex-col items-center gap-2 text-center lg:w-24'
        return s.href ? (
          <a key={s.key} href={s.href} target="_blank" rel="noreferrer" className={cls}>
            {inner}
          </a>
        ) : s.to?.startsWith('#') ? (
          <a key={s.key} href={s.to} className={cls}>
            {inner}
          </a>
        ) : (
          <Link key={s.key} to={s.to!} className={cls}>
            {inner}
          </Link>
        )
      })}
    </div>
  )
}

/** Faixa que rola de lado no celular e vira grade no computador. */
function Rail({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        'c-scroll -mr-4 flex gap-3 overflow-x-auto pr-4 lg:mr-0 lg:grid lg:gap-5 lg:overflow-visible lg:pr-0',
        cols === 2 ? 'lg:grid-cols-2' : cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4',
      )}
    >
      {children}
    </div>
  )
}

function ServiceTimes() {
  const { site } = useSite()
  const today = brtClock(new Date()).day
  const next = nextService(site.service_times)?.service
  const list = [...site.service_times].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
  return (
    <div className="rounded-3xl bg-[var(--c-navy)] px-[18px] py-1.5 text-[var(--sp-text)] lg:grid lg:grid-cols-2 lg:gap-x-10 lg:px-8 lg:py-4">
      {list.map((t, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 border-b border-white/10 py-[13px] last:border-0 lg:[&:nth-last-child(2)]:border-0"
        >
          <span className="min-w-0 text-[14px] font-medium opacity-80">
            {WEEKDAYS[t.day]} · {t.label}
            {t === next && (
              <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                {t.day === today ? 'Hoje' : 'Próximo'}
              </span>
            )}
          </span>
          <b className="shrink-0 text-[16px] font-extrabold">{formatTime(t.time)}</b>
        </div>
      ))}
    </div>
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
    site.sections.biblia
      ? { key: 'biblia', to: to('/biblia'), label: 'Bíblia', icon: BookOpen }
      : null,
    site.sections.hinario && site.hymnals?.length
      ? { key: 'hinario', to: to('/hinario'), label: 'Hinário', icon: Music }
      : null,
    site.sections.novo && site.signup_url
      ? {
          key: 'novo',
          to: site.signup_url,
          label: 'Sou novo aqui',
          icon: Sparkles,
        }
      : null,
    site.service_times.length
      ? { key: 'horarios', to: '#horarios', label: 'Horários', icon: Clock }
      : null,
    site.sections.contribuir && (site.pix || site.campaigns.length)
      ? {
          key: 'ofertas',
          to: to('/contribuir'),
          label: 'Ofertas',
          icon: HeartHandshake,
        }
      : null,
    map ? { key: 'mapa', href: map, label: 'Como chegar', icon: MapPin } : null,
  ].filter(Boolean) as Shortcut[]

  const upcoming = site.agenda.slice(0, 6)
  const recent = (videos?.items || []).filter((v) => !v.live).slice(0, 4)
  // Sem foto própria no topo, a primeira foto dos destaques vai para o topo e sai da lista
  const highlights = site.hero_url ? site.highlights : site.highlights.slice(1)

  return (
    <div>
      <Hero videos={videos} />

      <div className="relative z-[3] -mt-8 rounded-t-[30px] bg-[var(--c-bg)] pt-5 lg:mx-auto lg:mt-0 lg:max-w-6xl lg:rounded-none lg:px-8 lg:pt-8">
        {site.sections.oracao && (
          <Link
            to={to('/oracao')}
            className="mx-4 flex h-[54px] items-center gap-2.5 rounded-full bg-white pl-5 pr-2 text-[14.5px] font-medium text-[#8a93a3] shadow-[0_6px_18px_rgba(20,34,58,0.07)] lg:mx-0 lg:max-w-xl"
          >
            <span className="flex-1 truncate">Como podemos orar por você hoje?</span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--c-navy)] text-[var(--sp-text)]">
              <Heart className="h-[18px] w-[18px]" />
            </span>
          </Link>
        )}

        <Circles items={shortcuts} />

        <div className="space-y-[26px] px-4 pt-[26px] lg:space-y-12 lg:px-0 lg:pt-10">
          {site.notices.length > 0 && (
            <section className="space-y-3.5">
              <SectionTitle>Avisos</SectionTitle>
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {site.notices.map((n) => (
                  <div key={n.id} className="c-card flex gap-3 p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--c-sky)] text-[var(--c-blue)]">
                      <Megaphone className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold">{n.title}</p>
                      {n.body && (
                        <p className="whitespace-pre-line text-[13.5px] font-medium leading-relaxed text-[var(--c-gray)]">
                          {n.body}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {site.sections.agenda && upcoming.length > 0 && (
            <section className="space-y-3.5">
              <SectionTitle action={<MoreLink to={to('/agenda')}>Ver tudo</MoreLink>}>
                Agenda
              </SectionTitle>
              <Rail cols={3}>
                {upcoming.map((it) => {
                  const body = (
                    <>
                      <DateBadge date={it.date} />
                      <span className="min-w-0">
                        <b className="line-clamp-2 block text-[14.5px] font-bold leading-tight">
                          {it.title}
                        </b>
                        <span className="block truncate text-[12px] font-medium text-[var(--c-gray)]">
                          {[it.time ? formatTime(it.time) : '', it.location]
                            .filter(Boolean)
                            .join(' · ') || (it.kind === 'CULTO' ? 'Culto' : 'Evento')}
                        </span>
                        {it.signup_open && (
                          <span className="mt-1 inline-block rounded-md bg-[var(--c-sky)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--c-blue)]">
                            Inscrições abertas
                          </span>
                        )}
                      </span>
                    </>
                  )
                  const cls = 'c-card flex w-[236px] shrink-0 items-center gap-3 p-3.5 lg:w-auto'
                  return it.url ? (
                    <Link key={`${it.kind}-${it.id}`} to={it.url} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <div key={`${it.kind}-${it.id}`} className={cls}>
                      {body}
                    </div>
                  )
                })}
              </Rail>
            </section>
          )}

          {highlights.length > 0 && (
            <section className="space-y-3.5">
              <SectionTitle>Destaques</SectionTitle>
              <Rail>
                {highlights.map((h) => {
                  const inner = (
                    <>
                      <span className="relative block h-[112px] overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--c-blue)] to-[var(--c-navy)] lg:h-44">
                        {h.image_url ? (
                          <img
                            src={siteFileUrl(h.image_url)}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="absolute inset-x-3.5 bottom-3 text-[18px] font-extrabold leading-[1.05] text-white">
                            {h.title}
                          </span>
                        )}
                      </span>
                      <b className="mt-2 line-clamp-2 block text-[14px] font-bold leading-tight">
                        {h.image_url ? h.title : h.button_label || h.subtitle || h.title}
                      </b>
                      {h.subtitle && (
                        <span className="line-clamp-2 block text-[12px] font-medium text-[var(--c-gray)]">
                          {h.subtitle}
                        </span>
                      )}
                    </>
                  )
                  const cls = 'block w-[156px] shrink-0 lg:w-auto'
                  return h.link ? (
                    <SmartLink key={h.id} href={h.link} className={cls}>
                      {inner}
                    </SmartLink>
                  ) : (
                    <div key={h.id} className={cls}>
                      {inner}
                    </div>
                  )
                })}
              </Rail>
            </section>
          )}

          {site.sections.assistir && recent.length > 0 && (
            <section className="space-y-3.5">
              <SectionTitle action={<MoreLink to={to('/assistir')}>Ver todos</MoreLink>}>
                Cultos e mensagens
              </SectionTitle>
              <Rail>
                {recent.map((v) => (
                  <div key={v.id} className="w-[240px] shrink-0 lg:w-auto">
                    <VideoTile video={v} layout="card" />
                  </div>
                ))}
              </Rail>
            </section>
          )}

          {site.service_times.length > 0 && (
            <section id="horarios" className="scroll-mt-20 space-y-3.5">
              <SectionTitle>Horários dos cultos</SectionTitle>
              <ServiceTimes />
            </section>
          )}

          {site.about && (
            <section className="space-y-3.5">
              <SectionTitle>Quem somos</SectionTitle>
              <div className="c-card p-5">
                <p className="whitespace-pre-line text-[15px] font-medium leading-relaxed text-[#2e3a4e]">
                  {site.about}
                </p>
                {site.pages.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {site.pages.map((p) => (
                      <Link
                        key={p.slug}
                        to={to(`/p/${p.slug}`)}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--c-sky)] px-3.5 py-2 text-[13px] font-bold text-[var(--c-navy)]"
                      >
                        {p.title} <ChevronRight className="h-4 w-4" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          <Link to={to('/instalar')} className="c-card flex items-center gap-4 p-4 lg:p-6">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--c-navy)] text-[var(--sp-text)]">
              <Smartphone className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-extrabold lg:text-xl">
                Tenha a igreja no seu celular
              </span>
              <span className="block text-[13px] font-medium text-[var(--c-gray)]">
                Agenda, avisos, cultos e Pix num ícone na tela de início.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-[#b3bbc7]" />
          </Link>
        </div>
      </div>
    </div>
  )
}
