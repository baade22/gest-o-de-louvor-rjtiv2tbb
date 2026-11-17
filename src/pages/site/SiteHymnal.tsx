// Aba Hinário do site/app da igreja: índice (por hinário, busca por número ou título) e a letra.
// Os hinos são os que a igreja cadastrou no painel Site e App › Hinário (migração 0103).

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Music,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fold } from '@/lib/bible'
import {
  getPublicHymn,
  getPublicHymns,
  type PublicHymn,
  type PublicHymnIndex,
} from '@/services/site'
import { useSite } from './siteContext'
import { Card, PageTitle } from './siteParts'

const SIZE_KEY = 'site_hymn_size'
const SIZES = ['text-[16px]', 'text-[18px]', 'text-[21px]', 'text-[24px]']
const TAB_KEY = 'site_hymnal_tab'

function store(key: string, value?: string): string {
  try {
    if (value !== undefined) localStorage.setItem(key, value)
    return localStorage.getItem(key) || ''
  } catch (_) {
    return ''
  }
}

// O índice muda pouco: guarda na memória enquanto o app está aberto
let indexCache: { slug: string; data: PublicHymnIndex } | null = null

function useHymnIndex(slug: string) {
  const [data, setData] = useState<PublicHymnIndex | null>(
    indexCache && indexCache.slug === slug ? indexCache.data : null,
  )
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    getPublicHymns(slug || undefined)
      .then((d) => {
        indexCache = { slug, data: d }
        if (alive) setData(d)
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [slug])
  return { data, error }
}

export default function SiteHymnal() {
  const { id = '' } = useParams()
  return (
    <div className="space-y-5 px-4 pt-2 lg:px-8 lg:pt-10">{id ? <Hymn id={id} /> : <Index />}</div>
  )
}

function Index() {
  const { slug, to } = useSite()
  const { data, error } = useHymnIndex(slug)
  const [tab, setTab] = useState(() => store(TAB_KEY))
  const [query, setQuery] = useState('')

  const hymnals = data?.hymnals || []
  const current = hymnals.find((h) => h.name === tab) || hymnals[0]

  const list = useMemo(() => {
    if (!current) return []
    const q = query.trim()
    if (!q) return current.hymns
    if (/^\d+$/.test(q)) return current.hymns.filter((h) => String(h.number).startsWith(q))
    const k = fold(q)
    return current.hymns.filter((h) => fold(h.title).includes(k))
  }, [current, query])

  if (error)
    return (
      <p className="pt-10 text-center text-[var(--c-gray)]">Não foi possível abrir o hinário.</p>
    )
  if (!data)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--c-gray)]" />
      </div>
    )

  return (
    <>
      <PageTitle>Hinário</PageTitle>
      {!hymnals.length ? (
        <Card className="p-8 text-center text-[var(--c-gray)]">Nenhum hino cadastrado ainda.</Card>
      ) : (
        <>
          {hymnals.length > 1 && (
            <div className="flex rounded-full bg-[#e3e8ef] p-1">
              {hymnals.map((h) => (
                <button
                  key={h.name}
                  type="button"
                  onClick={() => {
                    setTab(h.name)
                    store(TAB_KEY, h.name)
                    setQuery('')
                  }}
                  className={cn(
                    'h-[38px] min-w-0 flex-1 truncate rounded-full px-3 text-[13.5px] font-extrabold',
                    current?.name === h.name
                      ? 'bg-white text-[var(--c-navy)] shadow-[0_2px_6px_rgba(20,34,58,0.08)]'
                      : 'text-[var(--c-gray)]',
                  )}
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--c-gray)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Número ou título no ${current?.name || 'hinário'}`}
              inputMode="search"
              className="c-card w-full border border-transparent py-3.5 pl-12 pr-10 text-[16px] outline-none focus:border-[var(--c-blue)]"
            />
            {query && (
              <button
                type="button"
                aria-label="Limpar"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--c-gray)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--c-gray)]">
              Nenhum hino com "{query}".
            </p>
          ) : (
            <Card className="divide-y divide-[#eef1f5] p-0">
              {list.map((h) => (
                <Link
                  key={h.id}
                  to={to(`/hinario/${h.id}`)}
                  className="flex items-center gap-3.5 px-3.5 py-[11px]"
                >
                  <span className="grid h-[42px] min-w-[42px] shrink-0 place-items-center rounded-full bg-[var(--c-sky)] px-2 text-[14px] font-extrabold text-[var(--c-navy)]">
                    {h.number || <Music className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{h.title}</span>
                  <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#b3bbc7]" />
                </Link>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  )
}

/** Linha que é só um rótulo de parte ("[Coro]", "Refrão:", "Coro") vira título pequeno. */
function isLabel(line: string) {
  const t = line.trim()
  return (
    /^\[[^\]]{1,30}\]$/.test(t) ||
    /^(coro|refr[aã]o|estrofe|verso|ponte|final)\s*\d*\s*:?$/i.test(t)
  )
}

function Hymn({ id }: { id: string }) {
  const { slug, to } = useSite()
  const { data } = useHymnIndex(slug)
  const [hymn, setHymn] = useState<PublicHymn | null>(null)
  const [error, setError] = useState(false)
  const [size, setSize] = useState(() => {
    const n = Number(store(SIZE_KEY))
    return n >= 0 && n < SIZES.length ? n : 1
  })

  useEffect(() => {
    let alive = true
    setHymn(null)
    setError(false)
    getPublicHymn(id, slug || undefined)
      .then((h) => alive && setHymn(h))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [id, slug])

  const siblings = data?.hymnals.find((h) => h.name === hymn?.hymnal)?.hymns || []
  const at = siblings.findIndex((h) => h.id === id)
  const prev = at > 0 ? siblings[at - 1] : null
  const next = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null

  const changeSize = (d: number) => {
    const n = Math.max(0, Math.min(SIZES.length - 1, size + d))
    setSize(n)
    store(SIZE_KEY, String(n))
  }

  const stanzas = (hymn?.lyrics || '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((s) => s.split('\n').filter((l) => l.trim()))
    .filter((s) => s.length)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link
          to={to('/hinario')}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--c-gray)]"
        >
          <ArrowLeft className="h-4 w-4" /> Hinário
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Diminuir letra"
            onClick={() => changeSize(-1)}
            disabled={size === 0}
            className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(20,34,58,0.06)] disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Aumentar letra"
            onClick={() => changeSize(1)}
            disabled={size === SIZES.length - 1}
            className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(20,34,58,0.06)] disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? (
        <p className="pt-10 text-center text-[var(--c-gray)]">Hino não encontrado.</p>
      ) : !hymn ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--c-gray)]" />
        </div>
      ) : (
        <>
          <div className="px-1">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--c-blue)]">
              {hymn.hymnal}
              {hymn.number ? ` · Hino ${hymn.number}` : ''}
            </p>
            <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight lg:text-4xl">
              {hymn.title}
            </h2>
          </div>
          <div className="space-y-[18px] px-1">
            {stanzas.length ? (
              stanzas.map((lines, i) => {
                const chorus = isLabel(lines[0] || '') && /coro|refr/i.test(lines[0])
                return (
                  <div
                    key={i}
                    className={cn(
                      'font-semibold leading-[1.6] text-[#253247]',
                      SIZES[size],
                      chorus &&
                        'rounded-[18px] border-l-4 border-[var(--c-blue)] bg-white px-4 py-3.5 text-[var(--c-navy)]',
                    )}
                  >
                    {lines.map((l, j) =>
                      isLabel(l) ? (
                        <p
                          key={j}
                          className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#9aa6b6]"
                        >
                          {l.replace(/^\[|\]$|:$/g, '')}
                        </p>
                      ) : (
                        <p key={j}>{l}</p>
                      ),
                    )}
                  </div>
                )
              })
            ) : (
              <Card className="text-center text-[var(--c-gray)]">
                A letra deste hino ainda não foi cadastrada.
              </Card>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {prev ? (
              <Link
                to={to(`/hinario/${prev.id}`)}
                className="flex items-center gap-2 c-card p-3 text-sm font-semibold"
              >
                <ChevronLeft className="h-5 w-5 shrink-0 text-[var(--c-gray)]" />
                <span className="truncate">
                  {prev.number ? `${prev.number}. ` : ''}
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to={to(`/hinario/${next.id}`)}
                className="flex items-center justify-end gap-2 c-card p-3 text-right text-sm font-semibold"
              >
                <span className="truncate">
                  {next.number ? `${next.number}. ` : ''}
                  {next.title}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[var(--c-gray)]" />
              </Link>
            ) : (
              <span />
            )}
          </div>
        </>
      )}
    </div>
  )
}
