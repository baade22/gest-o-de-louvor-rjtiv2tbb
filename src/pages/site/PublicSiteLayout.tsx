// Site e App da igreja: moldura pública (sem login). No celular vira "app": barra de abas embaixo,
// topo fixo e, no Safari do iPhone, um aviso para pôr na tela de início. No computador vira site
// com menu no topo e rodapé. Os dados vêm de /backend/v1/public/site (hook site_public.js).

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  FileText,
  Heart,
  HeartHandshake,
  House,
  Instagram,
  Loader2,
  LogIn,
  Mail,
  MapPin,
  Menu,
  Music,
  Phone,
  PlayCircle,
  Share,
  Sparkles,
  UserRound,
  X,
  Youtube,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  cleanServiceTimes,
  contrastText,
  facebookUrl,
  formatTime,
  instagramUrl,
  isIos,
  isStandalone,
  mapsUrl,
  sections as withDefaults,
  validColor,
  whatsappUrl,
  youtubeUrl,
  WEEKDAYS,
} from '@/lib/site'
import { getPublicSite, siteFileUrl, siteManifestUrl, type PublicSite } from '@/services/site'
import type { SiteCtx } from './siteContext'
import './siteTheme.css'
import { useSiteFont } from './siteFont'

const INSTALL_DISMISS_KEY = 'site_install_dismissed'

function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector(selector) as HTMLElement | null
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  const prev = el.getAttribute(attr) || ''
  el.setAttribute(attr, value)
  return () => el?.setAttribute(attr, prev)
}

/** Troca título, manifest, ícone e cor do navegador para os da igreja (e devolve ao sair). */
function useSiteHead(site: PublicSite | null, slug: string) {
  useEffect(() => {
    if (!site) return
    const prevTitle = document.title
    document.title = site.title
    const color = validColor(site.primary_color, DEFAULT_PRIMARY)
    const undo = [
      setMeta(
        'link[rel="manifest"]',
        () => Object.assign(document.createElement('link'), { rel: 'manifest' }),
        'href',
        siteManifestUrl(slug),
      ),
      setMeta(
        'meta[name="theme-color"]',
        () =>
          Object.assign(document.createElement('meta'), {
            name: 'theme-color',
          }),
        'content',
        color,
      ),
      setMeta(
        'meta[name="apple-mobile-web-app-title"]',
        () =>
          Object.assign(document.createElement('meta'), {
            name: 'apple-mobile-web-app-title',
          }),
        'content',
        site.short_name || site.title,
      ),
      setMeta(
        'meta[name="apple-mobile-web-app-status-bar-style"]',
        () =>
          Object.assign(document.createElement('meta'), {
            name: 'apple-mobile-web-app-status-bar-style',
          }),
        'content',
        'black-translucent',
      ),
      setMeta(
        'meta[name="description"]',
        () =>
          Object.assign(document.createElement('meta'), {
            name: 'description',
          }),
        'content',
        site.tagline || site.title,
      ),
    ]
    if (site.icon_url) {
      undo.push(
        setMeta(
          'link[rel="apple-touch-icon"]',
          () =>
            Object.assign(document.createElement('link'), {
              rel: 'apple-touch-icon',
            }),
          'href',
          siteFileUrl(site.icon_url),
        ),
      )
    }
    return () => {
      document.title = prevTitle
      undo.reverse().forEach((f) => f())
    }
  }, [site, slug])
}

export function SiteLogo({ site, className }: { site: PublicSite; className?: string }) {
  if (site.logo_url) {
    return (
      <img
        src={siteFileUrl(site.logo_url)}
        alt=""
        className={cn('rounded-full bg-white object-contain p-0.5', className)}
      />
    )
  }
  const initials = (site.short_name || site.title)
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className={cn(
        'grid place-items-center rounded-full bg-white font-bold text-[var(--sp)]',
        className,
      )}
    >
      {initials || '✝'}
    </span>
  )
}

const TABS = [
  { path: '', label: 'Início', icon: House, section: null },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays, section: 'agenda' },
  {
    path: '/assistir',
    label: 'Assistir',
    icon: PlayCircle,
    section: 'assistir',
  },
  {
    path: '/contribuir',
    label: 'Contribuir',
    icon: HeartHandshake,
    section: 'contribuir',
  },
  { path: '/eu', label: 'Eu', icon: UserRound, section: null },
] as const

