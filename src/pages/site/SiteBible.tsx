// Aba Bíblia do site/app da igreja: livros, capítulos, leitura, busca por referência ou palavra.
// Texto da Bíblia Livre (CC BY 4.0), servido como arquivo estático (public/biblia/blivre).
// Outras versões (NVI, ARA...) abrem no Bible.com: o texto delas tem dono.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  Search,
  Share2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BIBLE_BOOKS,
  BIBLE_CREDIT,
  OTHER_VERSIONS,
  bibleComUrl,
  findBook,
  loadBook,
  parseRef,
  searchBible,
  verseParts,
  type BibleBook,
  type SearchHit,
} from '@/lib/bible'
import { useSite } from './siteContext'
import { Card, SectionTitle } from './siteParts'

const LAST_KEY = 'site_bible_last'
const SIZE_KEY = 'site_bible_size'
const SIZES = ['text-[16px]', 'text-[18px]', 'text-[20px]', 'text-[23px]']

function readStore(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch (_) {
    return ''
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch (_) {
    // sem armazenamento: só não lembra
  }
}

function VerseText({ text }: { text: string }) {
  return (
    <>
      {verseParts(text).map((p, i) =>
        p.added ? (
          <i key={i} className="text-slate-500">
            {p.text}
          </i>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

export default function SiteBible() {
  const { book: bookParam = '', chapter: chapterParam = '' } = useParams()
  const book = bookParam ? findBook(bookParam) : undefined
  const chapter = Number(chapterParam) || 0

  return (
    <div className="space-y-5 px-4 pt-5 lg:px-8 lg:pt-10">
      {book && chapter >= 1 && chapter <= book.chapters ? (
        <Reader book={book} chapter={chapter} />
      ) : book ? (
        <Chapters book={book} />
      ) : (
        <Home />
      )}
      <p className="mx-auto max-w-2xl pb-4 text-center text-[11px] leading-relaxed text-slate-400">
        {BIBLE_CREDIT}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- Início: busca e livros

function Home() {
  const { to } = useSite()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState('')
  const last = useMemo(() => {
    const [code, ch] = readStore(LAST_KEY).split(':')
    const b = code ? findBook(code) : undefined
    const n = Number(ch)
    return b && n >= 1 && n <= b.chapters ? { book: b, chapter: n } : null
  }, [])
  const ref = parseRef(query)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    const r = parseRef(q)
    if (r) {
      navigate(to(`/biblia/${r.book.code}/${r.chapter}`) + (r.verse ? `#v${r.verse}` : ''))
      return
    }
    setSearching(true)
    setSearched(q)
    try {
      setHits(await searchBible(q))
    } catch (_) {
      setHits([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <>
      <SectionTitle>Bíblia</SectionTitle>
      <form onSubmit={submit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!e.target.value) setHits(null)
          }}
          enterKeyHint="search"
          placeholder="Jo 3:16, Salmos 23 ou uma palavra"
          className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 pl-12 pr-32 text-[16px] outline-none focus:border-[var(--sa)]"
        />
        {query && (
          <button
            type="button"
            aria-label="Limpar"
            onClick={() => {
              setQuery('')
              setHits(null)
            }}
            className="absolute right-[6.4rem] top-1/2 -translate-y-1/2 p-1 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-[var(--sp)] px-3.5 py-2 text-sm font-semibold text-[var(--sp-text)]"
        >
          {ref ? 'Abrir' : 'Buscar'}
        </button>
      </form>

      {searching ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Buscando em toda a Bíblia...
        </div>
      ) : hits ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {hits.length === 0
              ? `Nada encontrado para "${searched}".`
              : `${hits.length >= 100 ? 'Os primeiros 100' : hits.length} versículo${hits.length === 1 ? '' : 's'} com "${searched}"`}
          </p>
          {hits.map((h) => (
            <Link
              key={`${h.book.code}${h.chapter}:${h.verse}`}
              to={to(`/biblia/${h.book.code}/${h.chapter}`) + `#v${h.verse}`}
              className="block rounded-2xl border border-stone-200 bg-white p-4"
            >
              <span className="block text-sm font-bold text-[var(--sp)]">
                {h.book.name} {h.chapter}:{h.verse}
              </span>
              <span className="mt-1 block text-[15px] leading-relaxed text-slate-700">
                <VerseText text={h.text} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <>
          {last && (
            <Link
              to={to(`/biblia/${last.book.code}/${last.chapter}`)}
              className="flex items-center gap-3 rounded-2xl bg-[var(--sp)] p-4 text-[var(--sp-text)]"
            >
              <span className="flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wide opacity-70">
                  Continuar lendo
                </span>
                <span className="block font-serif text-lg font-bold">
                  {last.book.name} {last.chapter}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 opacity-70" />
            </Link>
          )}
          <BookGrid title="Antigo Testamento" books={BIBLE_BOOKS.filter((b) => !b.nt)} />
          <BookGrid title="Novo Testamento" books={BIBLE_BOOKS.filter((b) => b.nt)} />
        </>
      )}
    </>
  )
}

function BookGrid({ title, books }: { title: string; books: BibleBook[] }) {
  const { to } = useSite()
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {books.map((b) => (
          <Link
            key={b.code}
            to={to(`/biblia/${b.code}`)}
            className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5"
          >
            <span className="grid h-8 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-[12px] font-bold text-[var(--sp)]">
              {b.abbr}
            </span>
            <span className="truncate text-[15px] font-medium">{b.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Capítulos de um livro

function Chapters({ book }: { book: BibleBook }) {
  const { to } = useSite()
  return (
    <>
      <Link
        to={to('/biblia')}
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500"
      >
        <ArrowLeft className="h-4 w-4" /> Livros
      </Link>
      <SectionTitle>{book.name}</SectionTitle>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-12">
        {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
          <Link
            key={n}
            to={to(`/biblia/${book.code}/${n}`)}
            className="grid h-12 place-items-center rounded-xl border border-stone-200 bg-white text-[15px] font-semibold"
          >
            {n}
          </Link>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Leitura

function Reader({ book, chapter }: { book: BibleBook; chapter: number }) {
  const { to } = useSite()
  const location = useLocation()
  const [verses, setVerses] = useState<string[] | null>(null)
  const [error, setError] = useState(false)
  const [size, setSize] = useState(() => {
    const n = Number(readStore(SIZE_KEY))
    return n >= 0 && n < SIZES.length ? n : 1
  })
  const [selected, setSelected] = useState<number[]>([])
  const [copied, setCopied] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const target = /^#v(\d+)$/.exec(location.hash)?.[1]
  const scrolled = useRef('')

  useEffect(() => {
    let alive = true
    setVerses(null)
    setError(false)
    setSelected([])
    loadBook(book.code)
      .then((chs) => alive && setVerses(chs[chapter - 1] || []))
      .catch(() => alive && setError(true))
    writeStore(LAST_KEY, `${book.code}:${chapter}`)
    return () => {
      alive = false
    }
  }, [book.code, chapter])

  // Vai até o versículo pedido (#v16) quando o capítulo carrega
  useEffect(() => {
    const key = `${book.code}${chapter}${target}`
    if (!verses || !target || scrolled.current === key) return
    scrolled.current = key
    const el = document.getElementById(`v${target}`)
    if (el) el.scrollIntoView({ block: 'center' })
  }, [verses, target, book.code, chapter])

  const idx = BIBLE_BOOKS.indexOf(book)
  const prev =
    chapter > 1
      ? { book, chapter: chapter - 1 }
      : idx > 0
        ? { book: BIBLE_BOOKS[idx - 1], chapter: BIBLE_BOOKS[idx - 1].chapters }
        : null
  const next =
    chapter < book.chapters
      ? { book, chapter: chapter + 1 }
      : idx < BIBLE_BOOKS.length - 1
        ? { book: BIBLE_BOOKS[idx + 1], chapter: 1 }
        : null

  const changeSize = (d: number) => {
    const n = Math.max(0, Math.min(SIZES.length - 1, size + d))
    setSize(n)
    writeStore(SIZE_KEY, String(n))
  }

  const toggle = (n: number) =>
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort((a, b) => a - b)))

  const selectedText = () => {
    if (!verses || !selected.length) return ''
    const body = selected.map((n) => `${n} ${verses[n - 1].replace(/[[\]]/g, '')}`).join(' ')
    // 1, 2, 3, 5 -> "1-3,5"
    const ranges: string[] = []
    for (let i = 0; i < selected.length; i++) {
      let j = i
      while (j + 1 < selected.length && selected[j + 1] === selected[j] + 1) j++
      ranges.push(j > i ? `${selected[i]}-${selected[j]}` : String(selected[i]))
      i = j
    }
    return `${body}\n${book.name} ${chapter}:${ranges.join(',')} (BLIVRE)`
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (_) {
      // sem acesso à área de transferência
    }
  }
  const share = async () => {
    const text = selectedText()
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch (_) {
        // cancelado
      }
    } else {
      copy()
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link
          to={to(`/biblia/${book.code}`)}
          className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-slate-500"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">Capítulos</span>
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setVersionsOpen((v) => !v)}
              className="h-9 rounded-full border border-stone-200 bg-white px-3 text-sm font-semibold"
            >
              Outras versões
            </button>
            {versionsOpen && (
              <div className="absolute right-0 top-11 z-20 w-56 rounded-2xl border border-stone-200 bg-white p-2 shadow-lg">
                <p className="px-2 pb-1 pt-1 text-xs text-slate-500">Abre no Bible.com</p>
                {OTHER_VERSIONS.map((v) => (
                  <a
                    key={v.id}
                    href={bibleComUrl(v.id, book, chapter)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setVersionsOpen(false)}
                    className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium hover:bg-stone-50"
                  >
                    {book.name} {chapter} ({v.label})
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <h2 className="text-center font-serif text-2xl font-bold text-slate-900 lg:text-4xl">
        {book.name} {chapter}
      </h2>

      <Card className="p-5 lg:p-8">
        {error ? (
          <p className="py-8 text-center text-slate-500">
            Não foi possível abrir este capítulo. Confira a internet e tente de novo.
          </p>
        ) : !verses ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <p className={cn('font-serif leading-relaxed text-slate-800', SIZES[size])}>
            {verses.map((t, i) => {
              const n = i + 1
              const on = selected.includes(n)
              return (
                <span
                  key={n}
                  id={`v${n}`}
                  onClick={() => toggle(n)}
                  className={cn(
                    'cursor-pointer rounded decoration-[var(--sa)] decoration-2 underline-offset-4',
                    on && 'underline',
                    String(n) === target && !selected.length && 'bg-amber-100',
                  )}
                >
                  <sup className="mr-1 select-none font-sans text-[0.62em] font-bold text-[var(--sa)]">
                    {n}
                  </sup>
                  <VerseText text={t} />{' '}
                </span>
              )
            })}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {prev ? (
          <Link
            to={to(`/biblia/${prev.book.code}/${prev.chapter}`)}
            className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3 text-sm font-semibold"
          >
            <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" />
            <span className="truncate">
              {prev.book.name} {prev.chapter}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={to(`/biblia/${next.book.code}/${next.chapter}`)}
            className="flex items-center justify-end gap-2 rounded-2xl border border-stone-200 bg-white p-3 text-right text-sm font-semibold"
          >
            <span className="truncate">
              {next.book.name} {next.chapter}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </Link>
        ) : (
          <span />
        )}
      </div>

      {selected.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-8"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center gap-1 rounded-full bg-slate-900 p-1.5 pl-4 text-white shadow-xl">
            <span className="mr-2 text-sm font-semibold">
              {selected.length} versículo{selected.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold hover:bg-white/10"
            >
              <Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button
              type="button"
              onClick={share}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            >
              <Share2 className="h-4 w-4" /> Enviar
            </button>
            <button
              type="button"
              aria-label="Limpar seleção"
              onClick={() => setSelected([])}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
