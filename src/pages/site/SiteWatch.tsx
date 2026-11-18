// Assistir: cultos transmitidos e vídeos do canal do YouTube da igreja (entram sozinhos).

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Play, Radio } from 'lucide-react'
import { serviceNow } from '@/lib/site'
import { getSiteVideos, type SiteVideo, type SiteVideos } from '@/services/site'
import { useSite } from './siteContext'
import { PageTitle, Pills, VideoTile } from './siteParts'

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
    <div className="space-y-4 px-4 pt-2 lg:space-y-8 lg:px-8 lg:pt-10">
      <PageTitle
        action={
          data?.channel_url ? (
            <a
              href={data.channel_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2.5 text-[13px] font-bold text-[var(--c-navy)]"
            >
              Canal <ExternalLink className="h-4 w-4" />
            </a>
          ) : null
        }
      >
        Assistir
      </PageTitle>

      {live ? (
        <div className="space-y-2">
          <div className="relative [aspect-ratio:16/9] overflow-hidden rounded-3xl bg-black">
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
          className="c-card flex items-center gap-3 p-4"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600">
            <Radio className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{inService.label} acontecendo agora</span>
            <span className="block text-[13px] font-medium text-[var(--c-gray)]">
              Abrir a transmissão no YouTube
            </span>
          </span>
        </a>
      ) : null}

      {showTabs && (
        <Pills
          value={tab}
          onChange={setTab}
          options={[
            ['CULTO', 'Cultos'],
            ['VIDEO', 'Mensagens'],
          ]}
        />
      )}

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : list.length === 0 ? (
        <p className="c-card p-8 text-center font-medium text-[var(--c-gray)]">
          Os vídeos não carregaram agora.{' '}
          {data?.channel_url && (
            <a
              href={data.channel_url}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[var(--c-blue)]"
            >
              Ver no YouTube
            </a>
          )}
        </p>
      ) : (
        <>
          {!live && <FeaturedVideo key={list[0].id} video={list[0]} />}
          {!live && list.length > 1 && (
            <h2 className="pt-2 text-[18px] font-extrabold tracking-tight lg:hidden">
              Mais recentes
            </h2>
          )}
          <div className="grid grid-cols-1 gap-2.5 lg:hidden">
            {(live ? list : list.slice(1)).map((v) => (
              <VideoTile key={v.id} video={v} />
            ))}
          </div>
          <div className="hidden grid-cols-3 gap-6 lg:grid">
            {(live ? list : list.slice(1)).map((v) => (
              <VideoTile key={v.id} video={v} layout="card" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Vídeo mais recente em destaque (foto grande com botão de play); toca no lugar. */
function FeaturedVideo({ video }: { video: SiteVideo }) {
  const [playing, setPlaying] = useState(false)
  if (playing) {
    return (
      <div className="[aspect-ratio:16/9] w-full overflow-hidden rounded-3xl bg-black">
        <iframe
          title={video.title}
          src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="relative block h-[210px] w-full overflow-hidden rounded-3xl text-left text-white lg:[aspect-ratio:21/9] lg:h-auto"
    >
      <img
        src={`https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`}
        onError={(e) => {
          const img = e.currentTarget
          const low = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
          if (img.src !== low) img.src = low
        }}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[color-mix(in_srgb,var(--sp)_92%,transparent)]" />
      <span className="absolute left-1/2 top-[42%] grid h-[58px] w-[58px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[var(--c-navy)]">
        <Play className="ml-1 h-[22px] w-[22px] fill-current" />
      </span>
      <span className="absolute inset-x-4 bottom-3.5">
        <span className="inline-block rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[12px] font-bold backdrop-blur">
          {video.kind === 'CULTO' ? 'Último culto' : 'Mais recente'}
          {video.when ? ` · ${video.when}` : ''}
        </span>
        <span className="mt-2 line-clamp-2 block text-[19px] font-extrabold leading-tight">
          {video.title}
        </span>
      </span>
    </button>
  )
}
