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
import { Card, SectionTitle } from './siteParts'

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
    <div className="space-y-5 px-4 pt-5 lg:px-8 lg:pt-10">{id ? <Hymn id={id} /> : <Index />}</div>
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
    return <p className="pt-10 text-center text-slate-500">Não foi possível abrir o hinário.</p>
  if (!data)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )

  return (
    <>
      <SectionTitle>Hinário</SectionTitle>
      {!hymnals.length ? (
        <Card className="p-8 text-center text-slate-500">Nenhum hino cadastrado ainda.</Card>
      ) : (
        <>
          {hymnals.length > 1 && (
            <div className="flex flex-wrap gap-2">
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
                    'rounded-full border px-4 py-2 text-sm font-semibold',
                    current?.name === h.name
                      ? 'border-[var(--sp)] bg-[var(--sp)] text-[var(--sp-text)]'
                      : 'border-stone-200 bg-white text-slate-700',
                  )}
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Número ou título no ${current?.name || 'hinário'}`}
              inputMode="search"
              className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 pl-12 pr-10 text-[16px] outline-none focus:border-[var(--sa)]"
            />
            {query && (
              <button
                type="button"
                aria-label="Limpar"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nenhum hino com "{query}".</p>
          ) : (
            <Card className="divide-y divide-stone-100 p-0">
              {list.map((h) => (
                <Link
                  key={h.id}
                  to={to(`/hinario/${h.id}`)}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="grid h-10 min-w-[2.75rem] shrink-0 place-items-center rounded-xl bg-stone-100 px-2 text-[15px] font-extrabold text-[var(--sp)]">
                    {h.number || <Music className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{h.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
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
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" /> Hinário
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Diminuir letra"
            onClick={() => changeSize(-1)}
            disabled={size === 0}
            className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Aumentar letra"
            onClick={() => changeSize(1)}
            disabled={size === SIZES.length - 1}
            className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? (
        <p className="pt-10 text-center text-slate-500">Hino não encontrado.</p>
      ) : !hymn ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--sa)]">
              {hymn.hymnal}
            </p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-slate-900 lg:text-4xl">
              {hymn.number ? `${hymn.number}. ` : ''}
              {hymn.title}
            </h2>
          </div>
          <Card className="space-y-5 p-5 text-center lg:p-8">
            {stanzas.length ? (
              stanzas.map((lines, i) => (
                <div key={i} className={cn('leading-relaxed text-slate-800', SIZES[size])}>
                  {lines.map((l, j) =>
                    isLabel(l) ? (
                      <p
                        key={j}
                        className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400"
                      >
                        {l.replace(/^\[|\]$|:$/g, '')}
                      </p>
                    ) : (
                      <p key={j}>{l}</p>
                    ),
                  )}
                </div>
              ))
            ) : (
              <p className="text-slate-500">A letra deste hino ainda não foi cadastrada.</p>
            )}
          </Card>
          <div className="grid grid-cols-2 gap-3">
            {prev ? (
              <Link
                to={to(`/hinario/${prev.id}`)}
                className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3 text-sm font-semibold"
              >
                <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" />
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
                className="flex items-center justify-end gap-2 rounded-2xl border border-stone-200 bg-white p-3 text-right text-sm font-semibold"
              >
                <span className="truncate">
                  {next.number ? `${next.number}. ` : ''}
                  {next.title}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
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