export default function PublicSiteLayout() {
  const [params] = useSearchParams()
  const slug = (params.get('s') || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
  const [site, setSite] = useState<PublicSite | null>(null)
  const [error, setError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [installHint, setInstallHint] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let alive = true
    getPublicSite(slug || undefined)
      .then((s) => {
        if (!alive) return
        setSite({
          ...s,
          sections: withDefaults(s.sections),
          service_times: cleanServiceTimes(s.service_times),
        })
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [slug])

  useSiteHead(site, slug)
  useSiteFont()

  // Fundo cinza claro também atrás da página (rolagem elástica do iPhone)
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#f1f3f6'
    return () => {
      document.body.style.background = prev
    }
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (!isIos() || isStandalone()) return
    let dismissed = false
    try {
      dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === '1'
    } catch (_) {
      // sem armazenamento: mostra o aviso
    }
    setInstallHint(!dismissed)
  }, [])

  const ctx = useMemo<SiteCtx | null>(() => {
    if (!site) return null
    const to = (path: string) => `/igreja${path}${slug ? `?s=${slug}` : ''}`
    return { site, slug, to }
  }, [site, slug])

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f1f3f6] p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-800">Site não encontrado</p>
          <p className="mt-1 text-sm text-slate-500">
            O site da igreja ainda não foi publicado ou o endereço está errado.
          </p>
        </div>
      </div>
    )
  }
  if (!site || !ctx) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f1f3f6]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const primary = validColor(site.primary_color, DEFAULT_PRIMARY)
  const accent = validColor(site.accent_color, DEFAULT_ACCENT)
  const style = {
    '--sp': primary,
    '--sa': accent,
    '--sp-text': contrastText(primary),
    '--sa-text': contrastText(accent),
  } as CSSProperties
  const tabs = TABS.filter((t) => !t.section || site.sections[t.section])
  const isTab = (p: string) => {
    const full = `/igreja${p}`
    return p === ''
      ? location.pathname === '/igreja' || location.pathname === '/igreja/'
      : location.pathname.startsWith(full)
  }
  const navLinks = [
    ...tabs
      .filter((t) => t.path !== '/eu')
      .map((t) => ({
        to: ctx.to(t.path),
        label: t.label,
        active: isTab(t.path),
      })),
    ...(site.sections.biblia
      ? [{ to: ctx.to('/biblia'), label: 'Bíblia', active: isTab('/biblia') }]
      : []),
    ...(site.sections.hinario && site.hymnals?.length
      ? [
          {
            to: ctx.to('/hinario'),
            label: 'Hinário',
            active: isTab('/hinario'),
          },
        ]
      : []),
    ...site.pages.map((p) => ({
      to: ctx.to(`/p/${p.slug}`),
      label: p.title,
      active: location.pathname === `/igreja/p/${p.slug}`,
    })),
    ...(site.sections.oracao
      ? [
          {
            to: ctx.to('/oracao'),
            label: 'Pedido de oração',
            active: isTab('/oracao'),
          },
        ]
      : []),
  ]
  const dismissInstall = () => {
    setInstallHint(false)
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1')
    } catch (_) {
      // ignora
    }
  }

  const map = mapsUrl(site.address, site.maps_url)
  const isHome = location.pathname === '/igreja' || location.pathname === '/igreja/'
  const menuGroups: { title: string; items: MenuItem[] }[] = [
    {
      title: 'A igreja',
      items: [
        ...site.pages.map((p) => ({
          to: ctx.to(`/p/${p.slug}`),
          label: p.title,
          icon: FileText,
        })),
        ...(site.sections.novo && site.signup_url
          ? [{ to: site.signup_url, label: 'Sou novo aqui', icon: Sparkles }]
          : []),
        ...(map
          ? [
              {
                href: map,
                label: 'Como chegar',
                icon: MapPin,
                hint: site.address,
              },
            ]
          : []),
        ...(site.sections.oracao
          ? [{ to: ctx.to('/oracao'), label: 'Pedido de oração', icon: Heart }]
          : []),
      ],
    },
    {
      title: 'Para o dia a dia',
      items: [
        ...(site.sections.biblia
          ? [{ to: ctx.to('/biblia'), label: 'Bíblia', icon: BookOpen }]
          : []),
        ...(site.sections.hinario && site.hymnals?.length
          ? [
              {
                to: ctx.to('/hinario'),
                label: 'Hinário',
                icon: Music,
                hint: site.hymnals.map((h) => h.name).join(' · '),
              },
            ]
          : []),
        ...tabs
          .filter((t) => t.path && t.path !== '/eu')
          .map((t) => ({ to: ctx.to(t.path), label: t.label, icon: t.icon })),
        { to: ctx.to('/instalar'), label: 'Instalar o app', icon: Share },
        { to: ctx.to('/eu'), label: 'Entrar', icon: LogIn },
      ],
    },
  ].filter((g) => g.items.length > 0)

  return (
    <div style={style} className="site-c min-h-screen">
      {/* Topo: transparente sobre a foto no Início (celular); claro nas outras telas */}
      <header
        className={cn(
          'z-30 lg:sticky lg:top-0 lg:border-b lg:border-[var(--c-line)] lg:bg-white/95 lg:text-[var(--c-ink)] lg:backdrop-blur',
          isHome
            ? 'absolute inset-x-0 top-0 text-white'
            : 'sticky top-0 bg-[color-mix(in_srgb,var(--c-bg)_92%,transparent)] backdrop-blur',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 lg:h-20 lg:px-8">
          <Link to={ctx.to('')} className="flex min-w-0 items-center gap-2.5">
            <SiteLogo site={site} className="h-10 w-10 shrink-0 lg:h-11 lg:w-11" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[18px] font-extrabold tracking-wide">
                {site.short_name || site.title}
              </span>
              {site.tagline && (
                <span className="hidden truncate text-xs text-[var(--c-gray)] lg:block">
                  {site.tagline}
                </span>
              )}
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-[14px] font-bold lg:flex">
            {navLinks.slice(0, 8).map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  'whitespace-nowrap border-b-2 pb-1 transition',
                  l.active
                    ? 'border-[var(--c-navy)] text-[var(--c-navy)]'
                    : 'border-transparent text-[var(--c-gray)] hover:text-[var(--c-navy)]',
                )}
              >
                {l.label}
              </Link>
            ))}
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--c-navy)] px-5 py-2.5 text-[var(--sp-text)]"
            >
              <LogIn className="h-4 w-4" /> Entrar
            </Link>
          </nav>
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setMenuOpen(true)}
            className={cn(
              'ml-auto grid h-10 w-10 place-items-center rounded-full lg:hidden',
              isHome
                ? 'bg-white/15 backdrop-blur'
                : 'bg-white shadow-[0_2px_8px_rgba(20,34,58,0.06)]',
            )}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[var(--c-bg)] pb-10 lg:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          role="dialog"
          aria-label="Menu"
        >
          <div className="flex items-center gap-3 px-5 pb-4 pt-4">
            <SiteLogo site={site} className="h-12 w-12" />
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-[18px] font-extrabold">
                {site.short_name || site.title}
              </b>
              {site.title !== (site.short_name || site.title) && (
                <span className="block truncate text-[12.5px] font-medium text-[var(--c-gray)]">
                  {site.title}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setMenuOpen(false)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {menuGroups.map((g) => (
            <div key={g.title}>
              <p className="mx-5 mb-2.5 mt-2 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[var(--c-gray)]">
                {g.title}
              </p>
              <div className="c-card mx-4 mb-4 divide-y divide-[#eef1f5] py-1">
                {g.items.map((it) => (
                  <MenuRow key={it.label} item={it} onClose={() => setMenuOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <main className="mx-auto max-w-6xl pb-32 lg:pb-16">
        <Outlet context={ctx} />
      </main>

      <SiteFooter site={site} />

      {installHint && !location.pathname.startsWith('/igreja/instalar') && (
        <div
          className="fixed inset-x-4 z-30 flex items-center gap-3 rounded-2xl bg-[var(--c-navy)] px-4 py-3 text-sm text-[var(--sp-text)] shadow-[0_12px_28px_rgba(20,34,58,0.25)] lg:hidden"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}
        >
          <Share className="h-4 w-4 shrink-0" />
          <Link to={ctx.to('/instalar')} className="min-w-0 flex-1 font-bold">
            Ponha o app da igreja na tela de início
          </Link>
          <button type="button" aria-label="Fechar" onClick={dismissInstall} className="p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Abas do app (celular): barra flutuante, a aba atual vira pílula com o nome */}
      <nav
        className="fixed inset-x-[18px] z-30 lg:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}
      >
        <div className="mx-auto flex h-16 max-w-md items-center justify-between rounded-full border border-[var(--c-line)] bg-white/95 px-2 shadow-[0_14px_34px_rgba(20,34,58,0.18)] backdrop-blur">
          {tabs.map((t) => {
            const Icon = t.icon
            const on = isTab(t.path)
            return (
              <NavLink
                key={t.path}
                to={ctx.to(t.path)}
                aria-label={t.label}
                className={cn(
                  'flex h-12 items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-all',
                  on ? 'bg-[var(--c-navy)] px-[18px] text-[var(--sp-text)]' : 'w-12 text-[#8a93a3]',
                )}
              >
                <Icon className="h-5 w-5" />
                {on && t.label}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

interface MenuItem {
  to?: string
  href?: string
  label: string
  icon: typeof House
  hint?: string
}

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const Icon = item.icon
  const inner = (
    <>
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-[var(--c-sky)] text-[var(--c-blue)]">
        <Icon className="h-[19px] w-[19px]" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-bold">{item.label}</span>
      {item.hint ? (
        <span className="max-w-[45%] truncate text-[12px] font-semibold text-[var(--c-gray)]">
          {item.hint}
        </span>
      ) : (
        <ChevronRight className="h-[18px] w-[18px] text-[#b3bbc7]" />
      )}
    </>
  )
  const cls = 'flex items-center gap-3.5 px-4 py-3'
  return item.href ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={cls} onClick={onClose}>
      {inner}
    </a>
  ) : (
    <Link to={item.to!} className={cls} onClick={onClose}>
      {inner}
    </Link>
  )
}

function SiteFooter({ site }: { site: PublicSite }) {
  const map = mapsUrl(site.address, site.maps_url)
  const wa = whatsappUrl(site.whatsapp)
  return (
    <footer className="hidden bg-[var(--sp)] text-[var(--sp-text)] lg:block">
      <div className="mx-auto grid max-w-6xl grid-cols-4 gap-8 px-8 py-10 text-sm">
        <div>
          <div className="flex items-center gap-3">
            <SiteLogo site={site} className="h-10 w-10" />
            <span className="font-semibold">{site.title}</span>
          </div>
          {(site.footer_text || site.tagline) && (
            <p className="mt-3 opacity-75">{site.footer_text || site.tagline}</p>
          )}
        </div>
        {site.service_times.length > 0 && (
          <div>
            <p className="mb-2 font-semibold">Cultos</p>
            <ul className="space-y-1 opacity-80">
              {site.service_times.map((t, i) => (
                <li key={i}>
                  {WEEKDAYS[t.day]} · {t.label} {formatTime(t.time)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {site.address && (
          <div>
            <p className="mb-2 font-semibold">Endereço</p>
            <p className="opacity-80">{site.address}</p>
            {map && (
              <a
                href={map}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[var(--sa)]"
              >
                <MapPin className="h-4 w-4" /> Como chegar
              </a>
            )}
          </div>
        )}
        <div>
          <p className="mb-2 font-semibold">Contato</p>
          <ul className="space-y-1.5 opacity-80">
            {site.phone && (
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> {site.phone}
              </li>
            )}
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> WhatsApp
                </a>
              </li>
            )}
            {site.email && (
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> {site.email}
              </li>
            )}
            {site.instagram && (
              <li>
                <a
                  href={instagramUrl(site.instagram)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                >
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              </li>
            )}
            {site.facebook && (
              <li>
                <a
                  href={facebookUrl(site.facebook)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                >
                  <span className="w-4 text-center font-bold">f</span> Facebook
                </a>
              </li>
            )}
            {site.youtube && (
              <li>
                <a
                  href={youtubeUrl(site.youtube)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                >
                  <Youtube className="h-4 w-4" /> YouTube
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </footer>
  )
}
