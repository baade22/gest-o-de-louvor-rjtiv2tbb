// Página do site (Quem somos, Ministérios...): capa com foto e conteúdo em blocos (texto, título,
// foto, galeria, vídeo, botão e pessoa). Página antiga, sem blocos, usa o texto com # e -.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, Play, Share2, X } from 'lucide-react'
import { parseBlocks } from '@/lib/site'
import { getPublicPage, siteFileUrl, type PublicPage, type PublicPageBlock } from '@/services/site'
import { useSite } from './siteContext'
import { SmartLink } from './siteParts'

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {parseBlocks(text).map((b, i) =>
        b.kind === 'h' ? (
          <h2 key={i} className="pt-2 text-[20px] font-extrabold tracking-tight lg:text-2xl">
            {b.text}
          </h2>
        ) : b.kind === 'ul' ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </>
  )
}

function Video({ id, caption }: { id: string; caption: string }) {
  const [playing, setPlaying] = useState(false)
  return (
    <figure>
      {playing ? (
        <div className="aspect-video overflow-hidden rounded-[20px] bg-black">
          <iframe
            title={caption || 'Vídeo'}
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="relative block aspect-video w-full overflow-hidden rounded-[20px] bg-slate-800"
        >
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[var(--c-navy)]">
            <Play className="ml-1 h-5 w-5 fill-current" />
          </span>
        </button>
      )}
      {caption && <Caption text={caption} />}
    </figure>
  )
}

function Caption({ text }: { text: string }) {
  return (
    <figcaption className="mt-2 text-[12.5px] font-medium text-[var(--c-gray)]">{text}</figcaption>
  )
}

/** Foto em tela cheia, com setas para a galeria. */
function Viewer({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((v) => (v + 1) % urls.length)
      if (e.key === 'ArrowLeft') setI((v) => (v - 1 + urls.length) % urls.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [urls.length, onClose])
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4"
      role="dialog"
      aria-label="Foto"
      onClick={onClose}
    >
      <img
        src={siteFileUrl(urls[i])}
        alt=""
        className="max-h-[85vh] max-w-full rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"
      >
        <X className="h-5 w-5" />
      </button>
      {urls.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={(e) => {
              e.stopPropagation()
              setI((v) => (v - 1 + urls.length) % urls.length)
            }}
            className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Próxima"
            onClick={(e) => {
              e.stopPropagation()
              setI((v) => (v + 1) % urls.length)
            }}
            className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <p className="absolute bottom-[calc(env(safe-area-inset-bottom)+20px)] text-sm font-bold text-white/80">
            {i + 1} de {urls.length}
          </p>
        </>
      )}
    </div>
  )
}

