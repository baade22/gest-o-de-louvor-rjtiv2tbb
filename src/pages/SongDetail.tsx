import React, { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { Song, SongVideo } from '@/types'
import {
  ArrowLeft,
  Music2,
  Clock,
  RotateCcw,
  Minus,
  Plus,
  Youtube,
  Edit,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Star,
  Trash2,
  Play,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { transposeCifraText, transposeNote } from '@/lib/transposition'
import { useToast } from '@/hooks/use-toast'
import { YouTubeSearchModal } from '@/components/YouTubeSearchModal'
import {
  getVideosForSong,
  addVideoToSong,
  setPrimaryVideo,
  removeVideoFromSong,
} from '@/services/songVideos'
import { getYouTubeEmbedUrl, extractYouTubeVideoId, YouTubeSearchResult } from '@/services/youtube'

export default function SongDetail() {
  const { id } = useParams<{ id: string }>()
  const { canManageContent, currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [song, setSong] = useState<Song | null>(null)
  const [videos, setVideos] = useState<SongVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modais
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false)

  // Controles de visualização em ensaio / mobile
  const [semitones, setSemitones] = useState(0) // de -11 a +11
  const [fontSize, setFontSize] = useState<number>(15) // em px: 12 a 24
  const [showNotes, setShowNotes] = useState(true)
  const [activeTab, setActiveTab] = useState<'chords' | 'lyrics'>('chords')
  const [activePlaybackVideoId, setActivePlaybackVideoId] = useState<string | null>(null)

  const fetchSongData = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const data = await pb.collection('songs').getOne<Song>(id)
      setSong(data)

      // Carrega os vídeos associados da tabela song_videos
      const songVideos = await getVideosForSong(id)
      setVideos(songVideos)

      // Se temos vídeos, o inicial para reprodução é o primário ou o primeiro
      const primary = songVideos.find((v) => v.is_primary) || songVideos[0]
      if (primary) {
        setActivePlaybackVideoId(primary.youtube_video_id)
      } else if (data.youtube_url) {
        const fallbackId = extractYouTubeVideoId(data.youtube_url)
        setActivePlaybackVideoId(fallbackId)
      }

      // Se a música só tem letra e não tem cifra, chaveia para a aba de letra
      const chordsContent = data.chords || data.raw_content
      if (!chordsContent && data.lyrics) {
        setActiveTab('lyrics')
      }
    } catch (err) {
      console.error(err)
      toast({
        title: 'Música não encontrada',
        description: 'A música solicitada não foi localizada.',
        variant: 'destructive',
      })
      navigate('/songs')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSongData()
  }, [id])

  // Tom calculado com base no offset de semitons (-11 a +11)
  const currentKey = useMemo(() => {
    if (!song?.key) return ''
    if (semitones === 0) return song.key
    return transposeNote(song.key, semitones)
  }, [song?.key, semitones])

  // Conteúdo de cifra efetivo (suporta legado e novo)
  const rawChordsToRender = useMemo(() => {
    if (song?.chords) return song.chords
    if (song?.raw_content) return song.raw_content
    return ''
  }, [song?.chords, song?.raw_content])

  // Cifra transposta em memória instantaneamente (display-only, sem mutar o banco)
  const transposedChords = useMemo(() => {
    if (!rawChordsToRender) return ''
    if (semitones === 0) return rawChordsToRender
    return transposeCifraText(rawChordsToRender, semitones)
  }, [rawChordsToRender, semitones])

  // Vídeo primário
  const primaryVideo = useMemo(() => {
    return videos.find((v) => v.is_primary) || (videos.length > 0 ? videos[0] : null)
  }, [videos])

  // URL do player atualmente ativo
  const currentEmbedUrl = useMemo(() => {
    const targetId = activePlaybackVideoId || primaryVideo?.youtube_video_id
    if (!targetId) return null
    return getYouTubeEmbedUrl(targetId)
  }, [activePlaybackVideoId, primaryVideo])

  const handleTranspose = (delta: number) => {
    setSemitones((prev) => {
      const next = prev + delta
      if (next > 11) return 11
      if (next < -11) return -11
      return next
    })
  }

  const handleResetTranspose = () => {
    setSemitones(0)
  }

  // Ação ao selecionar vídeo na busca do YouTube
  const handleSelectNewVideo = async (video: YouTubeSearchResult) => {
    if (!song || !currentChurch) return
    try {
      const created = await addVideoToSong({
        church_id: currentChurch.id,
        song_id: song.id,
        youtube_video_id: video.videoId,
        title: video.title,
        channel_name: video.channelTitle,
        thumbnail_url: video.thumbnail,
        is_primary: true,
      })

      setActivePlaybackVideoId(video.videoId)
      toast({
        title: 'Vídeo adicionado e definido como principal!',
        description: `"${video.title}" agora é o vídeo de referência.`,
      })
      fetchSongData()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao adicionar vídeo',
        description: err.message || 'Não foi possível salvar o vídeo.',
        variant: 'destructive',
      })
    }
  }

  const handleSetPrimary = async (videoId: string) => {
    if (!song) return
    try {
      await setPrimaryVideo(song.id, videoId)
      const target = videos.find((v) => v.id === videoId)
      if (target) {
        setActivePlaybackVideoId(target.youtube_video_id)
      }
      toast({
        title: 'Vídeo principal atualizado',
      })
      fetchSongData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleRemoveVideo = async (videoId: string) => {
    if (!song) return
    if (!window.confirm('Remover este vídeo de referência da música?')) return
    try {
      await removeVideoFromSong(song.id, videoId)
      toast({
        title: 'Vídeo removido',
      })
      fetchSongData()
    } catch (err) {
      console.error(err)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (!song) return null

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-20">
      {/* Back button & Admin Actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/songs"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Repertório
        </Link>

        {canManageContent && (
          <Link to={`/songs/${song.id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 hover:bg-slate-50 text-xs font-semibold gap-1.5"
            >
              <Edit className="h-3.5 w-3.5" />
              Editar Música
            </Button>
          </Link>
        )}
      </div>

      {/* FEATURE 5: LAYOUT MOBILE-FIRST - Song Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🎵</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {song.title}
              </h1>
            </div>
            <p className="text-sm font-medium text-slate-600 mt-1">
              {song.artist}
              {song.composer && (
                <span className="text-slate-400 font-normal"> • Comp: {song.composer}</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-teal-50 text-teal-900 border-teal-200 hover:bg-teal-100 font-bold px-3 py-1 text-sm rounded-xl">
              Tom Orig: {song.key}
            </Badge>

            {song.bpm && (
              <Badge
                variant="outline"
                className="bg-slate-50 text-slate-700 border-slate-200 font-semibold px-3 py-1 text-xs rounded-xl flex items-center gap-1.5"
              >
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {song.bpm} BPM
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Observações / Arranjo ministerial (se houver) */}
      {song.notes && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center justify-between w-full text-left text-xs font-bold text-amber-900 uppercase tracking-wider"
          >
            <span>Observações de Arranjo & Dinâmica</span>
            {showNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showNotes && (
            <p className="mt-2 text-xs sm:text-sm text-amber-800 leading-relaxed whitespace-pre-line">
              {song.notes}
            </p>
          )}
        </div>
      )}

      {/* FEATURE 3 & 5: VÍDEO PRINCIPAL PLAYER + TROCAR VÍDEO + LISTA DE VÍDEOS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
              <Youtube className="h-4 w-4" />
              Vídeo Principal
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              Player integrado oficial para ensaios e conferência de arranjo
            </p>
          </div>

          {canManageContent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setYoutubeModalOpen(true)}
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold gap-1.5 self-start sm:self-auto"
            >
              <Youtube className="h-3.5 w-3.5" />🔎 Trocar ou adicionar vídeo
            </Button>
          )}
        </div>

        {/* Player Iframe Oficial Embed */}
        {currentEmbedUrl ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-950 shadow-inner">
            <iframe
              src={currentEmbedUrl}
              title={`Vídeo de ${song.title}`}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="py-10 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
            <Youtube className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="text-xs font-semibold text-slate-700">
              Nenhum vídeo vinculado a esta música.
            </p>
            {canManageContent && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setYoutubeModalOpen(true)}
                className="mt-3 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs"
              >
                Pesquisar vídeo no YouTube
              </Button>
            )}
          </div>
        )}

        {/* Lista de vídeos de referência (múltiplos vídeos) */}
        {videos.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              Vídeos de Referência ({videos.length}):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {videos.map((vid) => {
                const isSelectedForPlay = activePlaybackVideoId === vid.youtube_video_id
                return (
                  <div
                    key={vid.id}
                    className={`flex items-center justify-between gap-2.5 p-2 rounded-xl border transition-all ${
                      isSelectedForPlay
                        ? 'border-red-300 bg-red-50/40'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={vid.thumbnail_url}
                        alt={vid.title || 'Vídeo'}
                        className="h-10 w-14 object-cover rounded-lg shrink-0 bg-slate-900"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {vid.title || 'Vídeo'}
                          </p>
                          {vid.is_primary && (
                            <span
                              title="Vídeo Principal"
                              className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0"
                            >
                              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                              Principal
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {vid.channel_name || 'YouTube'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setActivePlaybackVideoId(vid.youtube_video_id)}
                        title="Tocar no player"
                        aria-label="Tocar no player"
                        className="h-7 w-7 rounded-lg text-slate-600 hover:text-red-600 hover:bg-white"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>

                      <a
                        href={`https://www.youtube.com/watch?v=${vid.youtube_video_id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir no YouTube"
                        aria-label="Abrir no YouTube"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>

                      {canManageContent && (
                        <>
                          {!vid.is_primary && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSetPrimary(vid.id)}
                              title="Definir como principal"
                              aria-label="Definir como principal"
                              className="h-7 w-7 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-white"
                            >
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveVideo(vid.id)}
                            title="Remover vídeo"
                            aria-label="Remover vídeo"
                            className="h-7 w-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* FEATURE 2: FONTE CIFRA CLUB (se houver url salva) */}
      {song.cifra_club_url && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-orange-50/80 border border-orange-200">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-orange-950 uppercase tracking-wider">
              Fonte de Referência:
            </span>
            <span className="text-xs font-semibold text-orange-800">Cifra Club</span>
          </div>

          <a
            href={song.cifra_club_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            <span>Abrir referência</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* CONTROLES DE TRANSPOSIÇÃO E FONTE (Sticky mobile-first para ensaios) */}
      <div className="sticky top-16 lg:top-0 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Stepper de Transposição */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
            Transposição:
          </span>

          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
            <Button
              variant="ghost"
              size="icon"
              disabled={semitones <= -11}
              onClick={() => handleTranspose(-1)}
              aria-label="Diminuir meio tom"
              className="h-8 w-8 rounded-lg hover:bg-white text-slate-700"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>

            <div className="px-3 min-w-[90px] text-center">
              <span className="text-xs font-bold text-teal-800">
                Tom: <strong className="text-sm font-extrabold">{currentKey}</strong>
              </span>
              {semitones !== 0 && (
                <span className="text-[10px] text-slate-500 block leading-none">
                  {semitones > 0 ? `+${semitones}` : semitones} semitons
                </span>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              disabled={semitones >= 11}
              onClick={() => handleTranspose(1)}
              aria-label="Aumentar meio tom"
              className="h-8 w-8 rounded-lg hover:bg-white text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {semitones !== 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResetTranspose}
              aria-label="Restaurar tom original"
              title="Restaurar tom original"
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Stepper de Tamanho de Fonte (A- / A+) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
            <Button
              variant="ghost"
              size="sm"
              disabled={fontSize <= 12}
              onClick={() => setFontSize((s) => Math.max(12, s - 1))}
              aria-label="Diminuir tamanho da fonte"
              className="h-8 px-2 text-xs font-bold rounded-lg hover:bg-white text-slate-700"
            >
              A−
            </Button>
            <span className="px-2 text-xs font-medium text-slate-500">{fontSize}px</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={fontSize >= 24}
              onClick={() => setFontSize((s) => Math.min(24, s + 1))}
              aria-label="Aumentar tamanho da fonte"
              className="h-8 px-2 text-xs font-bold rounded-lg hover:bg-white text-slate-700"
            >
              A+
            </Button>
          </div>
        </div>
      </div>

      {/* FEATURE 5: ABAS CONTEÚDO [ Letra + Cifra ] / [ Somente letra ] */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'chords' | 'lyrics')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="chords" className="rounded-lg text-xs font-bold py-2">
            Letra + Cifra ({currentKey})
          </TabsTrigger>
          <TabsTrigger value="lyrics" className="rounded-lg text-xs font-bold py-2">
            Somente Letra
          </TabsTrigger>
        </TabsList>

        {/* Conteúdo da Cifra */}
        <TabsContent value="chords" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-xs overflow-x-auto">
            {transposedChords ? (
              <pre
                style={{ fontSize: `${fontSize}px` }}
                className="font-mono text-slate-900 leading-relaxed whitespace-pre font-normal select-text selection:bg-teal-100"
              >
                {transposedChords}
              </pre>
            ) : (
              <div className="py-12 text-center text-slate-400">
                <Music2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">Nenhuma cifra cadastrada para esta música.</p>
                {canManageContent && (
                  <Link to={`/songs/${song.id}/edit`}>
                    <Button variant="link" size="sm" className="text-teal-700 text-xs mt-1">
                      Adicionar cifra agora
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Conteúdo da Letra */}
        <TabsContent value="lyrics" className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-xs">
            {song.lyrics ? (
              <div
                style={{ fontSize: `${fontSize}px` }}
                className="text-slate-800 leading-loose whitespace-pre-line font-medium"
              >
                {song.lyrics}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400">
                <p className="text-sm font-medium">Nenhuma letra cadastrada para esta música.</p>
                {canManageContent && (
                  <Link to={`/songs/${song.id}/edit`}>
                    <Button variant="link" size="sm" className="text-teal-700 text-xs mt-1">
                      Adicionar letra
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal YouTube para adicionar / trocar vídeos */}
      <YouTubeSearchModal
        open={youtubeModalOpen}
        onOpenChange={setYoutubeModalOpen}
        initialQuery={[song.title, song.artist].filter(Boolean).join(' ')}
        onSelectVideo={handleSelectNewVideo}
      />
    </div>
  )
}
