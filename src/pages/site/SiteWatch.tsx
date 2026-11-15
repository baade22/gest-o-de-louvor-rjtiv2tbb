// Assistir: cultos transmitidos e vídeos do canal do YouTube da igreja (entram sozinhos).

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { serviceNow } from '@/lib/site'
import { getSiteVideos, type SiteVideos } from '@/services/site'
import { useSite } from './siteContext'
import { SectionTitle, VideoTile } from './siteParts'

export default function SiteWatch() {
  const { site, slug } = useSite()
  const [data, setData] = useState<SiteVideos | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'CULTO' | 'VIDEO'>('CULTO')

  useEffect(() => {
    getSiteVideos(slug || undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [slug])

  const live = data?.live || null
  const inService = serviceNow(site.service_times)
  const cultos = (data?.items || []).filter((v) => v.kind === 'CULTO' && !v.live)
  const videos = (data?.items || []).filter((v) => v.kind === 'VIDEO' && !v.live)
  const showTabs = cultos.length > 0 && videos.length > 0
  const list = showTabs ? (tab === 'CULTO' ? cultos : videos) : cultos.length ? cultos : videos

  return (
    <div className="space-y-5 px-4 pt-5 lg:space-y-8 lg:px-8 lg:pt-10">
      <SectionTitle
        action={
          data?.channel_url ? (
            <a
              href={data.channel_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--sa)]"
            >
              Canal <ExternalLink className="h-4 w-4" />
            </a>
          ) : null
        }
      >
        Assistir
      </SectionTitle>

      {live ? (
        <div className="space-y-2">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
            <iframe
              title={live.title}
              src={`https://www.youtube-nocookie.com/embed/${live.id}?rel=0&playsinline=1`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
          <p className="flex items-center gap-2 font-semibold">
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
              ● AO VIVO
            </span>
            {live.title}
          </p>
        </div>
      ) : inService && data?.live_url ? (
        <a
          href={data.live_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-red-200 bg-white p-4"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600">
            <Radio className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{inService.label} acontecendo agora</span>
            <span className="block text-[13px] text-slate-500">Abrir a transmissão no YouTube</span>
          </span>
        </a>
      ) : null}

      {showTabs && (
        <div className="flex gap-2">
          {(
            [
              ['CULTO', 'Cultos'],
              ['VIDEO', 'Vídeos'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                'rounded-xl border px-3.5 py-1.5 text-sm font-semibold',
                tab === k
                  ? 'border-[var(--sp)] bg-[var(--sp)] text-[var(--sp-text)]'
                  : 'border-stone-200 bg-white text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-slate-500">
          Os vídeos não carregaram agora.{' '}
          {data?.channel_url && (
            <a
              href={data.channel_url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--sa)]"
            >
              Ver no YouTube
            </a>
          )}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {list.map((v) => (
              <VideoTile key={v.id} video={v} />
            ))}
          </div>
          <div className="hidden grid-cols-3 gap-6 lg:grid">
            {list.map((v) => (
              <VideoTile key={v.id} video={v} layout="card" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