function Block({ b, onOpen }: { b: PublicPageBlock; onOpen: (urls: string[], i: number) => void }) {
  switch (b.t) {
    case 'h':
      return (
        <h2 className="pt-3 text-[20px] font-extrabold tracking-tight lg:text-2xl">{b.text}</h2>
      )
    case 'text':
      return (
        <div className="space-y-3.5">
          <Paragraphs text={b.text} />
        </div>
      )
    case 'image':
      return (
        <figure>
          <button type="button" className="block w-full" onClick={() => onOpen([b.url], 0)}>
            <img
              src={siteFileUrl(b.url)}
              alt={b.caption}
              loading="lazy"
              className="max-h-[520px] w-full rounded-[20px] object-cover"
            />
          </button>
          {b.caption && <Caption text={b.caption} />}
        </figure>
      )
    case 'gallery': {
      const shown = b.urls.slice(0, 3)
      return (
        <figure>
          <div
            className={
              shown.length === 1
                ? 'grid'
                : shown.length === 2
                  ? 'grid grid-cols-2 gap-2'
                  : 'grid grid-cols-[1.3fr_1fr] grid-rows-[repeat(2,96px)] gap-2 lg:grid-rows-[repeat(2,170px)]'
            }
          >
            {shown.map((u, i) => (
              <button
                key={u}
                type="button"
                onClick={() => onOpen(b.urls, i)}
                className={
                  'relative overflow-hidden rounded-[14px] ' +
                  (shown.length >= 3 && i === 0
                    ? 'row-span-2'
                    : shown.length < 3
                      ? 'h-40 lg:h-64'
                      : '')
                }
              >
                <img
                  src={siteFileUrl(u)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {shown.length >= 3 && i === 2 && b.urls.length > 3 && (
                  <span className="absolute inset-0 grid place-items-center bg-black/45 text-lg font-extrabold text-white">
                    +{b.urls.length - 3}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Caption text={b.caption || `Galeria: toque para ver as ${b.urls.length} fotos`} />
        </figure>
      )
    }
    case 'video':
      return <Video id={b.id} caption={b.caption} />
    case 'button':
      return (
        <SmartLink
          href={b.link}
          className="inline-flex h-[50px] items-center justify-center gap-2 rounded-full bg-[var(--c-navy)] px-6 text-[14px] font-extrabold text-[var(--sp-text)]"
        >
          {b.label} <ChevronRight className="h-4 w-4" />
        </SmartLink>
      )
    case 'person':
      return (
        <div className="flex items-center gap-3.5 rounded-[22px] bg-[var(--c-navy)] p-3.5 text-[var(--sp-text)]">
          {b.url ? (
            <img
              src={siteFileUrl(b.url)}
              alt=""
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/15 text-xl font-extrabold">
              {b.name
                .split(/\s+/)
                .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <b className="block text-[16px] font-extrabold leading-tight">{b.name}</b>
            {b.role && <span className="block text-[13px] font-medium opacity-80">{b.role}</span>}
            {b.text && (
              <span className="mt-1 block text-[13px] font-medium leading-snug opacity-80">
                {b.text}
              </span>
            )}
          </span>
        </div>
      )
    default:
      return null
  }
}

export default function SitePage() {
  const { page = '' } = useParams()
  const { slug, to } = useSite()
  const [data, setData] = useState<PublicPage | null>(null)
  const [missing, setMissing] = useState(false)
  const [viewer, setViewer] = useState<{ urls: string[]; i: number } | null>(null)

  useEffect(() => {
    setData(null)
    setMissing(false)
    getPublicPage(page, slug || undefined)
      .then(setData)
      .catch(() => setMissing(true))
  }, [page, slug])

  if (missing) {
    return (
      <p className="px-4 pt-10 text-center font-medium text-[var(--c-gray)]">
        Página não encontrada.
      </p>
    )
  }
  if (!data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--c-gray)]" />
      </div>
    )
  }
  const cover = siteFileUrl(data.cover_url)
  const blocks = data.blocks || []
  const share = async () => {
    const url = window.location.origin + to(`/p/${data.slug}`)
    try {
      if (navigator.share) await navigator.share({ title: data.title, url })
      else await navigator.clipboard.writeText(url)
    } catch (_) {
      // cancelado
    }
  }

  return (
    <article className="lg:px-8 lg:pt-10">
      {cover ? (
        <header className="relative isolate mx-4 mt-1 h-[260px] overflow-hidden rounded-[28px] text-white lg:mx-0 lg:mt-0 lg:h-[420px] lg:rounded-[32px]">
          <img src={cover} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="c-hero-shade absolute inset-0 -z-10" />
          <div className="absolute inset-x-5 bottom-5 lg:bottom-10 lg:left-10">
            <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-tight lg:text-5xl">
              {data.title}
            </h1>
          </div>
        </header>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-2 lg:px-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight lg:text-4xl">
            {data.title}
          </h1>
        </div>
      )}
      <div
        className={
          'mx-auto max-w-3xl space-y-4 px-5 pb-10 text-[15.5px] font-medium leading-[1.6] text-[#2e3a4e] lg:px-0 lg:text-[17px] ' +
          (cover ? 'pt-6 lg:pt-10' : 'pt-3')
        }
      >
        {blocks.length ? (
          blocks.map((b, i) => (
            <Block key={i} b={b} onOpen={(urls, idx) => setViewer({ urls, i: idx })} />
          ))
        ) : (
          <Paragraphs text={data.body} />
        )}
        <button
          type="button"
          onClick={share}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-[var(--c-navy)]"
        >
          <Share2 className="h-4 w-4" /> Compartilhar esta página
        </button>
      </div>
      {viewer && <Viewer urls={viewer.urls} index={viewer.i} onClose={() => setViewer(null)} />}
    </article>
  )
}
