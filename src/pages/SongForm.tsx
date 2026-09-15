import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { Song } from '@/types'
import {
  Music2,
  ArrowLeft,
  Save,
  Youtube,
  Sparkles,
  Search,
  ExternalLink,
  CheckCircle2,
  FileCode2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { AVAILABLE_KEYS } from '@/lib/transposition'
import { parseSongContent } from '@/lib/songParser'
import { CifraClubSearchModal } from '@/components/CifraClubSearchModal'
import { YouTubeSearchModal } from '@/components/YouTubeSearchModal'
import { addVideoToSong, getVideosForSong } from '@/services/songVideos'
import type { YouTubeSearchResult } from '@/services/youtube'

export default function SongForm() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const { currentChurch } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Modais auxiliares
  const [cifraClubModalOpen, setCifraClubModalOpen] = useState(false)
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false)

  // Dados do formulário
  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    composer: '',
    key: 'G',
    bpm: '',
    youtube_url: '',
    raw_content: '',
    lyrics: '',
    chords: '',
    cifra_club_url: '',
    source: 'MANUAL',
    notes: '',
  })

  // Vídeo selecionado no YouTube para persistir após salvar
  const [pendingVideo, setPendingVideo] = useState<YouTubeSearchResult | null>(null)

  // Aba ativa de visualização pós-processamento
  const [contentPreviewTab, setContentPreviewTab] = useState<'chords' | 'lyrics'>('chords')

  useEffect(() => {
    if (isEditing && id) {
      const fetchSong = async () => {
        try {
          const song = await pb.collection('songs').getOne<Song>(id)
          setFormData({
            title: song.title || '',
            artist: song.artist || '',
            composer: song.composer || '',
            key: song.key || 'G',
            bpm: song.bpm ? String(song.bpm) : '',
            youtube_url: song.youtube_url || '',
            raw_content: song.raw_content || song.chords || song.lyrics || '',
            lyrics: song.lyrics || '',
            chords: song.chords || '',
            cifra_club_url: song.cifra_club_url || '',
            source: song.source || 'MANUAL',
            notes: song.notes || '',
          })
        } catch (err) {
          console.error(err)
          toast({
            title: 'Erro ao carregar música',
            description: 'Não foi possível encontrar os dados desta música.',
            variant: 'destructive',
          })
          navigate('/songs')
        } finally {
          setIsLoading(false)
        }
      }
      fetchSong()
    }
  }, [id, isEditing])

  // Processa o campo único deterministicamente
  const handleProcessContent = () => {
    if (!formData.raw_content.trim()) {
      toast({
        title: 'Conteúdo vazio',
        description: 'Cole ou digite a letra e acordes no campo antes de processar.',
        variant: 'destructive',
      })
      return
    }

    const parsed = parseSongContent(formData.raw_content)
    setFormData((prev) => ({
      ...prev,
      chords: parsed.chords,
      lyrics: parsed.lyrics,
    }))

    toast({
      title: 'Conteúdo processado com sucesso!',
      description: 'Letra + Cifra e Somente Letra geradas. Você pode ajustar manualmente abaixo.',
    })
  }

  // Recebe dados da referência do Cifra Club
  const handleApplyCifraClubReference = (data: {
    cifraClubUrl: string
    title?: string
    artist?: string
  }) => {
    setFormData((prev) => ({
      ...prev,
      cifra_club_url: data.cifraClubUrl || prev.cifra_club_url,
      title: data.title || prev.title,
      artist: data.artist || prev.artist,
      source: 'CIFRA_CLUB',
    }))

    toast({
      title: 'Referência do Cifra Club salva!',
      description:
        'Agora cole o texto copiado no campo "Conteúdo da música" e clique em "Processar conteúdo".',
    })
  }

  // Recebe vídeo selecionado no YouTube
  const handleSelectYouTubeVideo = (video: YouTubeSearchResult) => {
    setPendingVideo(video)
    setFormData((prev) => ({
      ...prev,
      youtube_url: video.videoUrl,
    }))
    toast({
      title: 'Vídeo selecionado!',
      description: `"${video.title}" será vinculado a esta música.`,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch) return

    if (!formData.title.trim() || !formData.artist.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, informe ao menos o título e o artista/ministério.',
        variant: 'destructive',
      })
      return
    }

    // Se o usuário digitou raw_content mas não clicou em processar, processa automaticamente
    let finalChords = formData.chords
    let finalLyrics = formData.lyrics
    if (formData.raw_content.trim() && (!finalChords || !finalLyrics)) {
      const autoParsed = parseSongContent(formData.raw_content)
      finalChords = finalChords || autoParsed.chords
      finalLyrics = finalLyrics || autoParsed.lyrics
    }

    setIsSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        church_id: currentChurch.id,
        title: formData.title.trim(),
        artist: formData.artist.trim(),
        composer: formData.composer.trim() || null,
        key: formData.key,
        bpm: formData.bpm ? parseInt(formData.bpm, 10) : null,
        youtube_url: formData.youtube_url.trim() || null,
        raw_content: formData.raw_content.trim() || null,
        lyrics: finalLyrics || null,
        chords: finalChords || null,
        cifra_club_url: formData.cifra_club_url.trim() || null,
        source: formData.source || 'MANUAL',
        notes: formData.notes.trim() || null,
      }

      let songId = id
      if (isEditing && id) {
        await pb.collection('songs').update(id, payload)
        toast({
          title: 'Música atualizada',
          description: 'As alterações foram salvas no repertório.',
        })
      } else {
        const created = await pb.collection('songs').create(payload)
        songId = created.id
        toast({
          title: 'Música cadastrada!',
          description: 'A nova música já está disponível no acervo da igreja.',
        })
      }

      // Se temos um pendingVideo do YouTube ou youtube_url informada, salva na tabela song_videos
      if (songId) {
        if (pendingVideo) {
          try {
            await addVideoToSong({
              church_id: currentChurch.id,
              song_id: songId,
              youtube_video_id: pendingVideo.videoId,
              title: pendingVideo.title,
              channel_name: pendingVideo.channelTitle,
              thumbnail_url: pendingVideo.thumbnail,
              is_primary: true,
            })
          } catch (err) {
            console.error('Erro ao vincular vídeo:', err)
          }
        } else if (formData.youtube_url.trim()) {
          // Se o usuário colou URL manual sem passar pelo modal
          try {
            const existingVideos = await getVideosForSong(songId)
            if (existingVideos.length === 0) {
              await addVideoToSong({
                church_id: currentChurch.id,
                song_id: songId,
                youtube_video_id: formData.youtube_url.trim(),
                title: `${formData.title} (Referência)`,
                channel_name: formData.artist,
                is_primary: true,
              })
            }
          } catch {
            /* intentionally ignored */
          }
        }
      }

      navigate(`/songs/${songId}`)
    } catch (err) {
      console.error('Erro ao salvar música:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Ocorreu um erro ao persistir as informações.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/songs"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Músicas
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isEditing ? 'Editar Música' : 'Nova Música para o Repertório'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Cole o conteúdo unificado (letra com acordes entre colchetes) e clique em Processar.
            </p>
          </div>

          {/* Botões de atalho: Cifra Club e YouTube */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCifraClubModalOpen(true)}
              className="rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50 text-xs font-semibold gap-1.5"
            >
              <Search className="h-3.5 w-3.5" />
              Pesquisar no Cifra Club
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setYoutubeModalOpen(true)}
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold gap-1.5"
            >
              <Youtube className="h-3.5 w-3.5" />
              Pesquisar no YouTube
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Metadados Básicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title" className="text-xs font-semibold text-slate-700">
                Título da Música <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Bondade de Deus, Oceanos, Graça Sublime..."
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="artist" className="text-xs font-semibold text-slate-700">
                Artista / Ministério de Louvor <span className="text-red-500">*</span>
              </Label>
              <Input
                id="artist"
                value={formData.artist}
                onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                placeholder="Ex: Isaías Saad, Fernandinho, Hillsong..."
                className="rounded-xl border-slate-200"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="composer" className="text-xs font-semibold text-slate-700">
                Compositor (opcional)
              </Label>
              <Input
                id="composer"
                value={formData.composer}
                onChange={(e) => setFormData({ ...formData, composer: e.target.value })}
                placeholder="Ex: Chris Tomlin, Ed Cash..."
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key" className="text-xs font-semibold text-slate-700">
                Tom Original / Referência <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.key}
                onValueChange={(val) => setFormData({ ...formData, key: val })}
              >
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Selecione o tom" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bpm" className="text-xs font-semibold text-slate-700">
                BPM (Andamento)
              </Label>
              <Input
                id="bpm"
                type="number"
                min="30"
                max="250"
                value={formData.bpm}
                onChange={(e) => setFormData({ ...formData, bpm: e.target.value })}
                placeholder="Ex: 72"
                className="rounded-xl border-slate-200"
              />
            </div>

            {/* Link do YouTube com atalho de busca */}
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="youtube"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <Youtube className="h-4 w-4 text-red-500" />
                  Vídeo de Referência no YouTube
                </Label>
                <button
                  type="button"
                  onClick={() => setYoutubeModalOpen(true)}
                  className="text-[11px] font-semibold text-red-600 hover:text-red-700 underline"
                >
                  🔎 Pesquisar com API
                </button>
              </div>
              <Input
                id="youtube"
                type="url"
                value={formData.youtube_url}
                onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
                className="rounded-xl border-slate-200"
              />
              {pendingVideo && (
                <p className="text-[11px] text-teal-700 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Vídeo selecionado via busca: {pendingVideo.title} ({pendingVideo.channelTitle})
                </p>
              )}
            </div>

            {/* Referência do Cifra Club (se preenchida) */}
            {formData.cifra_club_url && (
              <div className="space-y-1.5 sm:col-span-2 p-3 rounded-xl bg-orange-50/60 border border-orange-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-orange-900 flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5 text-orange-600" />
                    URL de Referência do Cifra Club:
                  </span>
                  <a
                    href={formData.cifra_club_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-orange-700 underline font-medium"
                  >
                    Abrir link
                  </a>
                </div>
                <Input
                  value={formData.cifra_club_url}
                  onChange={(e) => setFormData({ ...formData, cifra_club_url: e.target.value })}
                  placeholder="https://www.cifraclub.com.br/..."
                  className="h-8 text-xs rounded-lg bg-white border-orange-200"
                />
              </div>
            )}
          </div>

          {/* FEATURE 1: CAMPO ÚNICO DE ENTRADA "Conteúdo da música" + BOTÃO PROCESSAR */}
          <div className="p-4 sm:p-5 rounded-2xl bg-teal-50/50 border border-teal-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <Label
                  htmlFor="raw_content"
                  className="text-sm font-bold text-teal-950 flex items-center gap-1.5"
                >
                  <FileCode2 className="h-4 w-4 text-teal-700" />
                  Conteúdo da música (Entrada única de Letra + Cifra)
                </Label>
                <p className="text-[11px] text-teal-800 mt-0.5">
                  Cole todo o conteúdo com acordes entre colchetes ou linhas de cifra sobrepostas.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleProcessContent}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs gap-1.5 shadow-sm shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Processar conteúdo
              </Button>
            </div>

            <Textarea
              id="raw_content"
              rows={10}
              value={formData.raw_content}
              onChange={(e) => setFormData({ ...formData, raw_content: e.target.value })}
              placeholder={`Exemplo de entrada com acordes inline:\n[INTRO]\n[G] [D/F#] [Em7] [C]\n\n[VERSO]\n[G] Tu és bom, ó Deus\n[Em] Tua graça me alcançou\n[C] Nunca me abandonou\n\n[REFRÃO]\n[G] Aleluia, Te adoramos [D/F#]\n[C] Santo és Tu`}
              className="font-mono text-xs rounded-xl border-teal-200 bg-white leading-relaxed text-slate-800"
            />
          </div>

          {/* SAÍDAS PROCESSADAS (Permitem edição manual após processamento) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Resultado do Processamento (Editável manualmente)
              </span>
              <span className="text-[11px] text-slate-400">Seus acordes nunca são perdidos</span>
            </div>

            <Tabs
              value={contentPreviewTab}
              onValueChange={(v) => setContentPreviewTab(v as 'chords' | 'lyrics')}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1">
                <TabsTrigger value="chords" className="rounded-lg text-xs font-bold py-2">
                  (A) Letra + Cifra
                </TabsTrigger>
                <TabsTrigger value="lyrics" className="rounded-lg text-xs font-bold py-2">
                  (B) Somente Letra
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chords" className="mt-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="chords" className="text-xs font-semibold text-slate-700">
                      Letra + Cifra (com acordes e seções para o time musical)
                    </Label>
                    <span className="text-[10px] text-teal-700 font-medium">
                      Aceita transposição ao vivo
                    </span>
                  </div>
                  <Textarea
                    id="chords"
                    rows={12}
                    value={formData.chords}
                    onChange={(e) => setFormData({ ...formData, chords: e.target.value })}
                    placeholder="Conteúdo gerado com letra e cifras..."
                    className="font-mono text-xs rounded-xl border-slate-200 leading-relaxed bg-white"
                  />
                </div>
              </TabsContent>

              <TabsContent value="lyrics" className="mt-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="lyrics" className="text-xs font-semibold text-slate-700">
                      Somente Letra (sem cifras, ideal para projeção e vocal)
                    </Label>
                    <span className="text-[10px] text-slate-400">
                      Cifras removidas automaticamente
                    </span>
                  </div>
                  <Textarea
                    id="lyrics"
                    rows={12}
                    value={formData.lyrics}
                    onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
                    placeholder="Conteúdo gerado contendo somente estrofes e refrão..."
                    className="text-xs rounded-xl border-slate-200 leading-relaxed bg-white"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Observações de Arranjo */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
              Observações & Arranjo (opcional)
            </Label>
            <Textarea
              id="notes"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Ex: Começar suave no piano, bateria entra no refrão 2, ministração espontânea na ponte..."
              className="text-xs rounded-xl border-slate-200"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Link to="/songs">
              <Button type="button" variant="outline" className="rounded-xl">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold gap-2"
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Cadastrar Música'}
            </Button>
          </div>
        </form>
      </div>

      {/* Modais */}
      <CifraClubSearchModal
        open={cifraClubModalOpen}
        onOpenChange={setCifraClubModalOpen}
        initialSongTitle={formData.title}
        initialArtist={formData.artist}
        onApplyReference={handleApplyCifraClubReference}
      />

      <YouTubeSearchModal
        open={youtubeModalOpen}
        onOpenChange={setYoutubeModalOpen}
        initialQuery={[formData.title, formData.artist].filter(Boolean).join(' ')}
        onSelectVideo={handleSelectYouTubeVideo}
      />
    </div>
  )
}
