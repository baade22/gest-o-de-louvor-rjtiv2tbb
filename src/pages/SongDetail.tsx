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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  transposeCifraText,
  transposeNote,
  AVAILABLE_KEYS,
  getSemitoneDifference,
} from '@/lib/transposition'
import { useToast } from '@/hooks/use-toast'
import { YouTubeSearchModal } from '@/components/YouTubeSearchModal'
import {
  getVideosForSong,
  addVideoToSong,
  setPrimaryVideo,
  removeVideoFromSong,
} from '@/services/songVideos'
import { getYouTubeEmbedUrl, extractYouTubeVideoId, YouTubeSearchResult } from '@/services/youtube'
import {
  sendSongToHolyricsPlaylist,
  getHolyricsCommandStatus,
  type HolyricsMatchSong,
} from '@/services/holyricsAgent'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Radio, Send } from 'lucide-react'

export default function SongDetail() {
  const { id } = useParams<{ id: string }>()
  const { canManageContent, currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [song, setSong] = useState<Song | null>(null)
  const [videos, setVideos] = useState<SongVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modais e Holyrics
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false)
  const [isSendingToHolyrics, setIsSendingToHolyrics] = useState(false)
  const [holyricsCandidatesModal, setHolyricsCandidatesModal] = useState(false)
  const [holyricsCandidates, setHolyricsCandidates] = useState<HolyricsMatchSong[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [activeHolyricsAgentId, setActiveHolyricsAgentId] = useState<string | undefined>(undefined)

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

  // Enviar música para o Holyrics via LouvorFlow Agent com polling automático
  const handleSendToHolyrics = async (chosenId?: string) => {
    if (!song || !currentChurch) return
    setIsSendingToHolyrics(true)

    try {
      let res = await sendSongToHolyricsPlaylist({
        churchId: currentChurch.id,
        songId: song.id,
        agentId: activeHolyricsAgentId,
        chosenHolyricsId: chosenId,
      })

      // Se a resposta retornar pending=true e tiver command_id, faz polling automático a cada 2s até 30s
      if (res.pending && res.command_id) {
        toast({
          title: 'Enviando ao Holyrics...',
          description: 'Aguardando o computador da projeção executar a solicitação.',
        })

        const commandId = res.command_id
        const startTime = Date.now()
        let pollSuccess = false

        while (Date.now() - startTime < 30000) {
          await new Promise((resolve) => setTimeout(resolve, 2000))

          try {
            const statusRes = await getHolyricsCommandStatus(commandId)
            if (statusRes.status === 'DONE') {
              pollSuccess = true
              const cmdResult = statusRes.result || {}
              if (statusRes.action === 'ADD_TO_PLAYLIST') {
                res = {
                  success: true,
                  added: true,
                  message: `✓ Música "${song.title}" adicionada com sucesso à playlist do Holyrics!`,
                }
              } else if (statusRes.action === 'SEARCH_SONG') {
                const matches = Array.isArray(cmdResult.matches) ? cmdResult.matches : []
                if (matches.length === 0) {
                  res = {
                    success: false,
                    error_code: 'SONG_NOT_FOUND_IN_HOLYRICS',
                    message: `⚠️ Música não encontrada no Holyrics: "${song.title}". Cadastre ou importe a letra no programa Holyrics primeiro.`,
                  }
                } else if (matches.length === 1) {
                  // Se retornou 1 match no polling, prossegue adicionando automaticamente
                  const autoAddRes = await sendSongToHolyricsPlaylist({
                    churchId: currentChurch.id,
                    songId: song.id,
                    agentId: activeHolyricsAgentId,
                    chosenHolyricsId: String(matches[0].id),
                  })
                  res = autoAddRes
                } else {
                  res = {
                    success: true,
                    requires_selection: true,
                    matches: matches.map((m: any) => ({
                      id: String(m.id),
                      title: m.title || 'Sem título',
                      artist: m.artist || '',
                      key: m.key || '',
                      bpm: m.bpm || 0,
                    })),
                    matches_count: matches.length,
                    message: `Encontradas ${matches.length} músicas no Holyrics para "${song.title}". Selecione qual deseja enviar à playlist.`,
                  }
                }
              }
              break
            } else if (statusRes.status === 'FAILED') {
              pollSuccess = true
              res = {
                success: false,
                error: statusRes.error,
                message:
                  statusRes.error ||
                  'Comando falhou ao executar no Holyrics. Verifique permissões do API Server.',
              }
              break
            }
          } catch (_) {
            // Continua tentando até os 30s
          }
        }

        if (!pollSuccess) {
          toast({
            title: 'Tempo limite excedido',
            description:
              'O LouvorFlow Agent não retornou o resultado em 30s. Abra o painel local (http://localhost:8765) no computador do Holyrics, utilize o botão "Diagnosticar SearchSong" e certifique-se de que o aplicativo está rodando.',
            variant: 'destructive',
          })
          setIsSendingToHolyrics(false)
          return
        }
      }

      if (res.requires_selection && res.matches && res.matches.length > 1) {
        setHolyricsCandidates(res.matches)
        if (res.agent_id) setActiveHolyricsAgentId(res.agent_id)
        setSelectedCandidateId(res.matches[0].id)
        setHolyricsCandidatesModal(true)
        toast({
          title: 'Múltiplas músicas encontradas',
          description: `Selecione qual das ${res.matches.length} versões deseja enviar à playlist.`,
        })
        return
      }

      if (res.added || res.success) {
        toast({
          title: 'Sucesso!',
          description: res.message,
        })
        setHolyricsCandidatesModal(false)
      } else {
        toast({
          title:
            res.error_code === 'SONG_NOT_FOUND_IN_HOLYRICS'
              ? 'Música não encontrada'
              : 'Aviso Holyrics',
          description: res.message,
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar para Holyrics',
        description: err.message || 'Falha na comunicação com o LouvorFlow Agent.',
        variant: 'destructive',
      })
    } finally {
      setIsSendingToHolyrics(false)
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

        <div className="flex items-center gap-2">
          {canManageContent && (
            <Button
              variant="outline"
              size="sm"
              disabled={isSendingToHolyrics}
              onClick={() => handleSendToHolyrics()}
              className="rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-semibold gap-1.5"
              title="Envia a música diretamente para a playlist do Holyrics através do LouvorFlow Agent no computador de projeção"
            >
              <Radio
                className={`h-3.5 w-3.5 text-purple-600 ${isSendingToHolyrics ? 'animate-pulse' : ''}`}
              />
              {isSendingToHolyrics ? 'Enviando...' : 'Enviar para Holyrics'}
            </Button>
          )}

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
      {/* Exibe: "Tom original: G / Tom para visualizar: [ G ▼ ] [-] 0 [+]" de acordo com o requisito 7 */}
      <div className="sticky top-16 lg:top-0 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Seletor visual de tom + Stepper de Transposição */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span>Tom original:</span>
            <Badge
              variant="outline"
              className="font-extrabold text-xs px-2 py-0.5 bg-slate-50 text-slate-900 border-slate-300"
            >
              {song.key}
            </Badge>
          </div>

          <span className="text-slate-300 hidden sm:inline">/</span>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-teal-900">Tom para visualizar:</span>
            <Select
              value={currentKey}
              onValueChange={(newTargetKey) => {
                if (song?.key) {
                  const diff = getSemitoneDifference(song.key, newTargetKey)
                  setSemitones(diff)
                }
              }}
            >
              <SelectTrigger className="h-8 min-w-[70px] text-xs font-bold rounded-lg border-teal-300 bg-teal-50/50 text-teal-900">
                <SelectValue placeholder={currentKey} />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {AVAILABLE_KEYS.map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stepper [-] offset [+] */}
            <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 ml-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={semitones <= -11}
                onClick={() => handleTranspose(-1)}
                aria-label="Diminuir meio tom"
                className="h-7 w-7 rounded-lg hover:bg-white text-slate-700"
              >
                <Minus className="h-3 w-3" />
              </Button>

              <div className="px-2 min-w-[36px] text-center">
                <span className="text-xs font-extrabold text-slate-800">
                  {semitones > 0 ? `+${semitones}` : semitones}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                disabled={semitones >= 11}
                onClick={() => handleTranspose(1)}
                aria-label="Aumentar meio tom"
                className="h-7 w-7 rounded-lg hover:bg-white text-slate-700"
              >
                <Plus className="h-3 w-3" />
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

      {/* Modal de Múltiplos Resultados do Holyrics */}
      <Dialog open={holyricsCandidatesModal} onOpenChange={setHolyricsCandidatesModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Radio className="h-5 w-5 text-purple-700" />
              Selecionar Versão no Holyrics
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Foram encontradas {holyricsCandidates.length} correspondências para &quot;
              {song?.title}&quot; no acervo local do Holyrics. Selecione qual versão adicionar à
              playlist:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3 max-h-64 overflow-y-auto">
            {holyricsCandidates.map((candidate) => {
              const isSelected = selectedCandidateId === candidate.id
              return (
                <div
                  key={candidate.id}
                  onClick={() => setSelectedCandidateId(candidate.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-purple-600 bg-purple-50/70 text-purple-950 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-semibold">{candidate.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {candidate.artist ? `Artista: ${candidate.artist}` : 'Sem artista'}
                      {candidate.key ? ` • Tom: ${candidate.key}` : ''}
                    </p>
                  </div>
                  <div
                    className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setHolyricsCandidatesModal(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!selectedCandidateId || isSendingToHolyrics}
              onClick={() => {
                if (selectedCandidateId) handleSendToHolyrics(selectedCandidateId)
              }}
              className="rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {isSendingToHolyrics ? 'Enviando...' : 'Confirmar e Adicionar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
